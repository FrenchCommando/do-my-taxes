import { describe, it, expect } from 'vitest';
import { computeAllWithRates } from './compute';
import { createDefaultInput } from '../types/input';
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
  return {
    W2: [],
    '1099': [],
    '1098': [],
    EstimatedIncomeTax: { Federal: [], State: [] },
    Charitable: [],
    Other: [],
    occupation: '',
    phone: '',
    email: '',
    routing_number: '',
    checking: false,
    account_number: '',
    prior_year: null,
    health_savings_account: false,
    health_savings_account_contributions: 0,
    health_savings_account_employer_contributions: 0,
    health_savings_account_distributions: 0,
  };
}

describe('compute taxes', () => {
  it('default sample input produces no NaN', () => {
    const input = createDefaultInput();
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(result.worksheets, 'worksheets');
    noNaN(result.carryover, 'carryover');
    noNaN(marginalRates, 'marginalRates');
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
    input.Charitable = [{ id: 'c1', Entity: 'Charity', Amount: 5000 }];
    input.Other = [{ id: 'o1', PropertyTax: 10000, CoopStateTaxes: 0, DaysInNYC: 365 }];
    const { result, marginalRates } = computeAllWithRates(input);
    noNaN(result.formsState, 'formsState');
    noNaN(result.summaryInfo, 'summaryInfo');
    noNaN(marginalRates, 'marginalRates');
  });
});
