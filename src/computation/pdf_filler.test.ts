import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PDFCheckBox, PDFDocument } from 'pdf-lib';
import { parseAnnotKey, parseKeysFile, widgetSlots } from './pdf_filler';

const FORMS_DIR = join(__dirname, '..', '..', 'public', 'forms', '2025');

async function load(formKey: string) {
  const pdfDoc = await PDFDocument.load(readFileSync(join(FORMS_DIR, `${formKey}.pdf`)));
  const keys = parseKeysFile(readFileSync(join(FORMS_DIR, `${formKey}.keys`), 'utf-8'));
  return { pdfDoc, keys, slots: widgetSlots(pdfDoc, pdfDoc.getForm().getFields()) };
}

// malformed lines in taxes1040's .keys (annotation 'Line', type '9_box'); never filled by the computation
const KNOWN_MALFORMED: Record<string, string[]> = { 'ny/it201_fill_in': ['9_box', '10_box'] };

const formKeys = ['Federal', 'ny'].flatMap(folder => readdirSync(join(FORMS_DIR, folder))
  .filter(file => file.endsWith('.keys'))
  .map(file => `${folder}/${file.replace('.keys', '')}`));

describe('.keys files match the blank PDFs', () => {
  for (const formKey of formKeys) {
    it(`${formKey}: every .keys annotation is a widget`, async () => {
      const { keys, slots } = await load(formKey);
      const slotKeys = new Set(slots.map(slot => slot.key));
      const missing = [...keys.values()].filter(entry => !slotKeys.has(parseAnnotKey(entry.annotName)));
      expect(missing.map(entry => entry.humanName)).toEqual(KNOWN_MALFORMED[formKey] ?? []);
    });
  }

  it('repeated widget names get distinct slots (f1116 boxes a / c, f1040 single / head of household)', async () => {
    for (const [formKey, first, repeat] of [['Federal/f1116', 'a', 'c'], ['Federal/f1040', 'single', 'head_of_household']]) {
      const { keys, slots } = await load(formKey);
      const firstSlot = slots.find(slot => slot.key === parseAnnotKey(keys.get(first)!.annotName))!;
      const repeatSlot = slots.find(slot => slot.key === parseAnnotKey(keys.get(repeat)!.annotName))!;
      expect(repeatSlot.key.endsWith('#2')).toBe(true);
      expect(repeatSlot).not.toBe(firstSlot);
      expect(firstSlot.field).toBeInstanceOf(PDFCheckBox);
    }
  });
});
