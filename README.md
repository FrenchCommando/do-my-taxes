# Do My Taxes

Browser-based US tax form filler for **2025 single filers**. Enter your financial data, compute your taxes, and download filled IRS PDF forms — all client-side, nothing leaves your browser.

https://frenchcommando.github.io/do-my-taxes/

## What it does

1. You enter your W-2, 1099 (including trades), 1098, estimated tax payments, charitable contributions, and other deduction info
2. Click **Compute Taxes** to run the full federal + NY state tax computation
3. Review the summary (income, deductions, tax, refund/owed, NY state/city taxes) and marginal tax rates
4. Download filled PDF forms (1040, Schedules A/B/D, Forms 8949, 6251, 6781, 1116, 8959, 8960, NY IT-201, IT-196) and/or JSON output

## Privacy

All computation runs in your browser. No server, no API calls, no data transmission. Your financial data stays on your machine. Input is auto-saved to localStorage so it survives page reloads.

## Disclaimer

This tool is not tax advice. Results may contain errors. Consult a qualified tax professional before filing.

## UI guide

- **Dark/Light mode** (top bar) — Toggle theme, defaults to system preference
- **GitHub** (top bar) — Link to source code
- **Import** (top bar) — Load a JSON input file (your own export or a taxes1040 `input.json`)
- **Export** (top bar) — Save your current input as `tax-input-2025.json`
- **Reset** (top bar) — Clear everything and reload the sample data
- **Add / Delete** (each section) — Add or remove entries (W-2s, 1099s, trades, mortgage payments, etc.)
- **Compute Taxes** (right panel) — Run the full tax computation and show the summary
- **Download PDF Forms** (right panel, after compute) — Download a single merged PDF with all filled IRS and NY forms
- **JSON downloads** (right panel, after compute) — data.json, summary.json, worksheet.json, carryover.json, marginal_rates.json

## Input sections

The page opens pre-filled with sample data. Edit or clear each section as needed.

### W-2 Wage Statements
Employer info, wages, federal/state/local tax withheld, Social Security and Medicare wages and taxes.

### 1099 Income
Interest, dividends (ordinary and qualified), foreign tax paid, capital gain distributions, Section 1256 contracts (realized/unrealized), other income. Each 1099 has a collapsible **Trades** sub-section for Form 8949 entries (description, shares, dates, proceeds, cost, wash sale, short/long term, form code A-F).

### 1098 Mortgage
Lender info, principal balance, and individual mortgage payments (date, interest amount, principal amount). Mortgage interest is prorated if the balance exceeds $750k (federal) or $1M (NY).

### Estimated Tax Payments
Federal and state estimated payments with dates and amounts.

### Charitable Contributions
Cash contributions (entity name and amount). Flows to Schedule A line 11.

### Other
Property tax, co-op state taxes, days in NYC. Property tax flows to SALT deduction.

### Prior Year Carryover (optional)
Only needed if you had capital losses or excess foreign tax credit from the prior year. Accepts values from last year's `carryover.json` output.

## Output

### Summary panel
After computing, the right panel shows every key figure from the computation grouped by form: total income, AGI, taxable income, tax, payments, refund/owed, NY state and city taxes, AMT, NIIT, foreign tax credit, and more.

### Marginal rates panel
Shows the marginal tax rate on your next dollar for each income category (W2 wages, short/long-term capital gains, qualified dividends, interest, 1256 contracts, HSA, charitable, mortgage, property tax, foreign tax credit). Each category shows federal, NY state, NYC, and combined rates, with all thresholds where rates change.

### Downloads

- **PDF Forms** — A single merged PDF with all filled IRS and NY forms. Only forms relevant to your situation are included.
- **data.json** — Every field of every computed form (the full `forms_state`). This is what gets mapped onto the PDF annotations.
- **summary.json** — Key figures with human-readable labels.
- **worksheet.json** — Intermediate worksheet computations (SALT, mortgage interest, qualified dividends, capital loss carryover, etc.).
- **carryover.json** — Values to carry forward to next year (taxable income, Schedule D net short/long-term, loss deduction, foreign tax credit carryforward).
- **marginal_rates.json** — Analytical marginal rates with segment breakpoints for every income category.

## How to file

- **Federal** — E-file for free at [Free File Fillable Forms](https://www.freefilefillableforms.com/home/default.php) (IRS). Upload or manually enter values from the downloaded PDF.
- **NY State** — Use the enhanced fill-in forms from the NY Tax Department. Print, sign, and mail.

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
- Analytical marginal rate computation with segment breakpoints

## How to run locally

```bash
npm install
npm run build
npm run preview
```

Then open http://localhost:4173/do-my-taxes/

## Tech stack

React, TypeScript, Vite, Zustand (state + localStorage persistence), MUI v6, pdf-lib (PDF generation in browser).

## License

LGPL-3.0 — see [LICENSE](LICENSE).
