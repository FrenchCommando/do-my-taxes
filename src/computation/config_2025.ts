// From computation/forms_core_2025.py CONFIG_2025
// and computation/forms_functions.py computation_2025, computation_2025_ny, etc.

import {
  k_1040, k_6251, k_1116,
} from './form_names';

export const CONFIG_2025 = {
  year: '2025',
  standard_deduction: 15_750,
  amt_exemption: 88_100,
  amt_28pct_threshold: 239_100,
  amt_28pct_excess: 4_782,
  qualified_div_0pct: 48_350,
  qualified_div_20pct: 533_400,
  should_fill_6251_exemption: 88_100,
  should_fill_6251_phaseout: 626_350,
  should_fill_6251_28pct: 232_600,
  salt_limit: 40_000,
  salt_phaseout_start: 500_000,
  salt_phaseout_rate: 0.30,
  salt_floor: 10_000,
  ny_standard_deduction: 8_000,
  ny_itemized_deduction_threshold: 340_700,
  mortgage_limit: 750_000,
  ny_mortgage_limit: 1_000_000,
  hsa_max_contribution: 4_300,
  niit_threshold: 200_000,
  trades_per_page_limit: 11,
  field_maps: {
    [k_1040]: {
      '11': '11_a',
      '12': '12_e',
      '13': '13_a',
      '7_n': null,  // removed in 2025
      '7_value': '7_a',
      '26': '26_value',
      '28': '28_value',
    },
    [k_6251]: {
      '1_value': '1_a',
      ...Object.fromEntries('abcdefghijklmnopqrst'.split('').map(c => [`2${c}_value`, `2_${c}`])),
      ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`${i + 3}_value`, `${i + 3}`])),
    },
    [k_1116]: {
      'i_1a_source1': 'i_1a_source',
    },
  },
};

export type TaxConfig = typeof CONFIG_2025;

// Piecewise linear bracket functions from forms_functions.py
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

export function computation_2025_ny(amount: number): number {
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

export function computation_2025_ny_recapture(amount: number, gross: number): number {
  if (gross <= 107_650) return 0;
  if (amount <= 215_400) {
    const tax = computation_2025_ny(amount);
    if (gross >= 157_650) return 0.06 * amount - tax;
    return (0.06 * amount - tax) * Math.round((gross - 107_650) / 50_000 * 10000) / 10000;
  }
  if (amount <= 1_077_550)
    return 568 + 1_831 * Math.round(Math.min(50_000, gross - 215_400) / 50_000 * 10000) / 10000;
  if (amount <= 5_000_000)
    return 2_399 + 30_172 * Math.round(Math.min(50_000, gross - 1_077_550) / 50_000 * 10000) / 10000;
  if (amount <= 25_000_000)
    return 32_571 + 32_500 * Math.round(Math.min(50_000, gross - 5_000_000) / 50_000 * 10000) / 10000;
  return 65_071 + 150_000 * Math.round(Math.min(50_000, gross - 25_000_000) / 50_000 * 10000) / 10000;
}

export function computation_2025_nyc(amount: number): number {
  if (amount <= 12_000) return amount * 0.03078;
  if (amount <= 25_000) return 369 + (amount - 12_000) * 0.03762;
  if (amount <= 50_000) return 858 + (amount - 25_000) * 0.03819;
  return 1_813 + (amount - 50_000) * 0.03876;
}
