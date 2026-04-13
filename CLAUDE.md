# CLAUDE.md

## What This Project Does

Browser-based US tax form filler (Form 1040 and related federal/state forms).
Users enter financial data, the app computes taxes and generates filled PDF forms + JSON summaries.
Everything runs client-side -- no server, no backend, no data leaves the browser.

Public tool hosted on GitHub Pages at https://frenchcommando.github.io/do-my-taxes/

## Source / Reference

- **Computation logic**: ported from https://github.com/FrenchCommando/taxes1040 (Python)
  - That repo has battle-tested tax computation for 2018-2025
  - Input format: `input_data/{year}/input.json` defines the canonical input schema
  - Output: `data.json` (all form fields), `summary.json` (key figures), `worksheet.json` (intermediate), `carryover.json` (next year), `marginal_rates.json`

## Design Decisions

### Stack
- React + TypeScript
- Vite (build tool / dev server)
- Zustand (state management, with persist middleware for localStorage)
- MUI v6 (Material UI component library)
- react-hook-form (form handling / validation)
- react-router (navigation)
- pdf-lib (PDF generation in browser)

### Hosting
- GitHub Pages (static site, free)
- No backend, no server, no API calls
- All computation runs in the browser

### Data Persistence
- localStorage via Zustand persist middleware (auto-save, survives browser restart)
- JSON import/export for portability (backup, cross-device transfer)
- No server-side storage -- sensitive financial data never leaves the user's machine

### UI Design
- Dense one-pager for input
- All sections visible but greyed/muted until the user edits them
- Sections mirror the input.json structure: W2, 1099, 1098, Estimated Tax, Charitable, Other
- Repeatable entries (multiple W2s, 1099s, etc.) with add/remove
- 1099 has optional sub-sections (Trades, 1256, Foreign Tax) that stay muted unless populated

### Output (v1)
- Two download buttons: PDF (filled forms) and JSON (summary/data)
- No in-app viewers in v1

### Output (future)
- Summary dashboard (total income, total tax, effective rate)
- Form-by-form breakdown (each IRS form line)
- Marginal rate charts
- Year-over-year comparison

## Input Schema

The input follows the structure from taxes1040 `input_data/{year}/input.json`:

```
W2[]            - employer info, wages, taxes withheld, state/local
1099[]          - interest, dividends, foreign tax, trades[], 1256 contracts
1098[]          - mortgage payments[], principal balance, lender info
EstimatedIncomeTax  - Federal[] and State[] payments with dates/amounts
Charitable[]    - entity name + amount (cash contributions)
Other[]         - property tax, co-op taxes, days in NYC
```

## How to Run

```bash
# Install dependencies
npm install

# Dev server (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
do-my-taxes/
|-- src/
|   |-- components/     # React UI components
|   |-- computation/    # Tax computation logic (ported from Python)
|   |-- store/          # Zustand state management
|   |-- types/          # TypeScript type definitions (input, output)
|   +-- App.tsx         # Root component
|-- public/
|   +-- forms/          # Blank IRS PDF templates for pdf-lib
|-- index.html          # Entry point
|-- package.json
|-- tsconfig.json
+-- vite.config.ts
```
