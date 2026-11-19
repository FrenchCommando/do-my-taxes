import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeAllWithRates } from './compute';
import { FILING_STATUSES, TAX_YEARS } from './config';
import { createDefaultInput, normalizeInput } from '../types/input';
import type { TaxInput } from '../types/input';

function noNaN(obj: unknown, path = ''): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'number') {
    expect(isNaN(obj), `NaN at ${path}`).toBe(false);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => noNaN(item, `${path}[${index}]`));
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      noNaN(value, path ? `${path}.${key}` : key);
    }
  }
}

function emptyInput(): TaxInput {
  return normalizeInput({ occupation: '', phone: '', email: '', routing_number: '', checking: false, account_number: '' });
}

describe('compute taxes', () => {
  for (const year of TAX_YEARS) {
    for (const filingStatus of FILING_STATUSES) {
      it(`default sample input produces no NaN (${year}, ${filingStatus})`, () => {
        const input = { ...createDefaultInput(), year, filing_status: filingStatus };
        const { result, marginalRates } = computeAllWithRates(input);
        expect(result.summaryInfo['Federal/f1040 Filing status']).toBe(filingStatus);
        noNaN(result.formsState, 'formsState');
        noNaN(result.summaryInfo, 'summaryInfo');
        noNaN(result.worksheets, 'worksheets');
        noNaN(result.carryover, 'carryover');
        noNaN(marginalRates, 'marginalRates');
      });
    }
  }

  it('1256 contracts without trades: only the 60% long-term part gets the capital gain rates', () => {
    const input = createDefaultInput();
    input['1099'] = [{
      ...input['1099'][0], 'Ordinary Dividends': 100, 'Qualified Dividends': 100, Interest: 0, Realized1256: 10_000,
    }];
    const { worksheets } = computeAllWithRates(input).result;
    // QDCG worksheet line 3: min(Schedule D line 15, line 16) = 60% of the 1256 gain
    expect(worksheets['QualifiedDividendsAndCapitalGains'][3]).toBe(6_000);
  });

  it('spouse W2 is ignored when filing single', () => {
    const input = createDefaultInput();
    const single = computeAllWithRates(input).result.summaryInfo['Federal/f1040 9 Total income'];
    input.W2 = [...input.W2, { ...input.W2[0], id: 'spouse-w2', Owner: 'spouse', Wages: 50_000 }];
    expect(computeAllWithRates(input).result.summaryInfo['Federal/f1040 9 Total income']).toBe(single);
    input.filing_status = 'married_filing_jointly';
    expect(computeAllWithRates(input).result.summaryInfo['Federal/f1040 9 Total income']).toBe(single as number + 50_000);
  });

  it('empty input (no W2, no income) produces no NaN', () => {
    const input = emptyInput();
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(result.worksheets, 'worksheets');
    noNaN(result.carryover, 'carryover');
    noNaN(marginalRates, 'marginalRates');
  });

  it('no W2 but has 1099 income — no NaN', () => {
    const input = emptyInput();
    input['1099'] = [
      {
        id: 'test-1099',
        Institution: 'Test Bank',
        Interest: 5000,
        InterestBondsObligations: 0,
        'Ordinary Dividends': 3000,
        'Qualified Dividends': 1000,
        'Capital Gain Distributions': 0,
        'Foreign Tax Paid': 0,
        'Foreign Country': '',
        Trades: [],
        Realized1256: 0,
        Unrealized1256: 0,
        Contract1256: false,
        'Other Income': 0,
        'Other Description': '',
      },
    ];
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(marginalRates, 'marginalRates');
  });

  it('no W2 but has 1099 with trades — no NaN', () => {
    const input = emptyInput();
    input['1099'] = [
      {
        id: 'test-1099-trades',
        Institution: 'Brokerage',
        Interest: 0,
        InterestBondsObligations: 0,
        'Ordinary Dividends': 0,
        'Qualified Dividends': 0,
        'Capital Gain Distributions': 0,
        'Foreign Tax Paid': 0,
        'Foreign Country': '',
        Trades: [
          {
            SalesDescription: 'STOCK',
            Shares: '100',
            DateAcquired: '2024/01/01',
            DateSold: '2025/06/01',
            WashSaleCode: '',
            Proceeds: 50000,
            Cost: 30000,
            WashSaleValue: 0,
            LongShort: 'LONG',
            FormCode: 'D',
          },
        ],
        Realized1256: 0,
        Unrealized1256: 0,
        Contract1256: false,
        'Other Income': 0,
        'Other Description': '',
      },
    ];
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(marginalRates, 'marginalRates');
  });

  it('no W2 with charitable and property tax — no NaN', () => {
    const input = emptyInput();
    input['1099'] = [
      {
        id: 'test-1099',
        Institution: 'Bank',
        Interest: 100000,
        InterestBondsObligations: 0,
        'Ordinary Dividends': 0,
        'Qualified Dividends': 0,
        'Capital Gain Distributions': 0,
        'Foreign Tax Paid': 0,
        'Foreign Country': '',
        Trades: [],
        Realized1256: 0,
        Unrealized1256: 0,
        Contract1256: false,
        'Other Income': 0,
        'Other Description': '',
      },
    ];
    input.Charitable = [{ id: 'c1', Entity: 'Charity', Amount: 5000, DonorAdvisedFund: false }];
    input.Other = [{ id: 'o1', PropertyTax: 10000, CoopStateTaxes: 0, DaysInNYC: 365 }];
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(marginalRates, 'marginalRates');
  });
});

describe('marginal rate segments', () => {
  const wageSegments = (input: TaxInput) => computeAllWithRates(input).marginalRates.marginal_rates['W2 Wages'].segments;
  const knotAt = (input: TaxInput, position: number) => wageSegments(input).find(segment => segment.to === position)?.next_knot;

  it('labels where NIIT stops growing (MAGI over the threshold reaches net investment income)', () => {
    const input = { ...createDefaultInput(), year: '2026' as const, filing_status: 'married_filing_jointly' as const };
    input.W2 = [{ ...input.W2[0], Wages: 100_000 }];
    // the sample's non-wage income is all investment income: AGI - 250,000 reaches it at +150,000 of wages
    expect(knotAt(input, 150_000)).toContain('NIIT capped at net investment income');
  });

  it('measures cliffs at the knot, without the rate change after it', () => {
    const input = { ...createDefaultInput(), year: '2026' as const, filing_status: 'married_filing_jointly' as const };
    input.W2 = [{ ...input.W2[0], Wages: 100_000, SocialSecurity_wages: 100_000, Medicare_wages: 100_000 }];
    input['1099'] = [];
    input['1098'] = [];
    input.Charitable = [];
    // the NYC schedule's rounded base amount makes a $0.45 jump at $90,000: not a cliff in whole dollars
    expect(knotAt(input, 6_051)).toBe('NYC bracket at taxable $90,000');
    // NY recapture worksheet 2 starts at taxable $161,550 (IT-201-I): $333 + $807 x 32.1% - $332.25 = $260
    expect(knotAt(input, 77_601)).toContain('cliff: tax +$260');
  });

  it('collapses Schedule 1-A stepped phaseouts and keeps a cliff from another rule a dollar away', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'tests', 'scenarios', '2026', 'schedule_1a_phaseout', 'input.json'), 'utf-8'));
    const input = normalizeInput({ ...raw, year: '2026' });
    const segments = wageSegments(input);
    expect(segments.length).toBeLessThan(40);
    expect(segments.some(segment => segment.next_knot?.startsWith('stepped phaseout: 115 steps of +$35 every $1,000'))).toBe(true);
    // the $32 Schedule 1-A step and the $63 NYC fixed school credit (income over $250,000) a dollar apart
    expect(knotAt(input, 69_500)).toBe('NYC fixed school credit ends (income $250,000); cliff: tax +$95');
    expect(segments.every(segment => segment.next_knot !== 'rate change')).toBe(true);
  }, 60_000);  // ~7 s: every step of every staircase is a knot to locate
});
