// Thin wrapper that calls the full fill_taxes engine and the marginal rates
import type { TaxInput } from '../types/input';
import { fillTaxes } from './fill_taxes';
import type { FillTaxesResult } from './fill_taxes';
import { computeMarginalRates } from './marginal_rates';
import type { MarginalRatesResult } from './marginal_rates';
import { YEAR_CONFIGS } from './config';

/** Drop the UI-only id. */
function withoutId<T extends { id: string }>(entry: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...entry };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}

/** Build the input dict in the format expected by fill_taxes (matching Python's gather_inputs). */
export function buildInputDict(input: TaxInput): Record<string, unknown> {
  const marriedFilingJointly = input.filing_status === 'married_filing_jointly';
  const w2 = input.W2
    .map(withoutId)
    // spouse W2s only count on a joint return
    .filter(entry => marriedFilingJointly || entry.Owner !== 'spouse');
  const e1099 = input['1099'].map(withoutId);
  const e1098 = input['1098'].map(withoutId);
  const charitable = input.Charitable.map(withoutId);
  const other = input.Other.map(withoutId);
  // an empty date means "not given" (an empty string would sort before the senior cutoff)
  const spouse = Object.fromEntries(Object.entries(input.spouse).filter(([key, value]) => key !== 'birth_date' || value));

  return {
    filing_status: input.filing_status,
    ...(marriedFilingJointly ? { spouse } : {}),
    ...(input.birth_date ? { birth_date: input.birth_date } : {}),
    W2: w2,
    '1099': e1099,
    '1098': e1098,
    EstimatedIncomeTax: input.EstimatedIncomeTax,
    Charitable: charitable,
    Other: other,
    dependents: false,
    resident: true,
    occupation: input.occupation,
    presidential_election_self: false,
    virtual_currency: e1099.some(entry => (entry.Trades || []).some(trade => String(trade.SalesDescription).toLowerCase().includes('crypto'))),
    // Schedule D is built for any 1099 (trades, 1256 contracts, capital gain distributions); taxes1040 always
    // sets scheduleD. Deriving it from trades only made the QDCG worksheet treat 1256 short-term gains as long-term.
    scheduleD: e1099.length > 0,
    checking: input.checking,
    routing_number: input.routing_number,
    account_number: input.account_number,
    phone: input.phone,
    email: input.email,
    health_savings_account: input.health_savings_account,
    health_savings_account_coverage: input.health_savings_account_coverage,
    health_savings_account_contributions: input.health_savings_account_contributions,
    health_savings_account_employer_contributions: input.health_savings_account_employer_contributions,
    health_savings_account_distributions: input.health_savings_account_distributions,
    // absent = all distributions paid qualified medical expenses
    ...(input.health_savings_account_qualified_medical_expenses !== null
      ? { health_savings_account_qualified_medical_expenses: input.health_savings_account_qualified_medical_expenses }
      : {}),
    health_savings_account_distribution_exception: input.health_savings_account_distribution_exception,
    health_savings_account_last_month_rule_income: input.health_savings_account_last_month_rule_income,
    health_savings_account_funding_distribution_income: input.health_savings_account_funding_distribution_income,
    health_savings_account_testing_period_exception: input.health_savings_account_testing_period_exception,
    qualified_tips: input.qualified_tips,
    qualified_tips_business: input.qualified_tips_business,
    qualified_overtime: input.qualified_overtime,
    qualified_overtime_1099: input.qualified_overtime_1099,
    vehicle_loans: input.vehicle_loans,
    medical_expenses: 0,
    prior_year: input.prior_year || undefined,
  };
}

export function computeAll(input: TaxInput): FillTaxesResult {
  return fillTaxes(buildInputDict(input), YEAR_CONFIGS[input.year]);
}

export function computeAllWithRates(input: TaxInput): { result: FillTaxesResult; marginalRates: MarginalRatesResult } {
  const inputDict = buildInputDict(input);
  const config = YEAR_CONFIGS[input.year];
  return {
    result: fillTaxes(inputDict, config),
    marginalRates: computeMarginalRates(config, inputDict),
  };
}
