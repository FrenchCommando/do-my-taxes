import { describe, it, expect } from 'vitest';
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
