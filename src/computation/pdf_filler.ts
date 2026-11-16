// Browser-side PDF filling using pdf-lib
// Port of taxes1040/pipeline/make_pdf_output.py + utils/forms_utils.py

import { PDFDocument, PDFCheckBox, PDFTextField, PDFRef } from 'pdf-lib';
import type { PDFField } from 'pdf-lib';
import type { FillTaxesResult } from './fill_taxes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

interface KeyEntry {
  humanName: string;
  annotName: string;
  fieldType: string; // '/Tx' or '/Btn'
}

export function parseKeysFile(text: string): Map<string, KeyEntry> {
  const map = new Map<string, KeyEntry>();
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split(/[\t]+/);
    if (parts.length < 3) continue;
    const humanName = parts[0].trim();
    const annotName = parts[1].trim();
    const fieldType = parts[2].trim();
    // Map human-readable name -> annot field name + type
    map.set(humanName, { humanName, annotName, fieldType });
  }
  return map;
}

// Decode the hex-encoded annotation field name from .keys to the actual PDF field name
// The hex is UTF-16BE: FEFF0066... -> decode pairs of bytes after BOM
function decodeAnnotName(hex: string): string {
  if (!hex.startsWith('FEFF')) return hex;
  const bytes = hex.slice(4); // skip BOM
  let result = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const code = parseInt(bytes.slice(i, i + 4), 16);
    result += String.fromCharCode(code);
  }
  return result;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) return '';
  return res.text();
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.arrayBuffer();
}

const BASE = import.meta.env.BASE_URL;

/** .keys annotation column: hex-encoded name, with a '#N' suffix on the N-th widget sharing that name. */
export function parseAnnotKey(annotName: string): string {
  const [hex, occurrence] = annotName.split('#');
  return `${decodeAnnotName(hex)}#${occurrence ?? '1'}`;
}

interface WidgetSlot {
  field: PDFField;
  key: string; // '<short name>#<occurrence>', occurrences counted in page order (like pdfrw)
}

/** Every widget of every field, keyed like the .keys files: widgets are walked in page / annotation order
 * and repeats of the same short name get '#2', '#3', ... (taxes1040 utils/forms_utils.py iter_widgets). */
export function widgetSlots(pdfDoc: PDFDocument, fields: PDFField[]): WidgetSlot[] {
  const order = new Map<PDFRef, number>();
  let position = 0;
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    for (let index = 0; index < (annots?.size() ?? 0); index++) {
      const ref = annots!.get(index);
      if (ref instanceof PDFRef) order.set(ref, position++);
    }
  }
  const widgets: { field: PDFField; name: string; position: number }[] = [];
  for (const field of fields) {
    const fullName = field.getName();
    // pdf-lib returns XFA paths like "topmostSubform[0].Page1[0].f1_14[0]"; .keys use the last segment
    const name = fullName.split('.').pop()!;
    for (const widget of field.acroField.getWidgets()) {
      const ref = pdfDoc.context.getObjectRef(widget.dict);
      widgets.push({ field, name, position: ref ? order.get(ref) ?? Infinity : Infinity });
    }
  }
  widgets.sort((first, second) => first.position - second.position);
  const seen = new Map<string, number>();
  return widgets.map(({ field, name }) => {
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    return { field, key: `${name}#${occurrence}` };
  });
}

function formatText(value: string | boolean | number): string {
  if (typeof value === 'number') {
    return value === Math.round(value) ? String(Math.round(value)) : value.toFixed(2);
  }
  return String(value);
}

async function fillOnePdf(
  formsYear: string,
  formKey: string,
  contents: D,
): Promise<Uint8Array | null> {
  // formKey is like 'Federal/f1040' or 'ny/it201_fill_in'
  const keysText = await fetchText(`${BASE}forms/${formsYear}/${formKey}.keys`);
  if (!keysText) return null; // no .keys file for this form

  // annotation key -> value
  const annotToValue = new Map<string, string | boolean | number>();
  for (const [humanName, entry] of parseKeysFile(keysText)) {
    if (humanName in contents) annotToValue.set(parseAnnotKey(entry.annotName), contents[humanName]);
  }
  if (annotToValue.size === 0) return null;

  const pdfDoc = await PDFDocument.load(await fetchBytes(`${BASE}forms/${formsYear}/${formKey}.pdf`));
  const pdfForm = pdfDoc.getForm();

  // group the targeted widgets by field
  const fieldValues = new Map<PDFField, { widgetIndex: number; value: string | boolean | number }[]>();
  const widgetIndex = new Map<PDFField, number>();
  for (const { field, key } of widgetSlots(pdfDoc, pdfForm.getFields())) {
    const index = widgetIndex.get(field) ?? 0;
    widgetIndex.set(field, index + 1);
    if (!annotToValue.has(key)) continue;
    if (!fieldValues.has(field)) fieldValues.set(field, []);
    fieldValues.get(field)!.push({ widgetIndex: index, value: annotToValue.get(key)! });
  }

  for (const [field, values] of fieldValues) {
    if (field instanceof PDFTextField) {
      field.setText(formatText(values[0].value));
    } else if (field instanceof PDFCheckBox) {
      // the widget is checked through its own on-value, so widgets sharing a field stay independent
      const checked = values.find(({ value }) => value);
      const onValue = checked && field.acroField.getWidgets()[checked.widgetIndex].getOnValue();
      if (onValue) {
        field.acroField.setValue(onValue);
      } else {
        field.uncheck();
      }
    }
  }

  // Flatten so fields are embedded in the PDF content
  pdfForm.flatten();
  return pdfDoc.save();
}

/** Fill and merge every form in formsState. formsYear picks the blank PDFs (public/forms/<year>). */
export async function generateFilledPdfs(
  result: FillTaxesResult,
  formsYear: string,
): Promise<Uint8Array> {
  const filledPages: Uint8Array[] = [];
  // non-itemized returns don't carry Schedule A / IT-196 in formsState (removed by the computation)
  for (const [formKey, formData] of Object.entries(result.formsState)) {
    // multiple pages (e.g. f8949 with many trades) are a list
    for (const page of Array.isArray(formData) ? formData : [formData]) {
      const filled = await fillOnePdf(formsYear, formKey, page as D);
      if (filled) filledPages.push(filled);
    }
  }

  // Merge all filled PDFs into one
  const merged = await PDFDocument.create();
  for (const pageBytes of filledPages) {
    const doc = await PDFDocument.load(pageBytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return new Uint8Array(await merged.save());
}
