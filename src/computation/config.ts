// Port of taxes1040 computation/forms_core_2025.py, forms_core_2026.py (CONFIG_{year})
// and the bracket functions from computation/forms_functions.py

import { k_1040, k_6251, k_1116 } from './form_names';

export type FilingStatus = 'single' | 'married_filing_jointly';
export const FILING_STATUSES: FilingStatus[] = ['single', 'married_filing_jointly'];
export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  married_filing_jointly: 'Married filing jointly',
};

export type TaxYear = '2025' | '2026';
export const TAX_YEARS: TaxYear[] = ['2025', '2026'];
/** Years whose forms / NY numbers are not final yet (see taxes1040 forms/2026/notes.md). */
export const PROVISIONAL_YEARS: TaxYear[] = ['2026'];

export type BracketFunction = (amount: number) => number;
export type RecaptureFunction = (amount: number, gross: number, exact?: boolean) => number;
/** A string renames the field, null drops it, an array copies the value to several fields. */
export type FieldMap = Record<string, string | string[] | null>;

export interface TaxConfig {
  year: TaxYear;
  computation: BracketFunction;
  computation_ny: BracketFunction;
  computation_ny_recapture: RecaptureFunction;
  computation_nyc: BracketFunction;
  standard_deduction: number;
  amt_exemption: number;
  amt_28pct_threshold: number;
  amt_28pct_excess: number;
  /** 0.25 through 2025, 0.50 from 2026 (OBBBA) */
  amt_phaseout_rate?: number;
  qualified_div_0pct: number;
  qualified_div_20pct: number;
  should_fill_6251_exemption: number;
  /** also the Form 6251 exemption phaseout start */
  should_fill_6251_phaseout: number;
  salt_limit: number;
  salt_phaseout_start: number;
  salt_phaseout_rate: number;
  salt_floor: number;
  /** 2026+: cash gifts deducted on top of the standard deduction */
  charitable_nonitemizer_limit?: number;
  /** 2026+: Schedule A charitable gifts reduced by this fraction of AGI */
  charitable_agi_floor_rate?: number;
  /** 2026+: IRC 68 2/37 limitation of itemized deductions */
  itemized_limitation_rate?: number;
  ny_standard_deduction: number;
  ny_itemized_deduction_threshold: number;
  ny_itemized_adjustment_start: number;
  mortgage_limit: number;
  ny_mortgage_limit: number;
  hsa_max_contribution: number;
  hsa_max_contribution_family: number;
  capital_loss_limit: number;
  social_security_max_withholding: number;
  additional_medicare_threshold: number;
  niit_threshold: number;
  nyc_school_fixed_credit: number;
  nyc_school_rate_reduction_threshold: number;
  nyc_school_rate_reduction_base: number;
  fed_brackets: number[];
  ny_brackets: number[];
  nyc_brackets: number[];
  ny_recapture_brackets: number[];
  trades_per_page_limit: number;
  form_6251_line_1_split: boolean;
  schedule_1a: boolean;
  tips_deduction_max: number;
  overtime_deduction_max: number;
  tips_overtime_phaseout_start: number;
  car_loan_interest_max: number;
  car_loan_phaseout_start: number;
  senior_deduction: number;
  senior_phaseout_start: number;
  senior_phaseout_rate: number;
  /** born before this date (YYYY-MM-DD) = age 65 by year end */
  senior_birth_cutoff: string;
  field_maps: Record<string, FieldMap> | null;
  /** filing-status-specific values; anything not listed falls back to the single value */
  filing_status_overrides?: Partial<Record<FilingStatus, Partial<TaxConfig>>>;
  /** skip rounding (marginal rates measure slopes of the unrounded piecewise-linear tax) */
  exact?: boolean;
}

/** Overlay the filing-status-specific values on top of the (single) defaults. */
export function resolveConfig(config: TaxConfig, filingStatus: FilingStatus): TaxConfig {
  if (!FILING_STATUSES.includes(filingStatus)) {
    throw new Error(`Unsupported filing status ${filingStatus} - expected one of ${FILING_STATUSES.join(', ')}`);
  }
  return { ...config, ...(config.filing_status_overrides?.[filingStatus] ?? {}) };
}

/** IT-201-I recapture worksheets round the phase-in fraction to 4 decimals (exact skips it). */
function phaseInFraction(value: number, exact = false): number {
  return exact ? value : Math.round(value * 10000) / 10000;
}

// ===================== 2025 =====================

export function computation_2025(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 11_925) return amount * 0.10;
  if (amount <= 48_475) return 1_192.50 + (amount - 11_925) * 0.12;
  if (amount <= 103_350) return 5_578.50 + (amount - 48_475) * 0.22;
  if (amount <= 197_300) return 17_651 + (amount - 103_350) * 0.24;
  if (amount <= 250_525) return 40_199 + (amount - 197_300) * 0.32;
  if (amount <= 626_350) return 57_231 + (amount - 250_525) * 0.35;
  return 188_769.75 + (amount - 626_350) * 0.37;
}

export function computation_2025_mfj(amount: number): number {
  // 1040 instructions 2025, Tax Computation Worksheet Section B
  if (amount <= 0) return 0;
  if (amount <= 23_850) return amount * 0.10;
  if (amount <= 96_950) return 2_385 + (amount - 23_850) * 0.12;
  if (amount <= 206_700) return 11_157 + (amount - 96_950) * 0.22;
  if (amount <= 394_600) return 35_302 + (amount - 206_700) * 0.24;
  if (amount <= 501_050) return 80_398 + (amount - 394_600) * 0.32;
  if (amount <= 751_600) return 114_462 + (amount - 501_050) * 0.35;
  return 202_154.50 + (amount - 751_600) * 0.37;
}

export function computation_2025_ny(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 8_500) return amount * 0.04;
  if (amount <= 11_700) return 340 + (amount - 8_500) * 0.045;
  if (amount <= 13_900) return 484 + (amount - 11_700) * 0.0525;
  if (amount <= 80_650) return 600 + (amount - 13_900) * 0.0550;
  if (amount <= 215_400) return 4_271 + (amount - 80_650) * 0.06;
  if (amount <= 1_077_550) return 12_356 + (amount - 215_400) * 0.0685;
  if (amount <= 5_000_000) return 71_413 + (amount - 1_077_550) * 0.0965;
  if (amount <= 25_000_000) return 449_929 + (amount - 5_000_000) * 0.1030;
  return 2_509_929 + (amount - 25_000_000) * 0.1090;
}

export function computation_2025_ny_recapture(amount: number, gross: number, exact = false): number {
  // single and married filing separately; recapture triggers on AGI (gross), not taxable income (amount)
  if (gross <= 107_650) return 0;
  if (amount <= 215_400) {
    const tax = computation_2025_ny(amount);
    if (gross >= 157_650) return 0.06 * amount - tax;
    return (0.06 * amount - tax) * phaseInFraction((gross - 107_650) / 50_000, exact);
  }
  if (amount <= 1_077_550)
    return 568 + 1_831 * phaseInFraction(Math.min(50_000, gross - 215_400) / 50_000, exact);
  if (amount <= 5_000_000)
    return 2_399 + 30_172 * phaseInFraction(Math.min(50_000, gross - 1_077_550) / 50_000, exact);
  if (amount <= 25_000_000)
    return 32_571 + 32_500 * phaseInFraction(Math.min(50_000, gross - 5_000_000) / 50_000, exact);
  return 65_071 + 150_000 * phaseInFraction(Math.min(50_000, gross - 25_000_000) / 50_000, exact);
}

export function computation_2025_nyc(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 12_000) return amount * 0.03078;
  if (amount <= 25_000) return 369 + (amount - 12_000) * 0.03762;
  if (amount <= 50_000) return 858 + (amount - 25_000) * 0.03819;
  return 1_813 + (amount - 50_000) * 0.03876;
}

// IT-201-I, NYS tax rate schedule, filing status 2 and 5 (unchanged 2024 -> 2025)
export function computation_2025_ny_mfj(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 17_150) return amount * 0.04;
  if (amount <= 23_600) return 686 + (amount - 17_150) * 0.045;
  if (amount <= 27_900) return 976 + (amount - 23_600) * 0.0525;
  if (amount <= 161_550) return 1_202 + (amount - 27_900) * 0.0550;
  if (amount <= 323_200) return 8_553 + (amount - 161_550) * 0.06;
  if (amount <= 2_155_350) return 18_252 + (amount - 323_200) * 0.0685;
  if (amount <= 5_000_000) return 143_754 + (amount - 2_155_350) * 0.0965;
  if (amount <= 25_000_000) return 418_263 + (amount - 5_000_000) * 0.1030;
  return 2_478_263 + (amount - 25_000_000) * 0.1090;
}

// IT-201-I tax computation worksheets 1-6 (married filing jointly / qualifying surviving spouse)
export function computation_2025_ny_recapture_mfj(amount: number, gross: number, exact = false): number {
  if (gross <= 107_650) return 0;
  if (amount <= 161_550) {
    const tax = computation_2025_ny_mfj(amount);
    if (gross >= 157_650) return 0.055 * amount - tax;
    return (0.055 * amount - tax) * phaseInFraction((gross - 107_650) / 50_000, exact);
  }
  if (amount <= 323_200)
    return 333 + 807 * phaseInFraction(Math.min(50_000, gross - 161_550) / 50_000, exact);
  if (amount <= 2_155_350)
    return 1_140 + 2_747 * phaseInFraction(Math.min(50_000, gross - 323_200) / 50_000, exact);
  if (amount <= 5_000_000)
    return 3_887 + 60_350 * phaseInFraction(Math.min(50_000, gross - 2_155_350) / 50_000, exact);
  if (amount <= 25_000_000)
    return 64_237 + 32_500 * phaseInFraction(Math.min(50_000, gross - 5_000_000) / 50_000, exact);
  // worksheet 6: flat 10.9% of taxable income
  return 0.1090 * amount - computation_2025_ny_mfj(amount);
}

export function computation_2025_nyc_mfj(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 21_600) return amount * 0.03078;
  if (amount <= 45_000) return 665 + (amount - 21_600) * 0.03762;
  if (amount <= 90_000) return 1_545 + (amount - 45_000) * 0.03819;
  return 3_264 + (amount - 90_000) * 0.03876;
}

// ===================== 2026 =====================
// Federal: Rev. Proc. 2025-32 section 4.01, Table 3 (single) and Table 1 (MFJ / surviving spouse)

export function computation_2026(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 12_400) return amount * 0.10;
  if (amount <= 50_400) return 1_240 + (amount - 12_400) * 0.12;
  if (amount <= 105_700) return 5_800 + (amount - 50_400) * 0.22;
  if (amount <= 201_775) return 17_966 + (amount - 105_700) * 0.24;
  if (amount <= 256_225) return 41_024 + (amount - 201_775) * 0.32;
  if (amount <= 640_600) return 58_448 + (amount - 256_225) * 0.35;
  return 192_979.25 + (amount - 640_600) * 0.37;
}

export function computation_2026_mfj(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 24_800) return amount * 0.10;
  if (amount <= 100_800) return 2_480 + (amount - 24_800) * 0.12;
  if (amount <= 211_400) return 11_600 + (amount - 100_800) * 0.22;
  if (amount <= 403_550) return 35_932 + (amount - 211_400) * 0.24;
  if (amount <= 512_450) return 82_048 + (amount - 403_550) * 0.32;
  if (amount <= 768_700) return 116_896 + (amount - 512_450) * 0.35;
  return 206_583.50 + (amount - 768_700) * 0.37;
}

// 2026 NY / NYC: PROVISIONAL - the 2026 IT-201-I rate schedules are not published yet, so the 2025
// schedules are reused. NY's FY2026 budget cut the lower brackets for 2026; replace once published.
export const computation_2026_ny = computation_2025_ny;
export const computation_2026_ny_recapture = computation_2025_ny_recapture;
export const computation_2026_nyc = computation_2025_nyc;
export const computation_2026_ny_mfj = computation_2025_ny_mfj;
export const computation_2026_ny_recapture_mfj = computation_2025_ny_recapture_mfj;
export const computation_2026_nyc_mfj = computation_2025_nyc_mfj;

// ===================== CONFIGS =====================

const FIELD_MAPS_2025: Record<string, FieldMap> = {
  [k_1040]: {
    '11': ['11_a', '11_b'],  // AGI is repeated as 11b at the top of page 2
    '12': '12_e',
    '13': '13_a',
    '7_n': null,  // removed in 2025
    '7_value': '7_a',
    '26': '26_value',
    '28': '28_value',
  },
  [k_6251]: {
    '1a_value': '1_a',  // 2025 split line 1 into 1a (line 14 - senior deduction) and 1b
    '1_value': '1_b',
    ...Object.fromEntries('abcdefghijklmnopqrst'.split('').map(letter => [`2${letter}_value`, `2_${letter}`])),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`${index + 3}_value`, `${index + 3}`])),
  },
  [k_1116]: {
    'i_1a_source1': 'i_1a_source',  // 2024 has 3 source fields, 2025 merged to 1
  },
};

// Schedule 1-A (2025-2028, OBBBA): amounts are fixed in the law, not inflation-adjusted
const SCHEDULE_1A = {
  schedule_1a: true,
  tips_deduction_max: 25_000,
  overtime_deduction_max: 12_500,  // $25,000 MFJ
  tips_overtime_phaseout_start: 150_000,  // $300,000 MFJ, $100 per $1,000 over
  car_loan_interest_max: 10_000,
  car_loan_phaseout_start: 100_000,  // $200,000 MFJ, $200 per $1,000 (rounded up) over
  senior_deduction: 6_000,  // per person
  senior_phaseout_start: 75_000,  // $150,000 MFJ
  senior_phaseout_rate: 0.06,
};

const SCHEDULE_1A_MFJ = {
  overtime_deduction_max: 25_000,
  tips_overtime_phaseout_start: 300_000,
  car_loan_phaseout_start: 200_000,
  senior_phaseout_start: 150_000,
};

// NY / NYC MFJ values (2025, reused provisionally for 2026)
const NY_MFJ_2025 = {
  ny_standard_deduction: 16_050,
  ny_itemized_deduction_threshold: 408_850,
  ny_itemized_adjustment_start: 200_000,
  nyc_school_fixed_credit: 125,
  nyc_school_rate_reduction_threshold: 21_600,
  nyc_school_rate_reduction_base: 37,
  ny_brackets: [17_150, 23_600, 27_900, 161_550, 323_200, 2_155_350, 5_000_000, 25_000_000],
  nyc_brackets: [21_600, 45_000, 90_000],
  ny_recapture_brackets: [161_550, 323_200, 2_155_350, 5_000_000, 25_000_000],
};

export const CONFIG_2025: TaxConfig = {
  year: '2025',
  computation: computation_2025,
  computation_ny: computation_2025_ny,
  computation_ny_recapture: computation_2025_ny_recapture,
  computation_nyc: computation_2025_nyc,
  standard_deduction: 15_750,
  amt_exemption: 88_100,
  // Form 6251 line 7: 26% up to $239,100, 28% above (i6251 instructions)
  amt_28pct_threshold: 239_100,
  amt_28pct_excess: 4_782,
  qualified_div_0pct: 48_350,
  qualified_div_20pct: 533_400,
  should_fill_6251_exemption: 88_100,
  should_fill_6251_phaseout: 626_350,
  salt_limit: 40_000,
  salt_phaseout_start: 500_000,
  salt_phaseout_rate: 0.30,
  salt_floor: 10_000,
  ny_standard_deduction: 8_000,
  ny_itemized_deduction_threshold: 340_700,
  mortgage_limit: 750_000,
  ny_mortgage_limit: 1_000_000,
  hsa_max_contribution: 4_300,  // self-only
  hsa_max_contribution_family: 8_550,
  capital_loss_limit: 3_000,
  social_security_max_withholding: 10_918.20,  // 6.2% of the $176,100 wage base, per person
  additional_medicare_threshold: 200_000,
  niit_threshold: 200_000,
  ny_itemized_adjustment_start: 100_000,  // IT-196 line 46 worksheet 3 line 2
  nyc_school_fixed_credit: 63,  // IT-201 line 69
  nyc_school_rate_reduction_threshold: 12_000,  // IT-201 line 69a
  nyc_school_rate_reduction_base: 21,
  fed_brackets: [11_925, 48_475, 103_350, 197_300, 250_525, 626_350],
  ny_brackets: [8_500, 11_700, 13_900, 80_650, 215_400, 1_077_550, 5_000_000, 25_000_000],
  nyc_brackets: [12_000, 25_000, 50_000],
  ny_recapture_brackets: [215_400, 1_077_550, 5_000_000, 25_000_000],
  // (SALT cap/phaseout/floor, AMT 28% threshold, mortgage limits are the same for single and MFJ)
  filing_status_overrides: {
    married_filing_jointly: {
      computation: computation_2025_mfj,
      computation_ny: computation_2025_ny_mfj,
      computation_ny_recapture: computation_2025_ny_recapture_mfj,
      computation_nyc: computation_2025_nyc_mfj,
      standard_deduction: 31_500,
      amt_exemption: 137_000,
      should_fill_6251_exemption: 137_000,
      should_fill_6251_phaseout: 1_252_700,
      qualified_div_0pct: 96_700,
      qualified_div_20pct: 600_050,
      additional_medicare_threshold: 250_000,
      niit_threshold: 250_000,
      ...SCHEDULE_1A_MFJ,
      ...NY_MFJ_2025,
      fed_brackets: [23_850, 96_950, 206_700, 394_600, 501_050, 751_600],
    },
  },
  trades_per_page_limit: 11,
  form_6251_line_1_split: true,
  ...SCHEDULE_1A,
  senior_birth_cutoff: '1961-01-02',
  field_maps: FIELD_MAPS_2025,
};

/**
 * 2026: federal amounts from Rev. Proc. 2025-32 (incl. OBBBA amendments), HSA from Rev. Proc. 2025-19,
 * SALT from IRC 164(b)(7). New OBBBA rules: AMT exemption phaseout at 50%, non-itemizer charitable
 * deduction, 0.5% AGI floor on itemized charitable gifts, IRC 68 2/37 limitation.
 * PROVISIONAL: forms not final (2025 field names), NY/NYC values are 2025 placeholders.
 */
export const CONFIG_2026: TaxConfig = {
  year: '2026',
  computation: computation_2026,
  computation_ny: computation_2026_ny,
  computation_ny_recapture: computation_2026_ny_recapture,
  computation_nyc: computation_2026_nyc,
  standard_deduction: 16_100,
  amt_exemption: 90_100,
  // Form 6251 line 7: 26% up to $244,500, 28% above (Rev. Proc. 2025-32 4.10)
  amt_28pct_threshold: 244_500,
  amt_28pct_excess: 4_890,  // 2% of 244,500
  amt_phaseout_rate: 0.50,
  qualified_div_0pct: 49_450,
  qualified_div_20pct: 545_500,
  should_fill_6251_exemption: 90_100,
  should_fill_6251_phaseout: 500_000,  // not inflation-adjusted before 2027 ($1M MFJ)
  salt_limit: 40_400,  // 101% of 2025
  salt_phaseout_start: 505_000,  // 101% of 2025
  salt_phaseout_rate: 0.30,
  salt_floor: 10_000,
  charitable_nonitemizer_limit: 1_000,  // not to donor-advised funds, $2,000 MFJ
  charitable_agi_floor_rate: 0.005,
  itemized_limitation_rate: 2 / 37,
  mortgage_limit: 750_000,
  ny_mortgage_limit: 1_000_000,
  hsa_max_contribution: 4_400,  // self-only
  hsa_max_contribution_family: 8_750,
  capital_loss_limit: 3_000,
  social_security_max_withholding: 11_439.00,  // 6.2% of the $184,500 wage base, per person
  additional_medicare_threshold: 200_000,
  niit_threshold: 200_000,
  // NY / NYC: PROVISIONAL 2025 values until the 2026 IT-201-I / IT-196-I are published
  ny_standard_deduction: 8_000,
  ny_itemized_deduction_threshold: 340_700,
  ny_itemized_adjustment_start: 100_000,
  nyc_school_fixed_credit: 63,
  nyc_school_rate_reduction_threshold: 12_000,
  nyc_school_rate_reduction_base: 21,
  fed_brackets: [12_400, 50_400, 105_700, 201_775, 256_225, 640_600],
  ny_brackets: [8_500, 11_700, 13_900, 80_650, 215_400, 1_077_550, 5_000_000, 25_000_000],
  nyc_brackets: [12_000, 25_000, 50_000],
  ny_recapture_brackets: [215_400, 1_077_550, 5_000_000, 25_000_000],
  filing_status_overrides: {
    married_filing_jointly: {
      computation: computation_2026_mfj,
      computation_ny: computation_2026_ny_mfj,
      computation_ny_recapture: computation_2026_ny_recapture_mfj,
      computation_nyc: computation_2026_nyc_mfj,
      standard_deduction: 32_200,
      amt_exemption: 140_200,
      should_fill_6251_exemption: 140_200,
      should_fill_6251_phaseout: 1_000_000,
      qualified_div_0pct: 98_900,
      qualified_div_20pct: 613_700,
      charitable_nonitemizer_limit: 2_000,
      additional_medicare_threshold: 250_000,
      niit_threshold: 250_000,
      ...SCHEDULE_1A_MFJ,
      ...NY_MFJ_2025,  // PROVISIONAL
      fed_brackets: [24_800, 100_800, 211_400, 403_550, 512_450, 768_700],
    },
  },
  trades_per_page_limit: 11,  // 2025 value, recheck on the final 2026 f8949
  form_6251_line_1_split: true,
  ...SCHEDULE_1A,
  senior_birth_cutoff: '1962-01-02',
  // PROVISIONAL: 2025 layout until the final 2026 PDFs are mapped
  field_maps: FIELD_MAPS_2025,
};

export const YEAR_CONFIGS: Record<TaxYear, TaxConfig> = {
  '2025': CONFIG_2025,
  '2026': CONFIG_2026,
};
