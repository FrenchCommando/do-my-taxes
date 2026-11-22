# CLAUDE.md

## What This Project Does

Browser-based US tax form filler (Form 1040 and related federal/NY state forms) for 2025 and 2026 (provisional), single or married filing jointly.
Users enter financial data, the app computes taxes and generates filled PDF forms + JSON outputs.
Everything runs client-side -- no server, no backend, no data leaves the browser.

Public tool hosted on GitHub Pages at https://frenchcommando.github.io/do-my-taxes/

## Source / Reference

- **Computation logic**: ported from https://github.com/FrenchCommando/taxes1040 (Python)
  - That repo has battle-tested tax computation for 2018-2026 (2026 provisional, see its `forms/2026/notes.md`)
  - Input format: `input_data/{year}/input.json` defines the canonical input schema
  - Output: `data.json` (all form fields), `summary.json` (key figures), `worksheet.json` (intermediate), `carryover.json` (next year), `marginal_rates.json`
  - Blank PDF forms and `.keys` annotation mappings are copied from `forms/2025/` (2026 has none yet: no PDF download for 2026)

## Design Decisions

### Stack
- React + TypeScript
- Vite (build tool / dev server)
- Zustand (state management, with persist middleware for localStorage)
- MUI v6 (Material UI component library)
- pdf-lib (PDF generation in browser)

### Hosting
- GitHub Pages via GitHub Actions (push to master triggers test + build + deploy)
- No backend, no server, no API calls
- All computation runs in the browser

### Data Persistence
- localStorage via Zustand persist middleware (auto-save, survives browser restart)
- JSON import/export for portability (backup, cross-device transfer)
- No server-side storage -- sensitive financial data never leaves the user's machine
- Migration version in persist config resets stale localStorage on schema changes

### UI Design
- Dense one-pager with responsive column layout: two columns at `lg` (input + summary/marginal/downloads), three columns at `xl` (input + summary + marginal rates & downloads)
- All sections are collapsible accordions, greyed/muted when empty
- Sections mirror the input.json structure: W2, 1099 (with trades sub-section), 1099-R, 1099-G, 1098, Estimated Tax, Charitable, Other, Prior Year Carryover
- Repeatable entries (multiple W2s, 1099s, trades, mortgage payments, etc.) with add/remove
- Pre-filled with sample data on first load
- Dark/light mode toggle (defaults to system preference)
- Collapsible instructions with disclaimer always visible

### Output
- Summary panel showing all computed key figures grouped by form
- Marginal rates panel with federal/NY/NYC breakdown per income category
- Download buttons: PDF (merged filled forms), data.json, summary.json, worksheet.json, carryover.json, marginal_rates.json

### PDF Generation
- Blank IRS PDFs in `public/forms/2025/` with `.keys` mapping files
- `.keys` files map human-readable field names to PDF annotation hex names
- pdf-lib fills annotations by matching the last segment of XFA paths (e.g. `f1_14[0]`) to decoded `.keys` entries
- Forms are flattened after filling and merged into a single PDF

## Input Schema

The input follows the structure from taxes1040 `input_data/{year}/input.json`:

```
year            - '2025' | '2026' (UI-only, picks the config)
filing_status   - 'single' | 'married_filing_jointly'
spouse          - first_name, initial, last_name, ssn, occupation, presidential_election, birth_date (MFJ)
birth_date      - optional, Schedule 1-A senior deduction
W2[]            - employer info, wages, taxes withheld, state/local, Owner ('self' | 'spouse')
1099[]          - interest, dividends, foreign tax, trades[], 1256 contracts
1099R[]         - GrossDistribution (box 1), TaxableAmount (box 2a), DistributionCode (box 7), IRA, Federal_tax /
                  State_tax / Local_tax (boxes 4, 14, 17), Payer, Owner -> 1040 lines 4/5 (rollover box for G/H)
1099G[]         - Unemployment (box 1), Federal_tax (box 4), State_tax (box 11), Payer, Owner
                  -> Schedule 1 line 7, IT-201 line 14 (spouse entries count only on a joint return, like W2s)
1098[]          - mortgage payments[], principal balance, lender info
EstimatedIncomeTax  - Federal[] and State[] payments with dates/amounts
Charitable[]    - entity name + amount (cash contributions) + DonorAdvisedFund
Other[]         - property tax, co-op taxes, days in NYC
prior_year      - optional carryover (taxable income, Schedule D net short/long-term, loss deduction)
health_savings_account*  - Form 8889 (coverage, contributions, distributions, qualified medical expenses
                  (null = all qualified), exceptions, testing period income)
qualified_tips / qualified_tips_business / qualified_overtime / qualified_overtime_1099 / vehicle_loans[]
                - Schedule 1-A
```

`normalizeInput()` (types/input.ts) fills fields missing from older exports / taxes1040 `input.json` files;
it runs on import and in the persist migration.

Auto-derived fields (not in UI):
- Schedule D — `fillTaxes` files it whenever there is any 1099 (taxes1040 always sets its `scheduleD` flag);
  there is no input flag on this side
- `virtual_currency` — true if any trade description contains "crypto"
- `presidential_election_self` — always false

## Computation Architecture

- `src/computation/fill_taxes.ts` — faithful port of `forms_core_impl.py`, builds full `forms_state` dict
- `src/computation/config.ts` — `CONFIG_2025` / `CONFIG_2026` (port of `forms_core_{year}.py`), bracket functions
  (port of `forms_functions.py`), `filing_status_overrides` for MFJ, `resolveConfig()`
- `src/computation/form_names.ts` — form key constants
- `src/computation/marginal_rates.ts` — numeric marginal rates (port of `marginal_rates.py`): re-runs `fillTaxes`
  with `exact: true` and finds the knots of the piecewise-linear tax (~200 ms per compute)
- `src/computation/pdf_filler.ts` — browser-side PDF filling using pdf-lib. Widgets are walked in page order
  and repeats of the same name get `#2`, `#3`, ... like taxes1040 `iter_widgets` (e.g. f1116 box c)
- `src/computation/compute.ts` — thin wrapper that orchestrates fill_taxes + marginal_rates

## How to Run

```bash
npm install
npm run build
npm run preview
```

Then open http://localhost:4173/do-my-taxes/

## Testing

```bash
npm test           # single run
npm run test:watch # watch mode
```

Tests:
- `src/computation/compute.test.ts` — verifies no NaN values across hand-built inputs (default for each year x filing status, empty, no W2 with various income types) plus a few regressions
- `src/computation/scenarios.test.ts` — scenario tests copied from `taxes1040/tests/scenarios/{2025,2026}/`, comparing summary (values and exact key set) and carryover output against the Python reference. Fixtures live in `tests/scenarios/<year>/` (outside `src/`, not bundled in production). To refresh: copy the year folders from taxes1040 again
- `src/computation/pdf_filler.test.ts` — every `.keys` annotation in `public/forms/2025` resolves to a widget of its blank PDF

### Rounding: banker's rounding (round half to even)
`pushToDict` uses banker's rounding to match IRS conventions. This is the standard for tax forms — when a value lands exactly on .5, it rounds to the nearest even number.

### Known pattern: `pushToDict` skips zero values
`pushToDict` does not store zero values in the forms dict. Downstream code reading form fields must use `|| 0` fallbacks (e.g. `(f['15'] || 0)`) to avoid NaN from arithmetic on `undefined`.

## Project Structure

```
do-my-taxes/
|-- src/
|   |-- components/     # React UI components (W2, 1099, 1098, etc. sections + summary + marginal rates)
|   |-- computation/    # Tax computation logic (ported from Python)
|   |-- store/          # Zustand state management
|   |-- types/          # TypeScript type definitions (input)
|   +-- App.tsx         # Root component (layout, toolbar, instructions)
|-- public/
|   +-- forms/2025/     # Blank IRS/NY PDF templates + .keys annotation mappings
|-- tests/
|   +-- scenarios/      # Test fixtures from taxes1040, per year (input.json + expected outputs per scenario)
|-- .github/workflows/  # GitHub Actions deploy to Pages
|-- index.html
|-- package.json
|-- tsconfig.json
+-- vite.config.ts
```
