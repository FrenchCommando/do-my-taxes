// Port of taxes1040/marginal_rates.py — analytical marginal rate computation
// Runs once from baseline forms_state, derives exact marginal rates per income category

import type { FillTaxesResult } from './fill_taxes';
import type { TaxConfig } from './config_2025';
import {
  k_1040, k_1040sa, k_1040sd, k_1040s3, k_it201, k_it196,
  w_mortgage_interest_deduction,
} from './form_names';
import {
  CONFIG_2025,
  computation_2025,
  computation_2025_ny,
  computation_2025_nyc,
} from './config_2025';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

const FED_BRACKETS = [11_925, 48_475, 103_350, 197_300, 250_525, 626_350];
const NY_BRACKETS = [8_500, 11_700, 13_900, 80_650, 215_400, 1_077_550, 5_000_000, 25_000_000];
const NYC_BRACKETS = [12_000, 25_000, 50_000];
const NY_RECAPTURE_BRACKETS = [215_400, 1_077_550, 5_000_000, 25_000_000];

interface Baseline {
  agi: number;
  taxable_income: number;
  is_itemizing: boolean;
  itemized: number;
  net_stcg: number;
  net_ltcg: number;
  net_capital: number;
  total_qualified: number;
  ny_agi: number;
  ny_taxable: number;
  medicare_wages: number;
  salt_total: number;
  salt_deduction: number;
  foreign_tax: number;
  foreign_tax_paid: number;
  foreign_tax_limited: boolean;
  mortgage_deduction_ratio: number;
  ny_mortgage_deduction_ratio: number;
  ny_itemized: number;
  charitable_ny: number;
}

interface Rates {
  federal: number;
  ny_state: number;
  nyc: number;
  combined: number;
}

interface Segment {
  from: number;
  to: number | null;
  rates: Rates;
  next_knot?: string;
}

interface Category {
  note: string;
  segments: Segment[];
}

export interface MarginalRatesResult {
  year: string;
  baseline: D;
  marginal_rates: Record<string, Category>;
}

function bracketRate(fn: (x: number) => number, taxableIncome: number): number {
  return fn(taxableIncome + 1) - fn(taxableIncome);
}

function saltDAgi(agi: number, config: TaxConfig): number {
  if (agi <= config.salt_phaseout_start) return 0;
  const effective = config.salt_limit - config.salt_phaseout_rate * (agi - config.salt_phaseout_start);
  if (effective > config.salt_floor) return -config.salt_phaseout_rate;
  return 0;
}

function saltAgiAtFloor(config: TaxConfig): number {
  return config.salt_phaseout_start + (config.salt_limit - config.salt_floor) / config.salt_phaseout_rate;
}

function extractBaseline(result: FillTaxesResult, baseData: D): Baseline {
  const fs = result.formsState;
  const ws = result.worksheets;
  const f1040 = fs[k_1040] as D;
  const fSA = (fs[k_1040sa] || {}) as D;
  const fSD = (fs[k_1040sd] || {}) as D;
  const fIT201 = (fs[k_it201] || {}) as D;
  const fIT196 = (fs[k_it196] || {}) as D;

  const agi = f1040['11_a'] || f1040['11'] || 0;
  const taxableIncome = f1040['15'] || 0;
  const itemized = fSA['17'] || 0;
  const line12 = f1040['12_e'] ?? f1040['12'] ?? 0;
  const isItemizing = line12 === itemized;

  const hasSD = k_1040sd in fs;
  const netSTCG = hasSD ? (fSD['7'] || 0) : 0;
  const netLTCG = hasSD ? (fSD['15'] || 0) : 0;
  const netCapital = hasSD ? (fSD['16'] || 0) : 0;

  const qualifiedDividends = f1040['3_a'] || 0;
  const sdGain = hasSD ? Math.max(0, Math.min(netLTCG, netCapital)) : 0;

  const nyAGI = fIT201['33'] || 0;
  const nyTaxable = fIT201['37'] || 0;
  const medicareWages: number = baseData['W2'].reduce((s: number, w: D) => s + w['Medicare_wages'], 0);

  const saltTotal = fSA['5_d'] || 0;
  const saltDeduction = fSA['5_e'] || 0;

  const foreignTaxPaid: number = (baseData['1099'] || []).reduce((s: number, i: D) => s + (i['Foreign Tax Paid'] || 0), 0);
  const foreignTaxCredit = k_1040s3 in fs ? ((fs[k_1040s3] as D)['1'] || 0) : 0;

  const mortWs = ws[w_mortgage_interest_deduction] || [];
  let mortgageRatio = 1.0;
  let nyMortgageRatio = 1.0;
  if (mortWs.length > 14 && mortWs[12] > 0) {
    mortgageRatio = Math.min(1.0, mortWs[11] / mortWs[12]);
    nyMortgageRatio = Math.min(1.0, CONFIG_2025.ny_mortgage_limit / mortWs[12]);
  }

  return {
    agi, taxable_income: taxableIncome, is_itemizing: isItemizing,
    itemized, net_stcg: netSTCG, net_ltcg: netLTCG, net_capital: netCapital,
    total_qualified: qualifiedDividends + sdGain,
    ny_agi: nyAGI, ny_taxable: nyTaxable, medicare_wages: medicareWages,
    salt_total: saltTotal, salt_deduction: saltDeduction,
    foreign_tax: foreignTaxCredit, foreign_tax_paid: foreignTaxPaid,
    foreign_tax_limited: foreignTaxPaid > foreignTaxCredit,
    mortgage_deduction_ratio: mortgageRatio,
    ny_mortgage_deduction_ratio: nyMortgageRatio,
    ny_itemized: fIT196['49'] || 0,
    charitable_ny: fIT196['19'] || 0,
  };
}

type FedRateType = 'ordinary' | 'preferential' | 'ltcg_or_loss' | 'stcg_or_loss' | '1256';
type Mode = 'income' | 'deduction' | 'property_tax' | 'foreign_tax_credit' | 'hsa' | 'mortgage';

function rateAt(
  additional: number, bl: Baseline, config: TaxConfig,
  fedRateType: FedRateType, mode: Mode = 'income', isWages = false,
): Rates {
  const comp = computation_2025;
  const compNY = computation_2025_ny;
  const compNYC = computation_2025_nyc;

  if (mode === 'foreign_tax_credit') {
    if (bl.foreign_tax_limited) return { federal: 0, ny_state: 0, nyc: 0, combined: 0 };
    return { federal: -1.0, ny_state: 0, nyc: 0, combined: -1.0 };
  }

  if (mode === 'hsa') {
    const dSalt = saltDAgi(bl.agi - additional, config);
    const dFedTaxable = bl.is_itemizing ? 1 - dSalt : 1;
    const fedTaxable = bl.taxable_income - additional * dFedTaxable;
    const fedRate = bracketRate(comp, fedTaxable) * dFedTaxable;
    const nyRate = bracketRate(compNY, bl.ny_taxable - additional);
    const nycRate = bracketRate(compNYC, bl.ny_taxable - additional);
    const federal = r6(-fedRate);
    const ny_state = r6(-nyRate);
    const nyc = r6(-nycRate);
    return { federal, ny_state, nyc, combined: r6(federal + ny_state + nyc) };
  }

  if (mode === 'property_tax') {
    let effectiveLimit: number;
    if (bl.agi <= config.salt_phaseout_start) {
      effectiveLimit = config.salt_limit;
    } else {
      effectiveLimit = Math.max(config.salt_floor,
        config.salt_limit - config.salt_phaseout_rate * (bl.agi - config.salt_phaseout_start));
    }
    let fedRate = 0;
    if (bl.salt_total + additional <= effectiveLimit && bl.is_itemizing) {
      fedRate = bracketRate(comp, bl.taxable_income - additional);
    }
    let nyRate = 0, nycRate = 0;
    if (bl.ny_agi <= 1_000_000) {
      const newNYItemized = bl.ny_itemized + additional;
      if (newNYItemized > config.ny_standard_deduction) {
        nyRate = bracketRate(compNY, bl.ny_agi - newNYItemized);
        nycRate = bracketRate(compNYC, bl.ny_agi - newNYItemized);
      }
    }
    const federal = r6(-fedRate);
    const ny_state = r6(-nyRate);
    const nyc = r6(-nycRate);
    return { federal, ny_state, nyc, combined: r6(federal + ny_state + nyc) };
  }

  if (mode === 'mortgage') {
    const ratio = bl.mortgage_deduction_ratio;
    const deductible = additional * ratio;
    const fedTaxable = bl.taxable_income - deductible;
    let fedRate = 0;
    if (!bl.is_itemizing) {
      if (bl.itemized + deductible > config.standard_deduction) {
        fedRate = bracketRate(comp, fedTaxable);
      }
    } else {
      fedRate = bracketRate(comp, fedTaxable);
    }
    const nyRatio = bl.ny_mortgage_deduction_ratio;
    let nyRate = 0, nycRate = 0;
    if (nyRatio > 0 && bl.ny_agi <= 1_000_000) {
      const newNYItemized = bl.ny_itemized + additional * nyRatio;
      if (newNYItemized > config.ny_standard_deduction) {
        nyRate = bracketRate(compNY, bl.ny_agi - newNYItemized) * nyRatio;
        nycRate = bracketRate(compNYC, bl.ny_agi - newNYItemized) * nyRatio;
      }
    }
    const federal = r6(-fedRate * ratio);
    const ny_state = r6(-nyRate);
    const nyc = r6(-nycRate);
    return { federal, ny_state, nyc, combined: r6(federal + ny_state + nyc) };
  }

  if (mode === 'deduction') {
    const fedTaxable = bl.taxable_income - additional;
    let fedRate = 0;
    if (!bl.is_itemizing) {
      if (bl.itemized + additional > config.standard_deduction) {
        fedRate = bracketRate(comp, fedTaxable);
      }
    } else {
      fedRate = bracketRate(comp, fedTaxable);
    }
    let nyRate = 0, nycRate = 0;
    if (bl.ny_agi > 1_000_000) {
      const fraction = bl.ny_agi > 10_000_000 ? 0.25 : 0.50;
      const newNYItemized = (bl.charitable_ny + additional) * fraction;
      if (newNYItemized > config.ny_standard_deduction) {
        nyRate = bracketRate(compNY, bl.ny_agi - newNYItemized) * fraction;
        nycRate = bracketRate(compNYC, bl.ny_agi - newNYItemized) * fraction;
      }
    } else {
      const newNYItemized = bl.ny_itemized + additional;
      if (newNYItemized > config.ny_standard_deduction) {
        nyRate = bracketRate(compNY, bl.ny_agi - newNYItemized);
        nycRate = bracketRate(compNYC, bl.ny_agi - newNYItemized);
      }
    }
    const federal = r6(-fedRate);
    const ny_state = r6(-nyRate);
    const nyc = r6(-nycRate);
    return { federal, ny_state, nyc, combined: r6(federal + ny_state + nyc) };
  }

  // Income mode
  const newAgi = bl.agi + additional;
  const dSalt = saltDAgi(newAgi, config);
  const dFed = bl.is_itemizing ? 1 - dSalt : 1;
  const fedTaxable = bl.taxable_income + additional * dFed;

  let fedRate: number;
  if (fedRateType === 'ordinary') {
    fedRate = bracketRate(comp, fedTaxable) * dFed;
  } else if (fedRateType === 'preferential') {
    let pref: number;
    if (fedTaxable <= config.qualified_div_0pct) pref = 0;
    else if (fedTaxable <= config.qualified_div_20pct) pref = 0.15;
    else pref = 0.20;
    fedRate = pref * dFed;
  } else if (fedRateType === 'ltcg_or_loss') {
    if (bl.net_ltcg + additional < 0 || bl.net_capital + additional < 0) {
      fedRate = bracketRate(comp, fedTaxable) * dFed;
    } else {
      let pref: number;
      if (fedTaxable <= config.qualified_div_0pct) pref = 0;
      else if (fedTaxable <= config.qualified_div_20pct) pref = 0.15;
      else pref = 0.20;
      fedRate = pref * dFed;
    }
  } else if (fedRateType === 'stcg_or_loss') {
    if (bl.net_capital < -3000 && bl.net_capital + additional < -3000) {
      fedRate = 0;
    } else {
      fedRate = bracketRate(comp, fedTaxable) * dFed;
    }
  } else {
    // 1256
    const ordinary = bracketRate(comp, fedTaxable);
    let pref: number;
    if (bl.net_ltcg < 0 || bl.net_capital < 0) {
      pref = ordinary;
    } else {
      if (fedTaxable <= config.qualified_div_0pct) pref = 0;
      else if (fedTaxable <= config.qualified_div_20pct) pref = 0.15;
      else pref = 0.20;
    }
    fedRate = (0.60 * pref + 0.40 * ordinary) * dFed;
  }

  let extraFed = 0;
  if (isWages && bl.medicare_wages + additional > 200_000) extraFed = 0.009;
  if (!isWages && newAgi > (config.niit_threshold)) extraFed += 0.038;

  const newNYTaxable = bl.ny_taxable + additional;
  const nyRate = bracketRate(compNY, newNYTaxable);
  const nycRate = bracketRate(compNYC, newNYTaxable);

  const federal = r6(fedRate + extraFed);
  const ny_state = r6(nyRate);
  const nyc = r6(nycRate);
  return { federal, ny_state, nyc, combined: r6(federal + ny_state + nyc) };
}

function r6(x: number): number { return Math.round(x * 1_000_000) / 1_000_000; }

function findKnotsIncome(bl: Baseline, config: TaxConfig, isWages: boolean): [number, string][] {
  const knots: [number, string][] = [];
  const dSalt = saltDAgi(bl.agi, config);
  const dFed = bl.is_itemizing ? 1 - dSalt : 1;

  if (bl.agi < config.salt_phaseout_start) {
    knots.push([config.salt_phaseout_start - bl.agi, 'SALT phaseout begins']);
    knots.push([saltAgiAtFloor(config) - bl.agi, 'SALT hits floor']);
  } else if (bl.agi < saltAgiAtFloor(config)) {
    knots.push([saltAgiAtFloor(config) - bl.agi, 'SALT hits floor']);
  }

  for (const bracket of FED_BRACKETS) {
    if (bracket > bl.taxable_income) {
      knots.push([(bracket - bl.taxable_income) / dFed, `Federal bracket at taxable $${bracket.toLocaleString()}`]);
    }
  }
  for (const key of ['qualified_div_0pct', 'qualified_div_20pct'] as const) {
    const bracket = config[key];
    if (bracket > bl.taxable_income) {
      knots.push([(bracket - bl.taxable_income) / dFed, `Preferential rate at taxable $${bracket.toLocaleString()}`]);
    }
  }

  if (isWages && bl.medicare_wages < 200_000) {
    knots.push([200_000 - bl.medicare_wages, 'Additional Medicare Tax begins ($200k)']);
  }
  if (!isWages && bl.agi < config.niit_threshold) {
    knots.push([config.niit_threshold - bl.agi, `NIIT begins (MAGI > $${config.niit_threshold.toLocaleString()})`]);
  }

  if (bl.ny_agi <= 1_000_000) knots.push([1_000_000 - bl.ny_agi, 'NYAGI crosses $1M']);
  if (bl.ny_agi <= 10_000_000 && bl.charitable_ny > 0) {
    knots.push([10_000_000 - bl.ny_agi, 'NYAGI crosses $10M (cliff)']);
  }

  for (const bracket of NY_BRACKETS) {
    if (bracket > bl.ny_taxable) knots.push([bracket - bl.ny_taxable, `NY bracket at taxable $${bracket.toLocaleString()}`]);
  }
  for (const bracket of NYC_BRACKETS) {
    if (bracket > bl.ny_taxable) knots.push([bracket - bl.ny_taxable, `NYC bracket at taxable $${bracket.toLocaleString()}`]);
  }
  for (const bracket of NY_RECAPTURE_BRACKETS) {
    if (bracket > bl.ny_taxable) knots.push([bracket - bl.ny_taxable, `NY recapture cliff at $${bracket.toLocaleString()}`]);
  }

  return dedup(knots);
}

function findKnotsCharitable(bl: Baseline, config: TaxConfig): [number, string][] {
  const knots: [number, string][] = [];
  for (const bracket of [...FED_BRACKETS].reverse()) {
    if (bracket < bl.taxable_income) knots.push([bl.taxable_income - bracket, `Federal bracket at taxable $${bracket.toLocaleString()}`]);
  }
  if (bl.ny_agi > 1_000_000) {
    const fraction = bl.ny_agi > 10_000_000 ? 0.25 : 0.50;
    const currentNYItemized = bl.charitable_ny * fraction;
    if (currentNYItemized <= config.ny_standard_deduction) {
      const needed = config.ny_standard_deduction / fraction - bl.charitable_ny;
      if (needed > 0) knots.push([needed, `NY itemized exceeds NY standard deduction`]);
    }
    for (const bracket of [...NY_BRACKETS].reverse()) {
      if (bracket < bl.ny_agi) {
        const add = (bl.ny_agi - bracket) / fraction - bl.charitable_ny;
        if (add > 0) knots.push([add, `NY bracket at taxable $${bracket.toLocaleString()}`]);
      }
    }
  } else if (bl.ny_itemized > config.ny_standard_deduction) {
    for (const bracket of [...NY_BRACKETS].reverse()) {
      if (bracket < bl.ny_agi - bl.ny_itemized) {
        const add = bl.ny_agi - bl.ny_itemized - bracket;
        if (add > 0) knots.push([add, `NY bracket at taxable $${bracket.toLocaleString()}`]);
      }
    }
  }
  return dedup(knots);
}

function findKnotsHSA(bl: Baseline, config: TaxConfig): [number, string][] {
  const knots: [number, string][] = [];
  for (const bracket of [...FED_BRACKETS].reverse()) {
    if (bracket < bl.taxable_income) knots.push([bl.taxable_income - bracket, `Federal bracket at taxable $${bracket.toLocaleString()}`]);
  }
  for (const bracket of [...NY_BRACKETS].reverse()) {
    if (bracket < bl.ny_taxable) knots.push([bl.ny_taxable - bracket, `NY bracket at taxable $${bracket.toLocaleString()}`]);
  }
  const hsaMax = config.hsa_max_contribution;
  if (hsaMax > 0) {
    const filtered = knots.filter(([x]) => x < hsaMax);
    filtered.push([hsaMax, `HSA max contribution $${hsaMax.toLocaleString()}`]);
    return dedup(filtered);
  }
  return dedup(knots);
}

function findKnotsMortgage(bl: Baseline, _config: TaxConfig): [number, string][] {
  const knots: [number, string][] = [];
  const ratio = bl.mortgage_deduction_ratio;
  if (ratio <= 0) return knots;
  for (const bracket of [...FED_BRACKETS].reverse()) {
    if (bracket < bl.taxable_income) {
      knots.push([Math.round((bl.taxable_income - bracket) / ratio), `Federal bracket at taxable $${bracket.toLocaleString()}`]);
    }
  }
  return dedup(knots);
}

function findKnotsPropertyTax(bl: Baseline, config: TaxConfig): [number, string][] {
  const knots: [number, string][] = [];
  let effectiveLimit: number;
  if (bl.agi <= config.salt_phaseout_start) {
    effectiveLimit = config.salt_limit;
  } else {
    effectiveLimit = Math.max(config.salt_floor,
      config.salt_limit - config.salt_phaseout_rate * (bl.agi - config.salt_phaseout_start));
  }
  if (bl.salt_total < effectiveLimit) {
    const headroom = effectiveLimit - bl.salt_total;
    knots.push([Math.round(headroom), `SALT total reaches effective limit $${effectiveLimit.toLocaleString()}`]);
  }
  return dedup(knots);
}

function dedup(knots: [number, string][]): [number, string][] {
  const filtered = knots.filter(([x]) => x > 0).map(([x, d]) => [Math.round(x), d] as [number, string]);
  filtered.sort((a, b) => a[0] - b[0]);
  const collapsed: [number, string][] = [];
  for (const [dollar, desc] of filtered) {
    if (collapsed.length > 0 && collapsed[collapsed.length - 1][0] === dollar) {
      collapsed[collapsed.length - 1] = [dollar, collapsed[collapsed.length - 1][1] + '; ' + desc];
    } else {
      collapsed.push([dollar, desc]);
    }
  }
  return collapsed;
}

function buildSegments(
  knots: [number, string][], bl: Baseline, config: TaxConfig,
  fedRateType: FedRateType, mode: Mode = 'income', isWages = false,
): Segment[] {
  const segments: Segment[] = [];
  const boundaries = [0, ...knots.map(([x]) => x)];
  for (let idx = 0; idx < boundaries.length; idx++) {
    const start = boundaries[idx];
    const end = idx + 1 < boundaries.length ? boundaries[idx + 1] : null;
    const description = idx < knots.length ? knots[idx][1] : undefined;

    let evalPoint = start + 1;
    if (mode === 'deduction' && bl.ny_agi > 1_000_000) {
      const fraction = bl.ny_agi > 10_000_000 ? 0.25 : 0.50;
      evalPoint = start + Math.ceil(1 / fraction) + 1;
    }

    const rates = rateAt(evalPoint, bl, config, fedRateType, mode, isWages);
    const segment: Segment = { from: start, to: end, rates };
    if (description) segment.next_knot = description;
    segments.push(segment);
  }
  return segments;
}

export function computeMarginalRates(result: FillTaxesResult, baseData: D): MarginalRatesResult {
  const config = CONFIG_2025;
  const bl = extractBaseline(result, baseData);

  const incomeKnots = findKnotsIncome(bl, config, false);
  const wagesKnots = findKnotsIncome(bl, config, true);
  const charitableKnots = findKnotsCharitable(bl, config);
  const hsaKnots = findKnotsHSA(bl, config);
  const mortgageKnots = findKnotsMortgage(bl, config);
  const propertyTaxKnots = findKnotsPropertyTax(bl, config);

  const stcgInLoss = bl.net_stcg < 0;
  const ltcgInLoss = bl.net_ltcg < 0 || bl.net_capital < 0;

  const categories: Record<string, Category> = {
    'W2 Wages': {
      note: 'Ordinary income + 0.9% Additional Medicare Tax (wages > $200k)',
      segments: buildSegments(wagesKnots, bl, config, 'ordinary', 'income', true),
    },
    'Short-term capital gain': {
      note: 'Taxed as ordinary income + 3.8% NIIT' + (stcgInLoss ? '; net STCG in loss' : ''),
      segments: buildSegments(incomeKnots, bl, config, stcgInLoss ? 'stcg_or_loss' : 'ordinary'),
    },
    'Long-term capital gain': {
      note: ltcgInLoss
        ? 'Net losses absorb gain — taxed at ordinary rates + 3.8% NIIT'
        : 'Preferential rate + 3.8% NIIT',
      segments: buildSegments(incomeKnots, bl, config, ltcgInLoss ? 'ltcg_or_loss' : 'preferential'),
    },
    'Qualified dividends': {
      note: 'Preferential rate + 3.8% NIIT',
      segments: buildSegments(incomeKnots, bl, config, 'preferential'),
    },
    'Interest income': {
      note: 'Taxed as ordinary income + 3.8% NIIT',
      segments: buildSegments(incomeKnots, bl, config, 'ordinary'),
    },
    '1256 contracts': {
      note: '60/40 split: 60% LTCG + 40% ordinary + 3.8% NIIT',
      segments: buildSegments(incomeKnots, bl, config, '1256'),
    },
    'HSA contribution': {
      note: `Above-the-line deduction, reduces AGI (max $${config.hsa_max_contribution.toLocaleString()})`,
      segments: buildSegments(hsaKnots, bl, config, 'ordinary', 'hsa').filter(s => s.from < config.hsa_max_contribution),
    },
    'Charitable contributions': {
      note: bl.ny_agi > 1_000_000
        ? 'Itemized deduction. NY: limited to 50% of charitable (NYAGI > $1M)'
        : 'Itemized deduction, $1-for-$1',
      segments: buildSegments(charitableKnots, bl, config, 'ordinary', 'deduction'),
    },
    'Mortgage interest': {
      note: `Federal ratio ${(bl.mortgage_deduction_ratio * 100).toFixed(1)}%, NY ratio ${(bl.ny_mortgage_deduction_ratio * 100).toFixed(1)}%`,
      segments: buildSegments(mortgageKnots, bl, config, 'ordinary', 'mortgage'),
    },
    'Property tax': {
      note: bl.salt_total >= bl.salt_deduction ? 'SALT capped — no federal marginal benefit' : 'Feeds into SALT deduction',
      segments: buildSegments(propertyTaxKnots, bl, config, 'ordinary', 'property_tax'),
    },
    'Foreign tax credit': {
      note: bl.foreign_tax_limited
        ? `At Form 1116 limit — no marginal benefit (carries forward)`
        : 'Dollar-for-dollar credit against federal tax',
      segments: buildSegments([], bl, config, 'ordinary', 'foreign_tax_credit'),
    },
  };

  return {
    year: '2025',
    baseline: {
      agi: bl.agi,
      taxable_income: bl.taxable_income,
      is_itemizing: bl.is_itemizing,
      ny_agi: bl.ny_agi,
      ny_taxable: bl.ny_taxable,
      salt_total: bl.salt_total,
      salt_deduction: bl.salt_deduction,
    },
    marginal_rates: categories,
  };
}
