# Notes

Non-obvious state, so nobody has to reverse-engineer it from git blame.

## 2026 is provisional (as of 2026-11-15)

- Mirrors taxes1040 `computation/forms_core_2026.py` and `forms/2026/notes.md`: federal numbers are final
  (Rev. Proc. 2025-32), but the 2026 forms are not published.
- `CONFIG_2026.field_maps` reuses the 2025 maps, and `charitable_nonitemizer` (f1040) /
  `itemized_limitation_adjustment` (f6251) are placeholder field names.
- `computation_2026_ny*` are aliases of the 2025 NY / NYC schedules; NY values are 2025 copies.
- There is no `public/forms/2026/`, so the PDF button is disabled for `PROVISIONAL_YEARS` (JSON downloads work).
- Revisit when taxes1040 maps the final 2026 PDFs: copy `forms/2026/*` into `public/forms/2026/`, port the new
  config / field maps, drop `'2026'` from `PROVISIONAL_YEARS`, and copy the regenerated `tests/scenarios/2026/`.

## `it201_fill_in.keys` has two malformed lines

`9_box` and `10_box` map to the annotation `Line` with type `9_box` / `10_box` (as in taxes1040). The computation
never fills them; `pdf_filler.test.ts` lists them in `KNOWN_MALFORMED`. Fix upstream in taxes1040 `.fields`.

## Bracket functions clamp at zero

The TS bracket functions return 0 for amounts <= 0 (pre-existing in this port); the Python ones extrapolate
(negative tax for a negative NY taxable income). All taxes1040 scenarios and the marginal-rate cross-check still
match, but an input with NY deductions above NY AGI could differ from the Python output.
