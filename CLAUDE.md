# CLAUDE.md

## What This Project Does

Browser-based US tax form filler (Form 1040 and related federal/NY state forms) for 2025 single filers.
Users enter financial data, the app computes taxes and generates filled PDF forms + JSON outputs.
Everything runs client-side -- no server, no backend, no data leaves the browser.

Public tool hosted on GitHub Pages at https://frenchcommando.github.io/do-my-taxes/

## Source / Reference

- **Computation logic**: ported from https://github.com/FrenchCommando/taxes1040 (Python)
  - That repo has battle-tested tax computation for 2018-2025
  - Input format: `input_data/{year}/input.json` defines the canonical input schema
  - Output: `data.json` (all form fields), `summary.json` (key figures), `worksheet.json` (intermediate), `carryover.json` (next year), `marginal_rates.json`
  - Blank PDF forms and `.keys` annotation mappings are copied from `forms/2025/`

## Design Decisions

### Stack
- React + TypeScript
- Vite (build tool / dev server)
- Zustand (state management, with persist middleware for localStorage)
- MUI v6 (Material UI component library)
- pdf-lib (PDF generation in browser)

### Hosting
- GitHub Pages via GitHub Actions (push to master triggers build + deploy)
- No backend, no server, no API calls
- All computation runs in the browser

### Data Persistence
- localStorage via Zustand persist middleware (auto-save, survives browser restart)
- JSON import/export for portability (backup, cross-device transfer)
- No server-side storage -- sensitive financial data never leaves the user's machine
- Migration version in persist config resets stale localStorage on schema changes

### UI Design
- Dense one-pager with two-column layout (input left, summary/output right on large screens)
- All sections are collapsible accordions, greyed/muted when empty
- Sections mirror the input.json structure: W2, 1099 (with trades sub-section), 1098, Estimated Tax, Charitable, Other, Prior Year Carryover
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
W2[]            - employer info, wages, taxes withheld, state/local
1099[]          - interest, dividends, foreign tax, trades[], 1256 contracts
1098[]          - mortgage payments[], principal balance, lender info
EstimatedIncomeTax  - Federal[] and State[] payments with dates/amounts
Charitable[]    - entity name + amount (cash contributions)
Other[]         - property tax, co-op taxes, days in NYC
prior_year      - optional carryover (taxable income, Schedule D net short/long-term, loss deduction)
```

Auto-derived fields (not in UI):
- `scheduleD` — true if any 1099 has trades
- `virtual_currency` — true if any trade description contains "crypto"
- `presidential_election_self` — always false

## Computation Architecture

- `src/computation/fill_taxes.ts` — faithful port of `forms_core_impl.py`, builds full `forms_state` dict
- `src/computation/config_2025.ts` — year-specific constants and bracket functions
- `src/computation/form_names.ts` — form key constants
- `src/computation/marginal_rates.ts` — analytical marginal rate computation (port of `marginal_rates.py`)
- `src/computation/pdf_filler.ts` — browser-side PDF filling using pdf-lib
- `src/computation/compute.ts` — thin wrapper that orchestrates fill_taxes + marginal_rates

## How to Run

```bash
npm install
npm run build
npm run preview
```

Then open http://localhost:4173/do-my-taxes/

## Project Structure

```
do-my-taxes/
|-- src/
|   |-- components/     # React UI components (W2, 1099, 1098, etc. sections + summary + marginal rates)
|   |-- computation/    # Tax computation logic (ported from Python)
|   |-- store/          # Zustand state management
|   |-- types/          # TypeScript type definitions (input, output)
|   +-- App.tsx         # Root component (layout, toolbar, instructions)
|-- public/
|   +-- forms/2025/     # Blank IRS/NY PDF templates + .keys annotation mappings
|-- .github/workflows/  # GitHub Actions deploy to Pages
|-- index.html
|-- package.json
|-- tsconfig.json
+-- vite.config.ts
```
