// Browser-side PDF filling using pdf-lib
// Port of taxes1040/pipeline/make_pdf_output.py + utils/forms_utils.py

import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib';
import type { FillTaxesResult } from './fill_taxes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

interface KeyEntry {
  humanName: string;
  annotName: string;
  fieldType: string; // '/Tx' or '/Btn'
}

function parseKeysFile(text: string): Map<string, KeyEntry> {
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

async function fillOnePdf(
  formKey: string,
  contents: D,
): Promise<Uint8Array | null> {
  // formKey is like 'Federal/f1040' or 'ny/it201_fill_in'
  const keysUrl = `${BASE}forms/2025/${formKey}.keys`;
  const pdfUrl = `${BASE}forms/2025/${formKey}.pdf`;

  const keysText = await fetchText(keysUrl);
  if (!keysText) return null; // no .keys file for this form

  const keyMap = parseKeysFile(keysText);

  // Build a lookup from decoded annot name -> value
  const annotToValue = new Map<string, string | boolean | number>();
  for (const [humanName, entry] of keyMap) {
    if (humanName in contents) {
      annotToValue.set(decodeAnnotName(entry.annotName), contents[humanName]);
    }
  }

  if (annotToValue.size === 0) return null;

  const pdfBytes = await fetchBytes(pdfUrl);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pdfForm = pdfDoc.getForm();

  for (const field of pdfForm.getFields()) {
    const fullName = field.getName();
    // pdf-lib returns XFA paths like "topmostSubform[0].Page1[0].f1_14[0]"
    // but .keys files have just the short name like "f1_14[0]"
    // Match by the last segment
    const name = fullName.includes('.') ? fullName.split('.').pop()! : fullName;
    if (!annotToValue.has(name)) continue;
    const value = annotToValue.get(name)!;

    if (field instanceof PDFTextField) {
      let text: string;
      if (typeof value === 'number') {
        text = value === Math.round(value) ? String(Math.round(value)) : value.toFixed(2);
      } else {
        text = String(value);
      }
      field.setText(text);
    } else if (field instanceof PDFCheckBox) {
      if (value) {
        field.check();
      } else {
        field.uncheck();
      }
    }
  }

  // Flatten so fields are embedded in the PDF content
  pdfForm.flatten();
  return pdfDoc.save();
}

export async function generateFilledPdfs(
  result: FillTaxesResult,
): Promise<Uint8Array> {
  const { formsState } = result;
  const filledPages: Uint8Array[] = [];

  for (const [formKey, formData] of Object.entries(formsState)) {
    if (Array.isArray(formData)) {
      // Multiple pages (e.g. f8949 with many trades)
      for (const page of formData) {
        const filled = await fillOnePdf(formKey, page as D);
        if (filled) filledPages.push(filled);
      }
    } else {
      const filled = await fillOnePdf(formKey, formData as D);
      if (filled) filledPages.push(filled);
    }
  }

  // Merge all filled PDFs into one
  const merged = await PDFDocument.create();
  for (const pageBytes of filledPages) {
    const doc = await PDFDocument.load(pageBytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  return new Uint8Array(bytes);
}
