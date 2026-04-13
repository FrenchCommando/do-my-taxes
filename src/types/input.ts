// Matches the input.json schema from taxes1040

export interface W2Entry {
  id: string; // UI-only
  Company: string;
  Company_address: string;
  Company_city: string;
  Company_state: string;
  Company_zip: string;
  FullName: string;
  FirstName: string;
  LastName: string;
  Address: string;
  Address_apt: string;
  Address_city: string;
  Address_state: string;
  Address_zip: string;
  SSN: string;
  Wages: number;
  SocialSecurity_wages: number;
  Medicare_wages: number;
  Federal_tax: number;
  SocialSecurity_tax: number;
  Medicare_tax: number;
  State: string;
  State_tax: number;
  Local_tax: number;
  Locality: string;
}

export interface Trade {
  SalesDescription: string;
  Shares: string | number;
  DateAcquired: string;
  DateSold: string;
  WashSaleCode: string;
  Proceeds: number;
  Cost: number;
  WashSaleValue: number;
  LongShort: 'SHORT' | 'LONG';
  FormCode: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}

export interface Entry1099 {
  id: string; // UI-only
  Institution: string;
  Interest: number;
  InterestBondsObligations: number;
  'Ordinary Dividends': number;
  'Qualified Dividends': number;
  'Capital Gain Distributions': number;
  'Foreign Tax Paid': number;
  'Foreign Country': string;
  Trades: Trade[];
  Realized1256: number;
  Unrealized1256: number;
  Contract1256: boolean;
  'Other Income': number;
  'Other Description': string;
}

export interface MortgagePayment {
  Date: string;
  InterestAmount: number;
  PrincipalAmount: number;
}

export interface Entry1098 {
  id: string; // UI-only
  Recipient: string;
  LoanNumber: string;
  PrincipalBalance: number;
  Payments: MortgagePayment[];
}

export interface EstimatedPayment {
  Date: string;
  Amount: number;
}

export interface EstimatedIncomeTax {
  Federal: EstimatedPayment[];
  State: EstimatedPayment[];
}

export interface CharitableContribution {
  id: string; // UI-only
  Entity: string;
  Amount: number;
}

export interface OtherEntry {
  id: string; // UI-only
  PropertyTax: number;
  CoopStateTaxes: number;
  DaysInNYC: number;
}

export interface TaxInput {
  W2: W2Entry[];
  '1099': Entry1099[];
  '1098': Entry1098[];
  EstimatedIncomeTax: EstimatedIncomeTax;
  Charitable: CharitableContribution[];
  Other: OtherEntry[];
  // Personal / form-filling info
  occupation: string;
  phone: string;
  email: string;
  routing_number: string;
  checking: boolean;
  account_number: string;
  // HSA
  health_savings_account: boolean;
  health_savings_account_contributions: number;
  health_savings_account_employer_contributions: number;
  health_savings_account_distributions: number;
}

export function createEmptyW2(): W2Entry {
  return {
    id: crypto.randomUUID(),
    Company: '', Company_address: '', Company_city: '', Company_state: '', Company_zip: '',
    FullName: '', FirstName: '', LastName: '',
    Address: '', Address_apt: '', Address_city: '', Address_state: '', Address_zip: '',
    SSN: '',
    Wages: 0, SocialSecurity_wages: 0, Medicare_wages: 0,
    Federal_tax: 0, SocialSecurity_tax: 0, Medicare_tax: 0,
    State: '', State_tax: 0, Local_tax: 0, Locality: '',
  };
}

export function createEmpty1099(): Entry1099 {
  return {
    id: crypto.randomUUID(),
    Institution: '',
    Interest: 0, InterestBondsObligations: 0,
    'Ordinary Dividends': 0, 'Qualified Dividends': 0,
    'Capital Gain Distributions': 0,
    'Foreign Tax Paid': 0, 'Foreign Country': '',
    Trades: [],
    Realized1256: 0, Unrealized1256: 0, Contract1256: false,
    'Other Income': 0, 'Other Description': '',
  };
}

export function createEmpty1098(): Entry1098 {
  return {
    id: crypto.randomUUID(),
    Recipient: '', LoanNumber: '', PrincipalBalance: 0,
    Payments: [],
  };
}

export function createEmptyCharitable(): CharitableContribution {
  return { id: crypto.randomUUID(), Entity: '', Amount: 0 };
}

export function createEmptyOther(): OtherEntry {
  return { id: crypto.randomUUID(), PropertyTax: 0, CoopStateTaxes: 0, DaysInNYC: 0 };
}

export function createDefaultInput(): TaxInput {
  return {
    W2: [
      {
        id: crypto.randomUUID(),
        Company: 'Good Company & CO LLC',
        Company_address: '100 100TH AVE 100TH FLOOR',
        Company_city: 'NEW YORK', Company_state: 'NY', Company_zip: '10000',
        FullName: 'Commando French', FirstName: 'French', LastName: 'Commando',
        Address: '111 111TH ST', Address_apt: '11A',
        Address_city: 'BROOKLYN', Address_state: 'NY', Address_zip: '11111',
        SSN: 'XXXXX5555',
        Wages: 999999.99, SocialSecurity_wages: 176100.0, Medicare_wages: 333333.33,
        Federal_tax: 66666.66, SocialSecurity_tax: 9999.0, Medicare_tax: 9999.99,
        State: 'NY', State_tax: 11111.11, Local_tax: 4444.44, Locality: 'NEW YORK',
      },
    ],
    '1099': [
      {
        id: crypto.randomUUID(),
        Institution: 'Second Bank Capital Management, LLC',
        Interest: 10.09, InterestBondsObligations: 0,
        'Ordinary Dividends': 2000.22, 'Qualified Dividends': 2000.22,
        'Capital Gain Distributions': 0, 'Foreign Tax Paid': 0, 'Foreign Country': '',
        Trades: [], Realized1256: 0, Unrealized1256: 0, Contract1256: false,
        'Other Income': 0, 'Other Description': '',
      },
      {
        id: crypto.randomUUID(),
        Institution: 'Big Bank HOLDINGS, INC.',
        Interest: 13.72, InterestBondsObligations: 1234.56,
        'Ordinary Dividends': 1955.32, 'Qualified Dividends': 168.71,
        'Capital Gain Distributions': 0, 'Foreign Tax Paid': 800.99, 'Foreign Country': 'Various',
        Trades: [
          { SalesDescription: 'Aggregated', Shares: 'Aggregated', DateAcquired: 'Aggregated', DateSold: 'Aggregated', WashSaleCode: 'Aggregated', Proceeds: 120000, Cost: 10000, WashSaleValue: 0, LongShort: 'SHORT', FormCode: 'A' },
          { SalesDescription: 'Aggregated', Shares: 'Aggregated', DateAcquired: 'Aggregated', DateSold: 'Aggregated', WashSaleCode: 'Aggregated', Proceeds: 212000, Cost: 200000, WashSaleValue: 0, LongShort: 'LONG', FormCode: 'D' },
          { SalesDescription: 'SOME ETF', Shares: '500', DateAcquired: '2025/04/15', DateSold: '2025/07/20', WashSaleCode: '', Proceeds: 36000, Cost: 26000, WashSaleValue: 0, LongShort: 'SHORT', FormCode: 'B' },
        ],
        Realized1256: 500.99, Unrealized1256: -88.88, Contract1256: false,
        'Other Income': 0, 'Other Description': '',
      },
      {
        id: crypto.randomUUID(),
        Institution: 'Department of the Treasury',
        Interest: 1050.75, InterestBondsObligations: 0,
        'Ordinary Dividends': 0, 'Qualified Dividends': 0,
        'Capital Gain Distributions': 0, 'Foreign Tax Paid': 0, 'Foreign Country': '',
        Trades: [], Realized1256: 0, Unrealized1256: 0, Contract1256: false,
        'Other Income': 0, 'Other Description': '',
      },
      {
        id: crypto.randomUUID(),
        Institution: 'Medium BANK USA',
        Interest: 2.0, InterestBondsObligations: 0,
        'Ordinary Dividends': 0, 'Qualified Dividends': 0,
        'Capital Gain Distributions': 0, 'Foreign Tax Paid': 0, 'Foreign Country': '',
        Trades: [], Realized1256: 0, Unrealized1256: 0, Contract1256: false,
        'Other Income': 600, 'Other Description': 'CASHPLUS',
      },
      {
        id: crypto.randomUUID(),
        Institution: '',
        Interest: 0, InterestBondsObligations: 0,
        'Ordinary Dividends': 0, 'Qualified Dividends': 0,
        'Capital Gain Distributions': 0, 'Foreign Tax Paid': 0, 'Foreign Country': '',
        Trades: [
          { SalesDescription: 'CRYPTO DOLLAR', Shares: 50000, DateAcquired: '2023/01/01', DateSold: '2025/07/04', WashSaleCode: '', Proceeds: 50000, Cost: 50000, WashSaleValue: 0, LongShort: 'LONG', FormCode: 'F' },
        ],
        Realized1256: 0, Unrealized1256: 0, Contract1256: false,
        'Other Income': 0, 'Other Description': '',
      },
    ],
    '1098': [
      {
        id: crypto.randomUUID(),
        Recipient: 'Big Lender Bank Bank N.A.',
        LoanNumber: '11111111111',
        PrincipalBalance: 1000000,
        Payments: [
          { Date: '2025-09-18', InterestAmount: 2000, PrincipalAmount: 0 },
          { Date: '2025-11-01', InterestAmount: 5000, PrincipalAmount: 800 },
          { Date: '2025-12-01', InterestAmount: 5000, PrincipalAmount: 800 },
        ],
      },
    ],
    EstimatedIncomeTax: {
      Federal: [
        { Date: '2025-01-28', Amount: 5000.00 },
        { Date: '2025-10-09', Amount: 10000.00 },
      ],
      State: [
        { Date: '2025-10-07', Amount: 4000.00 },
      ],
    },
    Charitable: [
      { id: crypto.randomUUID(), Entity: 'Brooklyn Botanic Garden', Amount: 152 },
    ],
    Other: [
      { id: crypto.randomUUID(), PropertyTax: 2500, CoopStateTaxes: 10, DaysInNYC: 365 },
    ],
    occupation: 'working', phone: '555-555-5555', email: 'blah@gmail.com',
    routing_number: '021000011', checking: true, account_number: '11112222333',
    health_savings_account: false,
    health_savings_account_contributions: 0,
    health_savings_account_employer_contributions: 0,
    health_savings_account_distributions: 0,
  };
}
