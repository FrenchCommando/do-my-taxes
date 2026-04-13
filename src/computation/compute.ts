// Thin wrapper that calls the full fill_taxes engine and extracts a summary
import type { TaxInput } from '../types/input';
import type { TaxSummary } from '../types/output';
import { fillTaxes } from './fill_taxes';
import type { FillTaxesResult } from './fill_taxes';
import {
  CONFIG_2025,
  computation_2025,
  computation_2025_ny,
  computation_2025_ny_recapture,
  computation_2025_nyc,
} from './config_2025';

// Build the input dict in the format expected by fill_taxes (matching Python's gather_inputs)
function buildInputDict(input: TaxInput): Record<string, unknown> {
  const w2 = input.W2.map(({ id, ...rest }) => rest);
  const e1099 = input['1099'].map(({ id, ...rest }) => rest);
  const e1098 = input['1098'].map(({ id, ...rest }) => rest);
  const charitable = input.Charitable.map(({ id, ...rest }) => rest);
  const other = input.Other.map(({ id, ...rest }) => rest);

  return {
    W2: w2,
    '1099': e1099,
    '1098': e1098,
    EstimatedIncomeTax: input.EstimatedIncomeTax,
    Charitable: charitable,
    Other: other,
    single: true,
    dependents: false,
    resident: true,
    occupation: input.occupation,
    presidential_election_self: false,
    virtual_currency: e1099.some(e => (e.Trades || []).some(t => t.SalesDescription.toLowerCase().includes('crypto'))),
    scheduleD: e1099.some(e => (e.Trades || []).length > 0),
    checking: input.checking,
    routing_number: input.routing_number,
    account_number: input.account_number,
    phone: input.phone,
    email: input.email,
    health_savings_account: input.health_savings_account,
    health_savings_account_contributions: input.health_savings_account_contributions,
    health_savings_account_employer_contributions: input.health_savings_account_employer_contributions,
    health_savings_account_distributions: input.health_savings_account_distributions,
    medical_expenses: 0,
  };
}

export function computeAll(input: TaxInput): FillTaxesResult {
  const d = buildInputDict(input);
  return fillTaxes(
    d,
    CONFIG_2025,
    computation_2025,
    computation_2025_ny,
    computation_2025_ny_recapture,
    computation_2025_nyc,
  );
}

export function computeTaxes(input: TaxInput): TaxSummary {
  const { summaryInfo } = computeAll(input);

  const get = (key: string): number => {
    for (const [k, v] of Object.entries(summaryInfo)) {
      if (k.includes(key) && typeof v === 'number') return v;
    }
    return 0;
  };

  return {
    totalIncome: get('9 Total income'),
    adjustedGrossIncome: get('11 adjusted gross income'),
    taxableIncome: get('15 Taxable income'),
    totalTax: get('24 Total Tax'),
    totalPayments: get('33 Total Payments'),
    refundOrOwed: get('Overpaid') || -get('amount you owe'),
    effectiveRate: get('24 Total Tax') / (get('9 Total income') || 1),
    federalTaxWithheld: 0, // available from forms_state if needed
    stateTaxWithheld: 0,
  };
}
