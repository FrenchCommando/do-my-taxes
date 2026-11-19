// Port of taxes1040/marginal_rates.py - marginal tax rates by re-running the real tax computation.
//
// For each input category (wages, gains, dividends, deductions, ...) the input is increased by an amount x
// and the full computation (fill_taxes.ts) is re-run. Total tax is split into
//     federal = Form 1040 line 24 (includes AMT, NIIT, Additional Medicare Tax, credits)
//     NY state = IT-201 line 46
//     NYC = IT-201 line 58 minus the NYC school tax credits (lines 69, 69a)
// The computation runs with `exact` (no rounding), so the tax is piecewise linear in x. Knots (where the
// marginal rate changes) are found by recursive subdivision and placed where the left and right lines meet;
// jumps (cliffs) are located by bisection. Each knot is labelled with the thresholds crossed between its
// two sides (brackets, NIIT, SALT, AMT, itemizing, ...). Every rule in the computation is reflected
// automatically - there is no separate model of the tax rules here.

import { bankersRound, fillTaxes, getFilingStatus } from './fill_taxes';
import { resolveConfig } from './config';
import type { FilingStatus, TaxConfig, TaxYear } from './config';
import {
  k_1040, k_1040s1a, k_1040sa, k_1040sd, k_1116, k_6251, k_8959, k_8960, k_it196, k_it201,
  w_itemized_limitation, w_qualified_dividends_and_capital_gains, w_salt_deduction,
} from './form_names';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

const INCOME_HORIZON = 30_000_000;  // past the top NY bracket ($25M)
const SLOPE_STEP = 100;  // width used to measure one-sided slopes
const LOCATE_WIDTH = 4 * SLOPE_STEP;  // intervals this small holding a slope change are resolved to a knot
const SLOPE_TOLERANCE = 5e-5;  // slope changes below this are treated as linear
const LABEL_OFFSET = 3 * SLOPE_STEP;  // thresholds crossed within this distance of a knot label it
const COMPONENTS = ['federal', 'ny_state', 'nyc'] as const;
type Taxes = [number, number, number];

export interface Rates {
  federal: number;
  ny_state: number;
  nyc: number;
  combined: number;
}

export interface Segment {
  from: number;
  to: number | null;
  rates: Rates;
  next_knot?: string;
}

export interface MarginalRatesResult {
  year: TaxYear;
  filing_status: FilingStatus;
  method: string;
  baseline: Record<string, number | boolean>;
  marginal_rates: Record<string, { note: string; segments: Segment[] }>;
}

const formatDollars = (amount: number) => Math.round(amount).toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------------------
// Input changes, one per category: each modifies a copy of the input data for `amount` more dollars

type Change = (data: D, amount: number) => void;

function addWages(data: D, amount: number) {
  const w2 = (data['W2'] as D[]).find(entry => (entry['Owner'] ?? 'self') === 'self');
  if (!w2) {
    data['W2'].push({ Wages: amount, Medicare_wages: amount, Owner: 'self' });
    return;
  }
  w2['Wages'] += amount;
  w2['Medicare_wages'] += amount;
}

function new1099(data: D, fields: D) {
  (data['1099'] ??= []).push({ Institution: 'Marginal', ...fields });
}

function addTrade(data: D, amount: number, longShort: string, formCode: string) {
  new1099(data, {
    Trades: [{
      SalesDescription: 'MARGINAL', Shares: '1', DateAcquired: 'VARIOUS', DateSold: 'VARIOUS',
      Proceeds: amount, Cost: 0, LongShort: longShort, FormCode: formCode,
    }],
  });
}

function add1256(data: D, amount: number) {
  // Form 6781 has room for 3 lines: add to an existing aggregate entry when there is one
  const entry = (data['1099'] as D[] | undefined)?.find(
    each => (each['Realized1256'] || 0) !== 0 || (each['Unrealized1256'] || 0) !== 0);
  if (entry) {
    entry['Realized1256'] = (entry['Realized1256'] || 0) + amount;
  } else {
    new1099(data, { Realized1256: amount });
  }
}

function addHsa(data: D, amount: number) {
  data['health_savings_account'] = true;
  data['health_savings_account_contributions'] = (data['health_savings_account_contributions'] || 0) + amount;
}

function addMortgageInterest(data: D, amount: number) {
  const entry = data['1098'][0];
  if (!entry['Payments'] || entry['Payments'].length === 0) {
    entry['Payments'] = [{ InterestAmount: 0, PrincipalAmount: 0 }];
  }
  entry['Payments'][0]['InterestAmount'] += amount;
}

function addForeignTax(data: D, amount: number) {
  const entry = (data['1099'] as D[]).find(each => (each['Foreign Tax Paid'] || 0) > 0)!;
  entry['Foreign Tax Paid'] += amount;
}

type Category = [name: string, note: string, change: Change, horizon: number];

function categories(baseData: D, baseMetrics: Metrics, config: TaxConfig): Category[] {
  const hsaRoom = ((baseData['health_savings_account_coverage'] ?? 'self') === 'family'
    ? config.hsa_max_contribution_family
    : config.hsa_max_contribution)
    - (baseData['health_savings_account_contributions'] || 0)
    - (baseData['health_savings_account_employer_contributions'] || 0);
  const agi = baseMetrics.agi;
  const result: Category[] = [
    ['W2 Wages', 'added to the first W2 (wages and Medicare wages)', addWages, INCOME_HORIZON],
    ['Short-term capital gain', 'new Form 8949 box A trade',
      (data, amount) => addTrade(data, amount, 'SHORT', 'A'), INCOME_HORIZON],
    ['Long-term capital gain', 'new Form 8949 box D trade',
      (data, amount) => addTrade(data, amount, 'LONG', 'D'), INCOME_HORIZON],
    ['Qualified dividends', 'new 1099-DIV, qualified',
      (data, amount) => new1099(data, { 'Qualified Dividends': amount, 'Ordinary Dividends': amount }), INCOME_HORIZON],
    ['Ordinary dividends (non-qualified)', 'new 1099-DIV, non-qualified',
      (data, amount) => new1099(data, { 'Ordinary Dividends': amount }), INCOME_HORIZON],
    ['Interest income', 'new 1099-INT',
      (data, amount) => new1099(data, { Interest: amount }), INCOME_HORIZON],
    ['1256 contracts', 'Form 6781 realized gain (60% long-term / 40% short-term)', add1256, INCOME_HORIZON],
    ['HSA contribution', `Form 8889, up to the remaining limit ($${formatDollars(Math.max(0, hsaRoom))})`,
      addHsa, Math.max(0, hsaRoom)],
    ['Charitable contributions', 'new cash gift (Schedule A line 11, IT-196 line 16)',
      (data, amount) => (data['Charitable'] ??= []).push({ Entity: 'Marginal', Amount: amount }), agi],
    ['Property tax', 'added to Schedule A line 5c / IT-196 line 6',
      (data, amount) => (data['Other'] ??= []).push({ PropertyTax: amount }), agi],
  ];
  if ((baseData['1098'] || []).length > 0) {
    result.push(['Mortgage interest', 'added to the first 1098 payment', addMortgageInterest, agi]);
  }
  if ((baseData['1099'] || []).some((entry: D) => (entry['Foreign Tax Paid'] || 0) > 0)) {
    result.push(['Foreign tax paid', 'added to the 1099 that reports foreign tax (Form 1116)',
      addForeignTax, baseMetrics.federal]);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------
// Running the computation

interface Metrics {
  federal: number;
  ny_state: number;
  nyc: number;
  agi: number;
  taxable_income: number;
  ordinary_taxable: number;
  medicare_wages: number;
  net_capital: number;
  net_long_term: number;
  net_short_term: number;
  preferential_income: boolean;
  schedule_1a: boolean;
  amti: number;
  /** Form 6251 line 6 (NaN without Form 6251) */
  amt_taxable: number;
  /** ordinary part of line 6: the 26%/28% rates apply to it when Part III taxes gains/dividends separately */
  amt_ordinary: number;
  /** IRC 68 worksheet (2026+): income over the 37% bracket start, and that excess minus the itemized
   * deductions (the limitation is 2/37 of the smaller). NaN when the worksheet isn't used. */
  irc68_income_over: number;
  irc68_over_itemized: number;
  /** 2026+: Schedule A gifts minus the 0.5% AGI floor (NaN before 2026) */
  charitable_over_floor: number;
  ny_agi: number;
  ny_taxable: number;
  federal_agi_ny: number;
  itemizing: boolean;
  ny_itemizing: boolean;
  amt: boolean;
  foreign_tax_limited: boolean;
  amt_foreign_tax_limited: boolean;
  nonitemizer_charitable_capped: boolean;
  salt_capped: boolean;
  /** Form 8960 line 15 - line 12: MAGI over the threshold minus net investment income (NIIT = 3.8% of the smaller) */
  niit_magi_over_income: number;
  niit: boolean;
  additional_medicare: boolean;
}
type NumericMetric = { [K in keyof Metrics]: Metrics[K] extends number ? K : never }[keyof Metrics];
type FlagMetric = { [K in keyof Metrics]: Metrics[K] extends boolean ? K : never }[keyof Metrics];

function run(baseData: D, config: TaxConfig, change: Change | null, amount: number): Metrics {
  const data = structuredClone(baseData);
  if (amount && change) change(data, amount);
  const { formsState, worksheets, summaryInfo } = fillTaxes(data, config);
  const f1040 = (formsState[k_1040] as D) || {};
  const it201 = (formsState[k_it201] as D) || {};
  const scheduleD = (formsState[k_1040sd] as D) || {};
  const saltWorksheet = worksheets[w_salt_deduction] ?? new Array(11).fill(0);
  const f8960 = (formsState[k_8960] as D) || {};
  const f6251 = formsState[k_6251] as D | undefined;
  const amtTaxable = f6251 ? f6251['6_value'] || 0 : NaN;
  // Form 6251 Part III: qualified dividends + net capital gain are taxed at the capital gain rates
  const netGain = (scheduleD['15'] || 0) > 0 && (scheduleD['16'] || 0) > 0 ? Math.min(scheduleD['15'], scheduleD['16']) : 0;
  const amtGains = (f1040['3_a'] || 0) + netGain;
  const limitation = worksheets[w_itemized_limitation];
  const itemizedLimitation = k_1040sa in formsState && limitation !== undefined;
  const gifts = ((data['Charitable'] ?? []) as D[]);
  const giftTotal = gifts.reduce((total, gift) => total + (gift['Amount'] || 0), 0);
  const nonDafGifts = gifts.filter(gift => !gift['DonorAdvisedFund']).reduce((total, gift) => total + (gift['Amount'] || 0), 0);
  const amtForeignTaxCredit = summaryInfo[`${k_6251} 8 AMT foreign tax credit (simplified limitation election)`];
  return {
    federal: f1040['24'] || 0,
    ny_state: it201['46'] || 0,
    nyc: (it201['58'] || 0) - (it201['69'] || 0) - (it201['69a'] || 0),
    agi: f1040['11'] || 0,
    taxable_income: f1040['15'] || 0,
    // ordinary part of taxable income: the regular brackets apply to it when gains/dividends stack on top
    ordinary_taxable: w_qualified_dividends_and_capital_gains in worksheets
      ? worksheets[w_qualified_dividends_and_capital_gains][5]
      : f1040['15'] || 0,
    medicare_wages: (data['W2'] as D[]).reduce((total, w2) => total + (w2['Medicare_wages'] || 0), 0),
    net_capital: scheduleD['16'] || 0,
    net_long_term: scheduleD['15'] || 0,
    net_short_term: scheduleD['7'] || 0,
    preferential_income: (f1040['3_a'] || 0) > 0 || ((scheduleD['15'] || 0) > 0 && (scheduleD['16'] || 0) > 0),
    schedule_1a: k_1040s1a in formsState,
    amti: (summaryInfo[`${k_6251} 4 Alternative minimum taxable income`] as number) || 0,
    amt_taxable: amtTaxable,
    amt_ordinary: amtGains > 0 ? Math.max(0, amtTaxable - amtGains) : amtTaxable,
    irc68_income_over: itemizedLimitation ? limitation[2] - limitation[3] : NaN,
    irc68_over_itemized: itemizedLimitation ? limitation[4] - limitation[1] : NaN,
    charitable_over_floor: config.charitable_agi_floor_rate
      ? giftTotal - (f1040['11'] || 0) * config.charitable_agi_floor_rate
      : NaN,
    ny_agi: it201['33'] || 0,
    ny_taxable: it201['37'] || 0,
    federal_agi_ny: it201['19'] || 0,
    itemizing: k_1040sa in formsState,
    ny_itemizing: k_it196 in formsState,
    amt: k_6251 in formsState,
    foreign_tax_limited: Object.keys(summaryInfo).some(key => key.includes('Excess foreign tax')),
    amt_foreign_tax_limited: typeof amtForeignTaxCredit === 'number'
      && amtForeignTaxCredit < ((formsState[k_1116] as D)?.['14'] || 0),
    nonitemizer_charitable_capped: (f1040['charitable_nonitemizer'] || 0) > 0 && f1040['charitable_nonitemizer'] < nonDafGifts,
    salt_capped: saltWorksheet[9] > 0 && saltWorksheet[10] >= saltWorksheet[9],
    niit_magi_over_income: (f8960['15'] || 0) - (f8960['12'] || 0),
    niit: k_8960 in formsState,
    additional_medicare: ((formsState[k_8959] as D)?.['18'] || 0) > 0,
  };
}

/** Tax components as a function of the additional amount, with evaluations cached. */
class TaxCurve {
  private cache = new Map<number, Metrics>();
  private baseData: D;
  private config: TaxConfig;
  private change: Change;

  constructor(baseData: D, config: TaxConfig, change: Change) {
    this.baseData = baseData;
    this.config = config;
    this.change = change;
  }

  metrics(amount: number): Metrics {
    const key = Math.max(0, amount);
    let cached = this.cache.get(key);
    if (!cached) {
      cached = run(this.baseData, this.config, this.change, key);
      this.cache.set(key, cached);
    }
    return cached;
  }

  tax(amount: number): Taxes {
    const metrics = this.metrics(amount);
    return [metrics.federal, metrics.ny_state, metrics.nyc];
  }

  slope(start: number, end: number): Taxes {
    const before = this.tax(start);
    const after = this.tax(end);
    return [0, 1, 2].map(index => (after[index] - before[index]) / (end - start)) as Taxes;
  }
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function differs(slopeA: Taxes, slopeB: Taxes): boolean {
  return Math.max(...slopeA.map((first, index) => Math.abs(first - slopeB[index]))) > SLOPE_TOLERANCE;
}

/** Resolve a small interval holding one rate change into [knot, jump]. The left and right lines are
 * measured just outside the interval and intersected; if they don't meet inside it, the change is a
 * jump (cliff), located to the dollar by bisection.
 * The measuring windows stop a dollar short of the interval, so a cliff sitting right at `start` or just
 * past `end` (e.g. a Schedule 1-A step and the NYC school credit cliff a dollar apart) doesn't skew them. */
function locate(curve: TaxCurve, start: number, end: number): [number, number] {
  const leftEnd = start > 1 ? start - 1 : start;
  const left = start > 0 ? curve.slope(Math.max(0, leftEnd - SLOPE_STEP), leftEnd) : curve.slope(start, start + 1);
  const right = curve.slope(end + 1, end + 1 + SLOPE_STEP);
  const totalLeft = sum(left);
  const totalRight = sum(right);
  const baseTotal = sum(curve.tax(start));
  const endTotal = sum(curve.tax(end));
  // use the component whose slope changes the most
  let index = 0;
  for (const each of [1, 2]) {
    if (Math.abs(left[each] - right[each]) > Math.abs(left[index] - right[index])) index = each;
  }
  if (Math.abs(left[index] - right[index]) > SLOPE_TOLERANCE) {
    const taxStart = curve.tax(start)[index];
    const taxEnd = curve.tax(end)[index];
    const knot = (taxEnd - taxStart + left[index] * start - right[index] * end) / (left[index] - right[index]);
    // a kink: the total tax at the intersection lies on both lines, and nothing else (a jump in another
    // component) happens in the interval
    const onLines = (point: number) => baseTotal + totalLeft * (Math.min(point, knot) - start)
      + totalRight * Math.max(0, point - knot);
    if (start <= knot && knot <= end
      && Math.abs(sum(curve.tax(knot)) - onLines(knot)) < 0.5 && Math.abs(endTotal - onLines(end)) < 0.5) {
      return [bankersRound(knot), 0];
    }
  }
  // jump: find where the tax leaves the left line
  // gap at `end` between the actual tax and the left line: the jump plus the slope change since the jump
  const gap = endTotal - baseTotal - totalLeft * (end - start);
  let low = start;
  let high = end;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (Math.abs(sum(curve.tax(middle)) - baseTotal - totalLeft * (middle - start)) > Math.abs(gap) / 2) {
      high = middle;
    } else {
      low = middle;
    }
  }
  // the jump itself: the right line and the left line, both evaluated at the located knot
  const jump = (endTotal - totalRight * (end - high)) - (baseTotal + totalLeft * (high - start));
  return [high, bankersRound(jump)];
}

/** Split [start, end] into knots: returns a list of [knot, jump]. */
function pieces(curve: TaxCurve, start: number, end: number): [number, number][] {
  const rightOfStart = curve.slope(start, start + SLOPE_STEP);
  const leftOfEnd = curve.slope(end - SLOPE_STEP, end);
  const secant = curve.slope(start, end);
  if (!differs(rightOfStart, leftOfEnd) && !differs(rightOfStart, secant)) return [];
  if (end - start <= LOCATE_WIDTH) return [locate(curve, start, end)];
  const middle = Math.floor((start + end) / 2);
  const knots = [...pieces(curve, start, middle), ...pieces(curve, middle, end)];
  // a rate change exactly at the midpoint is invisible to both halves
  if (differs(curve.slope(middle - SLOPE_STEP, middle), curve.slope(middle, middle + SLOPE_STEP))
    && !knots.some(([knot]) => Math.abs(knot - middle) <= LOCATE_WIDTH)) {
    knots.push(locate(curve, middle - SLOPE_STEP, middle + SLOPE_STEP));
  }
  return knots.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
}

function findKnots(curve: TaxCurve, horizon: number): [number, number][] {
  const points = [0];
  while (points[points.length - 1] * 2 + 1_000 < horizon) points.push(points[points.length - 1] * 2 + 1_000);
  points.push(horizon);
  const knots: [number, number][] = [];
  for (let position = 0; position + 1 < points.length; position++) {
    const start = points[position];
    const end = points[position + 1];
    knots.push(...pieces(curve, start, end));
    // rate change at a partition point
    if (end < horizon && differs(curve.slope(end - SLOPE_STEP, end), curve.slope(end, end + SLOPE_STEP))) {
      knots.push(locate(curve, end - SLOPE_STEP, end + SLOPE_STEP));
    }
  }
  knots.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  // the same knot can be found from neighbouring intervals: keep one per position (preferring the one that
  // measured the cliff). Knots a dollar or two apart are separate events (e.g. cliffs in two components)
  // shown as one, with their jumps added.
  const byPosition = new Map<number, number>();
  for (const [knot, jump] of knots) {
    if (!byPosition.has(knot) || Math.abs(jump) > Math.abs(byPosition.get(knot)!)) byPosition.set(knot, jump);
  }
  const unique: [number, number][] = [];
  for (const [knot, jump] of [...byPosition.entries()].sort((first, second) => first[0] - second[0])) {
    const previous = unique[unique.length - 1];
    if (previous && knot - previous[0] <= 2) {
      previous[1] += jump;
    } else {
      unique.push([knot, jump]);
    }
  }
  return unique;
}

// ---------------------------------------------------------------------------------------------------------
// Labels

type Threshold = [metric: NumericMetric, threshold: number, label: string, condition: FlagMetric | null];

/** Checked on both sides of each knot. A label is only used when its condition (a boolean metric) holds on
 * either side, so e.g. SALT thresholds don't label knots of a return that takes the standard deduction. */
function thresholds(config: TaxConfig): Threshold[] {
  const result: Threshold[] = config.fed_brackets.map(bracket =>
    ['ordinary_taxable', bracket, `Federal bracket at ordinary taxable income $${formatDollars(bracket)}`, null]);
  const zeroBand = config.qualified_div_0pct;
  const twentyBand = config.qualified_div_20pct;
  result.push(
    ['taxable_income', 0, 'Federal taxable income reaches zero', null],
    ['ny_taxable', 0, 'NY taxable income reaches zero', null],
    ['taxable_income', zeroBand, `0% -> 15% capital gain rate at taxable $${formatDollars(zeroBand)}`, 'preferential_income'],
    ['taxable_income', twentyBand, `15% -> 20% capital gain rate at taxable $${formatDollars(twentyBand)}`, 'preferential_income'],
    ['ordinary_taxable', 0, 'Ordinary taxable income reaches zero', 'preferential_income'],
    ['ordinary_taxable', zeroBand, `Gains start to fill the 0% band (ordinary taxable $${formatDollars(zeroBand)})`, 'preferential_income'],
    ['ordinary_taxable', twentyBand, `Gains start to fill the 15% band (ordinary taxable $${formatDollars(twentyBand)})`, 'preferential_income'],
    ['agi', config.salt_phaseout_start,
      `SALT cap phaseout begins (AGI $${formatDollars(config.salt_phaseout_start)})`, 'itemizing'],
    ['niit_magi_over_income', 0,
      `NIIT capped at net investment income (MAGI over $${formatDollars(config.niit_threshold)} reaches it)`, 'niit'],
    ['net_capital', 0, 'Net capital gain/loss crosses zero', null],
    ['net_long_term', 0, 'Net long-term gain/loss crosses zero', null],
    ['net_short_term', 0, 'Net short-term gain/loss crosses zero', null],
    ['net_capital', -config.capital_loss_limit, `Capital loss limit ($${formatDollars(config.capital_loss_limit)})`, null],
    ['amti', config.should_fill_6251_phaseout,
      `AMT exemption phaseout begins (AMTI $${formatDollars(config.should_fill_6251_phaseout)})`, 'amt'],
    ['ny_agi', config.ny_itemized_adjustment_start,
      `NY itemized deduction adjustment begins (NYAGI $${formatDollars(config.ny_itemized_adjustment_start)})`, 'ny_itemizing'],
    ['federal_agi_ny', config.ny_itemized_deduction_threshold,
      `NY itemized deductions reduced by 3% of federal AGI over $${formatDollars(config.ny_itemized_deduction_threshold)}`, 'ny_itemizing'],
    ['ny_agi', 475_000, 'NY itemized deduction adjustment worksheet 4 (NYAGI $475,000)', 'ny_itemizing'],
    ['ny_agi', 525_000, 'NY itemized deduction adjustment reaches 50% (NYAGI $525,000)', 'ny_itemizing'],
    ['ny_agi', 1_000_000, 'NY itemized deduction limited to 50% of charitable gifts (NYAGI $1M)', 'ny_itemizing'],
    ['ny_agi', 10_000_000, 'NY itemized deduction limited to 25% of charitable gifts (NYAGI $10M)', 'ny_itemizing'],
    ['ny_agi', 107_650, 'NY tax recapture begins (NYAGI $107,650)', null],
    ['ny_agi', 157_650, 'NY tax recapture of the lower brackets complete (NYAGI $157,650)', null],
    ['federal_agi_ny', 250_000, 'NYC fixed school credit ends (income $250,000)', null],
    ['federal_agi_ny', 500_000, 'NYC school rate reduction ends (income $500,000)', null],
  );
  const saltFloorAgi = config.salt_phaseout_start
    + (config.salt_limit - config.salt_floor) / config.salt_phaseout_rate;
  if (saltFloorAgi > config.salt_phaseout_start) {
    result.push(['agi', saltFloorAgi,
      `SALT cap reaches the $${formatDollars(config.salt_floor)} floor (AGI $${formatDollars(saltFloorAgi)})`, 'itemizing']);
  }
  const amtExemptionGone = config.should_fill_6251_phaseout + config.amt_exemption / (config.amt_phaseout_rate ?? 0.25);
  const amt28 = config.amt_28pct_threshold;
  result.push(
    ['amti', amtExemptionGone, `AMT exemption fully phased out (AMTI $${formatDollars(amtExemptionGone)})`, 'amt'],
    ['amt_ordinary', amt28, `AMT 26% -> 28% rate (Form 6251 ordinary income $${formatDollars(amt28)})`, 'amt'],
    ['amt_taxable', zeroBand, `AMT: 0% -> 15% capital gain rate at Form 6251 line 6 $${formatDollars(zeroBand)}`, 'amt'],
    ['amt_taxable', twentyBand, `AMT: 15% -> 20% capital gain rate at Form 6251 line 6 $${formatDollars(twentyBand)}`, 'amt'],
    ['amt_ordinary', zeroBand, `AMT: gains start to fill the 0% band (ordinary $${formatDollars(zeroBand)})`, 'amt'],
    ['amt_ordinary', twentyBand, `AMT: gains start to fill the 15% band (ordinary $${formatDollars(twentyBand)})`, 'amt'],
  );
  for (const bracket of config.ny_brackets) {
    result.push(['ny_taxable', bracket, `NY bracket at taxable $${formatDollars(bracket)}`, null]);
  }
  for (const bracket of config.ny_recapture_brackets) {
    result.push(['ny_agi', bracket, `NY recapture phase-in begins (NYAGI $${formatDollars(bracket)})`, null]);
    result.push(['ny_agi', bracket + 50_000, `NY recapture phase-in ends (NYAGI $${formatDollars(bracket + 50_000)})`, null]);
  }
  for (const bracket of config.nyc_brackets) {
    result.push(['ny_taxable', bracket, `NYC bracket at taxable $${formatDollars(bracket)}`, null]);
  }
  if (config.itemized_limitation_rate) {
    const topBracket = formatDollars(config.fed_brackets[config.fed_brackets.length - 1]);
    result.push(
      ['irc68_income_over', 0, `IRC 68 itemized deduction limitation begins (income before deductions over $${topBracket})`, 'itemizing'],
      ['irc68_over_itemized', 0, `IRC 68 limitation reaches 2/37 of all itemized deductions (income over $${topBracket} exceeds them)`, 'itemizing'],
    );
  }
  if (config.charitable_agi_floor_rate) {
    result.push(['charitable_over_floor', 0,
      `Charitable gifts reach the ${config.charitable_agi_floor_rate * 100}% AGI floor`, 'itemizing']);
  }
  result.push(['ny_agi', config.ny_itemized_adjustment_start + 50_000,
    `NY itemized deduction adjustment fully phased in (NYAGI $${formatDollars(config.ny_itemized_adjustment_start + 50_000)})`, 'ny_itemizing']);
  if (config.schedule_1a) {
    result.push(
      ['agi', config.tips_overtime_phaseout_start, 'Schedule 1-A tips/overtime phaseout begins', 'schedule_1a'],
      ['agi', config.car_loan_phaseout_start, 'Schedule 1-A car loan interest phaseout begins', 'schedule_1a'],
      ['agi', config.senior_phaseout_start, 'Schedule 1-A senior deduction phaseout begins', 'schedule_1a'],
    );
  }
  return result;
}

const FLAG_LABELS: [FlagMetric, string, string][] = [
  ['itemizing', 'switches to itemized deductions', 'switches to the standard deduction'],
  ['ny_itemizing', 'NY switches to itemized deductions', 'NY switches to the standard deduction'],
  ['amt', 'AMT starts to apply', 'AMT stops applying'],
  ['foreign_tax_limited', 'foreign tax credit reaches the Form 1116 limit', 'foreign tax credit below the Form 1116 limit'],
  ['amt_foreign_tax_limited', 'AMT foreign tax credit reaches its limit', 'AMT foreign tax credit below its limit'],
  ['nonitemizer_charitable_capped', 'non-itemizer charitable deduction reaches its limit',
    'non-itemizer charitable deduction below its limit'],
  ['salt_capped', 'SALT deduction reaches its cap', 'SALT deduction below its cap'],
  ['niit', 'NIIT starts to apply', 'NIIT stops applying'],
  ['additional_medicare', 'Additional Medicare Tax starts to apply', 'Additional Medicare Tax stops applying'],
];

function label(curve: TaxCurve, knot: number, jump: number, allThresholds: Threshold[]): string {
  const before = curve.metrics(knot - LABEL_OFFSET);
  const after = curve.metrics(knot + LABEL_OFFSET);
  const labels = allThresholds
    .filter(([metric, threshold, , condition]) =>
      Math.min(before[metric], after[metric]) <= threshold && threshold < Math.max(before[metric], after[metric])
      && (condition === null || before[condition] || after[condition]))
    .map(([, , text]) => text);
  for (const [flag, starts, stops] of FLAG_LABELS) {
    if (before[flag] !== after[flag]) labels.push(after[flag] ? starts : stops);
  }
  if (jump) labels.push(`cliff: tax ${jump > 0 ? '+' : '-'}$${formatDollars(Math.abs(jump))}`);
  return labels.join('; ') || 'rate change';
}

// ---------------------------------------------------------------------------------------------------------
// Segments

function segmentRates(curve: TaxCurve, start: number, end: number): Rates {
  const insideStart = start + Math.min(SLOPE_STEP, (end - start) / 4);
  const insideEnd = end - Math.min(SLOPE_STEP, (end - start) / 4);
  const [federal, nyState, nyc] = curve.slope(insideStart, insideEnd).map(rate => bankersRound(rate, 6));
  return { federal, ny_state: nyState, nyc, combined: bankersRound(federal + nyState + nyc, 6) };
}

function segments(curve: TaxCurve, horizon: number, allThresholds: Threshold[]): Segment[] {
  if (horizon <= 0) return [];
  const knots = findKnots(curve, horizon);
  const bounds = [0, ...knots.map(([knot]) => knot), horizon];
  const jumps = new Map(knots);
  const result: Segment[] = [];
  for (let position = 0; position + 1 < bounds.length; position++) {
    const start = bounds[position];
    const end = bounds[position + 1];
    if (end <= start) continue;
    const segment: Segment = { from: start, to: end < horizon ? end : null, rates: segmentRates(curve, start, end) };
    if (end < horizon) segment.next_knot = label(curve, end, jumps.get(end) ?? 0, allThresholds);
    result.push(segment);
  }
  // merge neighbours that show the same rates (sub-0.01% drift, e.g. Form 1116 limitation curvature)
  const merged: Segment[] = [];
  for (const segment of result) {
    const previous = merged[merged.length - 1];
    if (previous && !jumps.get(segment.from) && COMPONENTS.every(
      component => bankersRound(previous.rates[component], 4) === bankersRound(segment.rates[component], 4))) {
      previous.to = segment.to;
      if (segment.next_knot !== undefined) {
        previous.next_knot = segment.next_knot;
      } else {
        delete previous.next_knot;
      }
    } else {
      merged.push(segment);
    }
  }
  return collapseStaircases(curve, merged, jumps, allThresholds);
}

const sameRates = (first: Rates, second: Rates) =>
  COMPONENTS.every(component => bankersRound(first[component], 4) === bankersRound(second[component], 4));

/** Stepped phaseouts (Schedule 1-A: $200 / $100 less deduction per $1,000 or fraction of income) make a cliff
 * every $1,000. A run of at least MIN_STEPS equal cliffs at equal spacing with the same rate in between is
 * shown as one segment whose rate averages the steps in. The cliff at the start of the run stays on the
 * previous segment. */
const MIN_STEPS = 3;

function collapseStaircases(curve: TaxCurve, segmentList: Segment[], jumps: Map<number, number>,
  allThresholds: Threshold[]): Segment[] {
  const result: Segment[] = [];
  let position = 0;
  while (position < segmentList.length) {
    const first = segmentList[position];
    const jump = jumps.get(first.from) ?? 0;
    // extend while the next segment starts with the same cliff, at the same spacing, with the same rates
    let last = position;
    while (jump && last + 1 < segmentList.length) {
      const current = segmentList[last];
      const next = segmentList[last + 1];
      const spacing = next.from - current.from;
      if (jumps.get(next.from) !== jump || !sameRates(current.rates, first.rates)
        || Math.abs(spacing - (segmentList[position + 1].from - first.from)) > 2) break;
      last += 1;
    }
    const steps = last - position;  // cliffs inside the collapsed range (at the start of segments position+1..last)
    if (steps + 1 < MIN_STEPS) {
      result.push(first);
      position += 1;
      continue;
    }
    // [first.from, end]: `steps` cliffs, the last one at `end`
    const end = segmentList[last].from;
    const spacing = (end - first.from) / steps;
    const [federal, nyState, nyc] = curve.slope(first.from, end).map(rate => bankersRound(rate, 6));
    const otherLabels = label(curve, end, 0, allThresholds);
    result.push({
      from: first.from,
      to: end,
      rates: { federal, ny_state: nyState, nyc, combined: bankersRound(federal + nyState + nyc, 6) },
      next_knot: `stepped phaseout: ${steps} steps of ${jump > 0 ? '+' : '-'}$${formatDollars(Math.abs(jump))} `
        + `every $${formatDollars(spacing)}, averaged into this rate`
        + (otherLabels === 'rate change' ? '' : `; ${otherLabels}`),
    });
    // the segment after the last cliff keeps its own rate and label
    result.push(segmentList[last]);
    position = last + 1;
  }
  return result;
}

export function computeMarginalRates(yearConfig: TaxConfig, baseData: D): MarginalRatesResult {
  const filingStatus = getFilingStatus(baseData);
  const config: TaxConfig = { ...yearConfig, exact: true, field_maps: null };
  const resolved = resolveConfig(config, filingStatus);
  const allThresholds = thresholds(resolved);
  const baseMetrics = run(baseData, config, null, 0);

  const marginalRates: MarginalRatesResult['marginal_rates'] = {};
  for (const [name, note, change, horizon] of categories(baseData, baseMetrics, resolved)) {
    const curve = new TaxCurve(baseData, config, change);
    marginalRates[name] = { note, segments: segments(curve, bankersRound(horizon), allThresholds) };
  }

  const baselineKeys = ['agi', 'taxable_income', 'itemizing', 'amt', 'ny_agi', 'ny_taxable', 'ny_itemizing',
    'federal', 'ny_state', 'nyc'] as const;
  return {
    year: yearConfig.year,
    filing_status: filingStatus,
    method: 'numeric (re-runs the tax computation, exact mode)',
    baseline: Object.fromEntries(baselineKeys.map(key => [key, baseMetrics[key]])),
    marginal_rates: marginalRates,
  };
}
