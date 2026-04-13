# Do My Taxes

Browser-based US tax form filler for **2025 single filers**. Enter your financial data, compute your taxes, and download filled IRS PDF forms — all client-side, nothing leaves your browser.

https://frenchcommando.github.io/do-my-taxes/

## What it does

1. You enter your W-2, 1099, 1098, estimated tax payments, charitable contributions, and other deduction info
2. Click **Compute Taxes** to run the full federal + NY state tax computation
3. Review the summary (income, deductions, tax, refund/owed, NY state/city taxes)
4. Download filled PDF forms (1040, Schedules A/B/D, Forms 8949, 6251, 6781, 1116, 8959, 8960, NY IT-201, IT-196) and/or JSON output

## Privacy

All computation runs in your browser. No server, no API calls, no data transmission. Your financial data stays on your machine. Input is auto-saved to localStorage so it survives page reloads.

## UI guide

- **Import** (top bar) — Load a JSON input file (your own export or a taxes1040 `input.json`)
- **Export** (top bar) — Save your current input as `tax-input-2025.json`
- **Reset** (top bar) — Clear everything and reload the sample data
- **Add / Delete** (each section) — Add or remove entries (W-2s, 1099s, mortgage payments, etc.)
- **Compute Taxes** (right panel) — Run the full tax computation and show the summary
- **Download PDF Forms** (right panel, after compute) — Download a single merged PDF with all filled IRS and NY forms
- **data.json** (right panel, after compute) — Download the raw form field values
- **summary.json** (right panel, after compute) — Download key figures

## Input sections

The page opens pre-filled with sample data. Edit or clear each section as needed.

### W-2 Wage Statements
Employer info, wages, federal/state/local tax withheld, Social Security and Medicare wages and taxes.

### 1099 Income
Interest, dividends (ordinary and qualified), foreign tax paid, capital gain distributions, Section 1256 contracts (realized/unrealized), other income. Trades are entered in the Python input JSON and flow through Form 8949 and Schedule D.

### 1098 Mortgage
Lender info, principal balance, and individual mortgage payments (date, interest amount, principal amount). Mortgage interest is prorated if the balance exceeds $750k (federal) or $1M (NY).

### Estimated Tax Payments
Federal and state estimated payments with dates and amounts.

### Charitable Contributions
Cash contributions (entity name and amount). Flows to Schedule A line 11.

### Other
Property tax, co-op state taxes, days in NYC. Property tax flows to SALT deduction. Days in NYC is used for NY state/city allocation.

## Output

### Summary panel
After computing, the right panel shows every key figure from the computation grouped by form: total income, AGI, taxable income, tax, payments, refund/owed, NY state and city taxes, AMT, NIIT, foreign tax credit, and more.

### Downloads

- **PDF Forms** — A single merged PDF with all filled IRS and NY forms. Only forms relevant to your situation are included.
- **data.json** — Every field of every computed form (the full `forms_state`). This is what gets mapped onto the PDF annotations.
- **summary.json** — Key figures with human-readable labels.

## Import / Export

- **Export** — Downloads your current input as `tax-input-2025.json`
- **Import** — Load a previously exported JSON file. Also accepts the `input.json` format from [taxes1040](https://github.com/FrenchCommando/taxes1040).

## Computation details

The tax engine is a TypeScript port of [taxes1040](https://github.com/FrenchCommando/taxes1040), which has battle-tested computation for 2018-2025. Currently supports:

- Federal Form 1040 (single filer, no dependents)
- Schedule A (itemized deductions with SALT worksheet — $40k cap with phaseout for 2025)
- Schedule B (interest and dividends)
- Schedule D (capital gains/losses with carryover)
- Form 8949 (trades, multiple pages)
- Form 6781 (Section 1256 contracts, 60/40 split)
- Form 6251 (AMT with qualified dividend/capital gain preferential rates)
- Form 1116 (foreign tax credit)
- Form 8889 (HSA deduction)
- Form 8959 (Additional Medicare Tax)
- Form 8960 (Net Investment Income Tax, 3.8%)
- NY IT-201 (NY state tax with recapture)
- NY IT-196 (NY itemized deductions with high-income adjustment)
- Qualified Dividends and Capital Gain Tax Worksheet
- Capital Loss Carryover Worksheet

## How to run locally

```bash
npm install
npm run build
npm run preview
```

Then open http://localhost:4173/do-my-taxes/

## Tech stack

React, TypeScript, Vite, Zustand (state + localStorage persistence), MUI v6, pdf-lib (PDF generation in browser).
