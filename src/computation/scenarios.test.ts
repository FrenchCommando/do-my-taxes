import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { computeAllWithRates } from './compute';
import type { TaxInput, W2Entry, Entry1099, Entry1098, Trade, OtherEntry, CharitableContribution } from '../types/input';

const SCENARIOS_DIR = join(__dirname, '..', '..', 'tests', 'scenarios');

/** Convert a Python scenario input.json into a TaxInput. */
function scenarioToTaxInput(raw: Record<string, unknown>): TaxInput {
  const w2List = (raw['W2'] as Record<string, unknown>[] | undefined) ?? [];
  const list1099 = (raw['1099'] as Record<string, unknown>[] | undefined) ?? [];
  const list1098 = (raw['1098'] as Record<string, unknown>[] | undefined) ?? [];
  const charitable = (raw['Charitable'] as Record<string, unknown>[] | undefined) ?? [];
  const other = (raw['Other'] as Record<string, unknown>[] | undefined) ?? [];
  const estimated = (raw['EstimatedIncomeTax'] as Record<string, unknown> | undefined) ?? { Federal: [], State: [] };
  const priorYear = (raw['prior_year'] as Record<string, number> | undefined) ?? null;

  return {
    W2: w2List.map((w, idx) => ({
      id: `w2-${idx}`,
      Company: (w['Company'] as string) ?? '',
      Company_address: (w['Company_address'] as string) ?? '',
      Company_city: (w['Company_city'] as string) ?? '',
      Company_state: (w['Company_state'] as string) ?? '',
      Company_zip: (w['Company_zip'] as string) ?? '',
      FullName: (w['FullName'] as string) ?? '',
      FirstName: (w['FirstName'] as string) ?? '',
      LastName: (w['LastName'] as string) ?? '',
      Address: (w['Address'] as string) ?? '',
      Address_apt: (w['Address_apt'] as string) ?? '',
      Address_city: (w['Address_city'] as string) ?? '',
      Address_state: (w['Address_state'] as string) ?? '',
      Address_zip: (w['Address_zip'] as string) ?? '',
      SSN: (w['SSN'] as string) ?? '',
      Wages: (w['Wages'] as number) ?? 0,
      SocialSecurity_wages: (w['SocialSecurity_wages'] as number) ?? 0,
      Medicare_wages: (w['Medicare_wages'] as number) ?? 0,
      Federal_tax: (w['Federal_tax'] as number) ?? 0,
      SocialSecurity_tax: (w['SocialSecurity_tax'] as number) ?? 0,
      Medicare_tax: (w['Medicare_tax'] as number) ?? 0,
      State: (w['State'] as string) ?? '',
      State_tax: (w['State_tax'] as number) ?? 0,
      Local_tax: (w['Local_tax'] as number) ?? 0,
      Locality: (w['Locality'] as string) ?? '',
    } satisfies W2Entry)),

    '1099': list1099.map((e, idx) => {
      const trades = ((e['Trades'] as Record<string, unknown>[] | undefined) ?? []).map((t): Trade => ({
        SalesDescription: (t['SalesDescription'] as string) ?? '',
        Shares: (t['Shares'] as string | number) ?? '',
        DateAcquired: (t['DateAcquired'] as string) ?? '',
        DateSold: (t['DateSold'] as string) ?? '',
        WashSaleCode: (t['WashSaleCode'] as string) ?? '',
        Proceeds: (t['Proceeds'] as number) ?? 0,
        Cost: (t['Cost'] as number) ?? 0,
        WashSaleValue: (t['WashSaleValue'] as number) ?? 0,
        LongShort: (t['LongShort'] as 'SHORT' | 'LONG') ?? 'SHORT',
        FormCode: (t['FormCode'] as Trade['FormCode']) ?? 'A',
      }));
      return {
        id: `1099-${idx}`,
        Institution: (e['Institution'] as string) ?? '',
        Interest: (e['Interest'] as number) ?? 0,
        InterestBondsObligations: (e['InterestBondsObligations'] as number) ?? 0,
        'Ordinary Dividends': (e['Ordinary Dividends'] as number) ?? 0,
        'Qualified Dividends': (e['Qualified Dividends'] as number) ?? 0,
        'Capital Gain Distributions': (e['Capital Gain Distributions'] as number) ?? 0,
        'Foreign Tax Paid': (e['Foreign Tax Paid'] as number) ?? 0,
        'Foreign Country': (e['Foreign Country'] as string) ?? '',
        Trades: trades,
        Realized1256: (e['Realized1256'] as number) ?? 0,
        Unrealized1256: (e['Unrealized1256'] as number) ?? 0,
        Contract1256: (e['Contract1256'] as boolean) ?? false,
        'Other Income': (e['Other Income'] as number) ?? 0,
        'Other Description': (e['Other Description'] as string) ?? '',
      } satisfies Entry1099;
    }),

    '1098': list1098.map((e, idx) => ({
      id: `1098-${idx}`,
      Recipient: (e['Recipient'] as string) ?? '',
      LoanNumber: (e['LoanNumber'] as string) ?? '',
      PrincipalBalance: (e['PrincipalBalance'] as number) ?? 0,
      Payments: ((e['Payments'] as Record<string, unknown>[] | undefined) ?? []).map(p => ({
        Date: (p['Date'] as string) ?? '',
        InterestAmount: (p['InterestAmount'] as number) ?? 0,
        PrincipalAmount: (p['PrincipalAmount'] as number) ?? 0,
      })),
    } satisfies Entry1098)),

    EstimatedIncomeTax: {
      Federal: ((estimated['Federal'] as Record<string, unknown>[] | undefined) ?? []).map(p => ({
        Date: (p['Date'] as string) ?? '',
        Amount: (p['Amount'] as number) ?? 0,
      })),
      State: ((estimated['State'] as Record<string, unknown>[] | undefined) ?? []).map(p => ({
        Date: (p['Date'] as string) ?? '',
        Amount: (p['Amount'] as number) ?? 0,
      })),
    },

    Charitable: charitable.map((c, idx) => ({
      id: `char-${idx}`,
      Entity: (c['Entity'] as string) ?? '',
      Amount: (c['Amount'] as number) ?? 0,
    } satisfies CharitableContribution)),

    Other: other.map((o, idx) => ({
      id: `other-${idx}`,
      PropertyTax: (o['PropertyTax'] as number) ?? 0,
      CoopStateTaxes: (o['CoopStateTaxes'] as number) ?? 0,
      DaysInNYC: (o['DaysInNYC'] as number) ?? 0,
    } satisfies OtherEntry)),

    occupation: 'Analyst',
    phone: '6465555555',
    email: 'test@test.com',
    routing_number: '11111111',
    checking: true,
    account_number: '444444444',

    prior_year: priorYear ? {
      taxable_income: priorYear['taxable_income'] ?? 0,
      schedule_d_net_short_term: priorYear['schedule_d_net_short_term'] ?? 0,
      schedule_d_net_long_term: priorYear['schedule_d_net_long_term'] ?? 0,
      schedule_d_loss_deduction: priorYear['schedule_d_loss_deduction'] ?? 0,
    } : null,

    health_savings_account: (raw['health_savings_account'] as boolean) ?? false,
    health_savings_account_contributions: (raw['health_savings_account_contributions'] as number) ?? 0,
    health_savings_account_employer_contributions: (raw['health_savings_account_employer_contributions'] as number) ?? 0,
    health_savings_account_distributions: (raw['health_savings_account_distributions'] as number) ?? 0,
  };
}

// Discover all scenario directories
const scenarioNames = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

describe('scenario tests (from taxes1040)', () => {
  for (const name of scenarioNames) {
    const dir = join(SCENARIOS_DIR, name);

    it(`${name} — summary matches`, () => {
      const rawInput = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf-8'));
      const expectedSummary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf-8'));
      const input = scenarioToTaxInput(rawInput);
      const { result } = computeAllWithRates(input);

      for (const [key, expected] of Object.entries(expectedSummary)) {
        const actual = result.summaryInfo[key];
        if (typeof expected === 'number') {
          expect(actual, `summary key "${key}"`).toBeCloseTo(expected, 0);
        } else {
          expect(actual, `summary key "${key}"`).toEqual(expected);
        }
      }
    });

    it(`${name} — carryover matches`, () => {
      const rawInput = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf-8'));
      const expectedCarryover = JSON.parse(readFileSync(join(dir, 'carryover.json'), 'utf-8'));
      const input = scenarioToTaxInput(rawInput);
      const { result } = computeAllWithRates(input);

      for (const [key, expected] of Object.entries(expectedCarryover)) {
        const actual = (result.carryover as Record<string, unknown>)[key];
        if (typeof expected === 'number') {
          expect(actual, `carryover key "${key}"`).toBeCloseTo(expected, 1);
        } else {
          expect(actual, `carryover key "${key}"`).toEqual(expected);
        }
      }
    });
  }
});
