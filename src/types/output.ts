export interface TaxSummary {
  totalIncome: number;
  adjustedGrossIncome: number;
  taxableIncome: number;
  totalTax: number;
  totalPayments: number;
  refundOrOwed: number;
  effectiveRate: number;
  federalTaxWithheld: number;
  stateTaxWithheld: number;
}
