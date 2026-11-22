// Faithful port of taxes1040/computation/forms_core_impl.py fill_taxes()
// Single or married filing jointly, no dependents, resident

import {
  k_1040, k_1040s1, k_1040s1a, k_1040s2, k_1040s3, k_1040sa, k_1040sb, k_1040sd,
  k_6251, k_6781, k_8889, k_8949, k_8959, k_8960, k_1116,
  k_it201, k_it196,
  w_qualified_dividends_and_capital_gains, w_itemized_limitation,
  w_mortgage_interest_deduction, w_salt_deduction, w_capital_loss_carryover,
  w_ny_line40_itemized_deductions, w_ny_line41_itemized_deductions_subtractions,
  w_ny_line46_itemized_deduction_adjustments,
} from './form_names';
import { resolveConfig } from './config';
import type { FieldMap, FilingStatus, TaxConfig } from './config';

/** Python-compatible banker's rounding (round half to even). */
export function bankersRound(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  const shifted = value * factor;
  const truncated = Math.trunc(shifted);
  const remainder = shifted - truncated;
  // Check if exactly at .5 boundary (within floating-point tolerance)
  if (Math.abs(Math.abs(remainder) - 0.5) < 1e-9) {
    // Round to even
    return truncated % 2 === 0 ? truncated / factor : (truncated + Math.sign(shifted)) / factor;
  }
  return Math.round(shifted) / factor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;
export type FormsState = Record<string, D | D[]>;
export type Worksheets = Record<string, number[]>;
export type SummaryInfo = Record<string, number | boolean | string>;

interface PriorYear {
  taxable_income: number;
  schedule_d_net_short_term: number;
  schedule_d_net_long_term: number;
  schedule_d_loss_deduction: number;
}

type TradeTotals = { Proceeds: number; Cost: number; Adjustment: number; Gain: number };
interface SumTrades {
  SHORT: Record<string, TradeTotals>;
  LONG: Record<string, TradeTotals>;
}

export function getFilingStatus(d: D): FilingStatus {
  return d['filing_status'] ?? 'single';
}

/** Name / SSN / address from the taxpayer's W2s (spouse W2s, "Owner": "spouse", are excluded). */
function getMainInfo(d: D) {
  const w2 = (d['W2'] as D[]).find(entry => (entry['Owner'] ?? 'self') !== 'spouse') || {};
  const fullName: string = w2['FullName'] || '';
  const parts = fullName.split(' ');
  const initial = parts.length > 2 ? parts[1][0] : '';
  return {
    first_name: w2['FirstName'],
    initial,
    last_name: w2['LastName'],
    ssn: w2['SSN'],
    address_street_and_number: w2['Address'],
    address_apt: w2['Address_apt'],
    address_city: w2['Address_city'],
    address_state: w2['Address_state'],
    address_zip: w2['Address_zip'],
    ...(d['override'] || {}),
  };
}

/** Rename keys: a string renames, null drops, an array copies the value to several fields. */
function remapDict(dict: D, fieldMap: FieldMap): D {
  const result: D = {};
  for (const [key, value] of Object.entries(dict)) {
    if (!(key in fieldMap)) {
      result[key] = value;
      continue;
    }
    const newKey = fieldMap[key];
    if (Array.isArray(newKey)) {
      for (const eachKey of newKey) result[eachKey] = value;
    } else if (newKey !== null) {
      result[newKey] = value;
    }
  }
  return result;
}

function applyFieldMaps(formsState: FormsState, fieldMaps: Record<string, FieldMap>) {
  for (const [formKey, fieldMap] of Object.entries(fieldMaps)) {
    if (!(formKey in formsState)) continue;
    const formData = formsState[formKey];
    formsState[formKey] = Array.isArray(formData)
      ? formData.map(page => remapDict(page, fieldMap))
      : remapDict(formData, fieldMap);
  }
}

export interface FillTaxesResult {
  formsState: FormsState;
  worksheets: Worksheets;
  summaryInfo: SummaryInfo;
  carryover: D;
}

export function fillTaxes(d: D, yearConfig: TaxConfig): FillTaxesResult {
  const filingStatus = getFilingStatus(d);
  const marriedFilingJointly = filingStatus === 'married_filing_jointly';
  const config = resolveConfig(yearConfig, filingStatus);
  // exact skips rounding to whole dollars / form-specified decimals (used by marginal_rates.ts,
  // which measures slopes and needs the unrounded piecewise-linear tax)
  const exact = config.exact ?? false;
  const rounded = (value: number, digits = 0) => (exact ? value : bankersRound(value, digits));
  const spouse: D = marriedFilingJointly ? (d['spouse'] || {}) : {};

  const {
    computation, computation_ny, computation_ny_recapture, computation_nyc, year,
  } = config;

  const priorYear: PriorYear | null = d['prior_year'] || null;

  const mainInfo = getMainInfo(d);
  const w2s: D[] = d['W2'];
  const sumW2 = (key: string) => w2s.reduce((total, w2) => total + (w2[key] || 0), 0);
  const wages = sumW2('Wages');
  const federalTax = sumW2('Federal_tax');
  const medicareTax = sumW2('Medicare_tax');
  const medicareWages = sumW2('Medicare_wages');
  // Form 1099-R entries: GrossDistribution (box 1), TaxableAmount (box 2a), Federal_tax / State_tax / Local_tax
  // (boxes 4, 14, 17), DistributionCode (box 7), IRA (box 7 IRA/SEP/SIMPLE checked), Payer, Owner.
  // Box 2a is used as reported: Form 8606 (IRA basis, pro-rata rule) is not implemented
  const retirementDistributions: D[] = d['1099R'] || [];
  const sumEntries = (entries: D[], key: string) => entries.reduce((total, entry) => total + (entry[key] || 0), 0);
  const retirementFederalTax = sumEntries(retirementDistributions, 'Federal_tax');
  if (retirementDistributions.some(entry => entry['IRA'])) {
    console.warn('1099-R from an IRA: box 2a taxable amount used as is, Form 8606 is not computed');
  }
  // Form 1099-G entries: Unemployment (box 1), Federal_tax (box 4), State_tax (box 11), Payer, Owner
  const governmentPayments: D[] = d['1099G'] || [];
  const unemployment = sumEntries(governmentPayments, 'Unemployment');
  const governmentFederalTax = sumEntries(governmentPayments, 'Federal_tax');
  const stateTax = sumW2('State_tax') + sumEntries(retirementDistributions, 'State_tax')
    + sumEntries(governmentPayments, 'State_tax');
  const localTax = sumW2('Local_tax') + sumEntries(retirementDistributions, 'Local_tax');

  const charitableGifts: D[] = d['Charitable'] || [];
  const otherEntries: D[] = d['Other'] || [];
  const entries1099: D[] = d['1099'] || [];
  const has1099 = entries1099.length > 0;
  // Schedule D is built for any 1099 (taxes1040 always sets its `scheduleD` input flag); derived here so callers
  // can't pass a flag that disagrees with the forms actually built
  const scheduleDFiled = has1099;
  let dividendsQualified: number | null = null;
  const additionalIncome = unemployment > 0;  // Schedule 1 Part I
  const healthSavingsAccount: boolean = d['health_savings_account'] || false;
  let capitalGains: number | null = null;
  let contract1256 = false;
  const foreignTax = entries1099.reduce((total, entry) => total + (entry['Foreign Tax Paid'] || 0), 0);

  const emptyTotals = (): TradeTotals => ({ Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 });
  const sumTrades: SumTrades = {
    SHORT: { A: emptyTotals(), B: emptyTotals(), C: emptyTotals() },
    LONG: { D: emptyTotals(), E: emptyTotals(), F: emptyTotals() },
  };  // from 8949 to fill 1040sd

  const standardDeduction = config.standard_deduction;
  const qualifiedBusinessDeduction = 0;
  // 2026+ (OBBBA) settings; the defaults reproduce the 2024-2025 rules
  const amtPhaseoutRate = config.amt_phaseout_rate ?? 0.25;
  const charitableNonitemizerLimit = config.charitable_nonitemizer_limit ?? 0;
  const charitableAgiFloorRate = config.charitable_agi_floor_rate ?? 0;
  const itemizedLimitationRate = config.itemized_limitation_rate ?? 0;

  const formsState: FormsState = {};
  const worksheets: Worksheets = {};
  const summaryInfo: SummaryInfo = {};

  // --- helpers ---
  function form(key: string, getExisting = false): D {
    if (!getExisting) {
      const dict: D = {};
      formsState[key] = dict;
      return dict;
    }
    return formsState[key] as D;
  }

  /** forms_state.get(key, {}) */
  function existing(key: string): D {
    return (formsState[key] as D) || {};
  }

  function pushToDict(dict: D, key: string, value: number | boolean | string, roundI = 0) {
    if (value !== 0 && value !== false) {
      dict[key] = typeof value === 'number' ? rounded(value, roundI) : value;
    }
  }

  function returnNames(): string {
    const f1040 = existing(k_1040);
    const selfFirst = f1040['self_first_name_initial'];
    const selfLast = f1040['self_last_name'];
    if (!marriedFilingJointly) return `${selfFirst} ${selfLast}`;
    const spouseFirst = f1040['spouse_first_name_initial'];
    const spouseLast = f1040['spouse_last_name'];
    if (spouseLast === selfLast) return `${selfFirst} & ${spouseFirst} ${selfLast}`;
    return `${selfFirst} ${selfLast} & ${spouseFirst} ${spouseLast}`;
  }

  function pushNameSsn(dict: D, prefix = '', suffix = '') {
    dict[prefix + 'name' + suffix] = returnNames();
    dict[prefix + 'ssn' + suffix] = mainInfo.ssn;
  }

  function pushSum(dict: D, key: string, keys: string[]) {
    dict[key] = keys.reduce((total, each) => total + (dict[each] || 0), 0);
  }

  function revertSign(dict: D, key: string) {
    if (key in dict) dict[key] = -dict[key];
  }

  function worksheet(key: string, size: number): number[] {
    const values = new Array(size + 1).fill(0);
    worksheets[key] = values;
    return values;
  }

  function firstNameInitial(firstName: string, initial: string): string {
    return initial ? `${firstName} ${initial}` : firstName;
  }

  /** IRC 68 reduction applied to Schedule A line 17 (0 when not itemizing or before 2026). */
  function itemizedLimitationReduction(): number {
    if (!(k_1040sa in formsState) || !(w_itemized_limitation in worksheets)) return 0;
    return worksheets[w_itemized_limitation][6];
  }

  /** Schedule 3 line 11, figured separately for each spouse (W2 'Owner'). Withholding above the yearly
   * max by a single employer isn't claimable (the employer must refund it), so each employer's
   * withholding is capped at the max before adding across employers. */
  function excessSocialSecurityWithheld(): number {
    const maxWithholding = config.social_security_max_withholding;
    const withheld = new Map<string, Map<string, number>>();  // owner -> employer -> withheld
    for (const w2 of w2s) {
      const owner: string = w2['Owner'] ?? 'self';
      const company: string = w2['Company'] ?? '';
      if (!withheld.has(owner)) withheld.set(owner, new Map());
      const employers = withheld.get(owner)!;
      employers.set(company, (employers.get(company) ?? 0) + (w2['SocialSecurity_tax'] || 0));
    }
    let excess = 0;
    for (const [owner, employers] of withheld) {
      const claimable = [...employers.values()].reduce((total, amount) => total + Math.min(amount, maxWithholding), 0);
      const ownerExcess = Math.max(0, claimable - maxWithholding);
      if (ownerExcess > 0) {
        summaryInfo[`${k_1040s3} 11 Excess social security tax withheld (${owner})`] = bankersRound(ownerExcess, 2);
      }
      excess += ownerExcess;
    }
    return excess;
  }

  const excessSocialSecurity = excessSocialSecurityWithheld();

  // ===================== FORM BUILDERS =====================

  function buildForm1040() {
    const f = form(k_1040);
    const filingStatusBox = marriedFilingJointly ? 'married_filling_jointly' : 'single';
    Object.assign(f, {
      [filingStatusBox]: true,
      self_first_name_initial: firstNameInitial(mainInfo.first_name, mainInfo.initial),
      self_last_name: mainInfo.last_name,
      self_ssn: mainInfo.ssn,
      address: mainInfo.address_street_and_number,
      apt: mainInfo.address_apt,
      city: mainInfo.address_city,
      state: mainInfo.address_state,
      zip: mainInfo.address_zip,
      presidential_election_self: d['presidential_election_self'],
      self_occupation: d['occupation'],
      phone: d['phone'],
      email: d['email'],
    });
    if (marriedFilingJointly) {
      Object.assign(f, {
        spouse_first_name_initial: firstNameInitial(spouse['first_name'] ?? '', spouse['initial'] ?? ''),
        spouse_last_name: spouse['last_name'] ?? '',
        spouse_ssn: spouse['ssn'] ?? '',
        presidential_election_spouse: spouse['presidential_election'] ?? false,
        spouse_occupation: spouse['occupation'] ?? '',
      });
    }
    summaryInfo[`${k_1040} Filing status`] = filingStatus;

    if (d['virtual_currency']) {
      pushToDict(f, 'virtual_currency_y', true);
      pushToDict(f, 'virtual_currency_n', false);
    } else {
      pushToDict(f, 'virtual_currency_y', false);
      pushToDict(f, 'virtual_currency_n', true);
    }

    pushToDict(f, '1_a', wages);
    pushSum(f, '1_z', ['1_a', '1_b', '1_c', '1_d', '1_e', '1_f', '1_g', '1_h']);

    if (has1099) {
      buildForm1040sb();
      const sb = formsState[k_1040sb] as D;
      if ((sb['4_value'] || 0) === 0 && (sb['6_value'] || 0) === 0 && !('foreign_account' in d)) {
        delete formsState[k_1040sb];
      }

      dividendsQualified = entries1099.reduce((total, entry) => total + (entry['Qualified Dividends'] || 0), 0);
      pushToDict(f, '3_a', dividendsQualified);

      capitalGains = entries1099.reduce((total, entry) => total + (entry['Capital Gain Distributions'] || 0), 0);

      contract1256 = entries1099.some(
        entry => (Array.isArray(entry['Contract1256']) && entry['Contract1256'].length > 0)
          || (entry['Realized1256'] || 0) !== 0 || (entry['Unrealized1256'] || 0) !== 0
      );

      if (contract1256) buildForm6781();
      buildForm8949();  // build 8949 first
      buildForm1040sd();
    }

    // "Schedule D not required" box: only for capital gain distributions reported directly on line 7;
    // here they always go through Schedule D, and without gains line 7 is simply blank
    f['7_n'] = false;

    // lines 4a/4b: IRA distributions; lines 5a/5b: pensions and annuities (401(k), 403(b), 457(b),
    // including in-plan Roth rollovers)
    for (const [line, ira] of [['4', true], ['5', false]] as const) {
      const entries = retirementDistributions.filter(entry => Boolean(entry['IRA']) === ira);
      pushToDict(f, `${line}_a`, sumEntries(entries, 'GrossDistribution'));
      pushToDict(f, `${line}_b`, sumEntries(entries, 'TaxableAmount'));
      // box 1 on line 4c/5c: rollover (code G direct rollover, H designated Roth account to Roth IRA)
      if (entries.some(entry => /[GH]/.test(entry['DistributionCode'] ?? ''))) f[`${line}_c1`] = true;
    }
    if ('4_b' in f) summaryInfo[`${k_1040} 4b Taxable IRA distributions`] = f['4_b'];
    if ('5_b' in f) summaryInfo[`${k_1040} 5b Taxable pensions and annuities`] = f['5_b'];

    if (healthSavingsAccount || additionalIncome) {
      // fill 8889 and schedule 1
      buildForm8889();
      buildForm1040s1();
      const s1 = formsState[k_1040s1] as D;
      pushToDict(f, '8', s1['10'] || 0);
      pushToDict(f, '10', s1['26'] || 0);
      if ((s1['10'] || 0) === 0 && (s1['26'] || 0) === 0) {
        delete formsState[k_1040s1];
      }
    }

    pushSum(f, '9', ['1_z', '2_b', '3_b', '4_b', '5_b', '6_b', '7_value', '8']);  // total income
    summaryInfo[`${k_1040} 9 Total income`] = f['9'];

    pushToDict(f, '11', f['9'] - (f['10'] || 0));  // Adjusted Gross Income
    summaryInfo[`${k_1040} 11 adjusted gross income`] = f['11'] || 0;

    // 2025-2028: Schedule 1-A deductions (tips, overtime, car loan interest, seniors) -> line 13b
    if (config.schedule_1a) {
      buildForm1040s1a();
      if ((existing(k_1040s1a)['38'] || 0) === 0) delete formsState[k_1040s1a];
    }

    buildForm1040sa();
    const itemizedDeduction = existing(k_1040sa)['17'] || 0;
    // 2026+: non-itemizers also deduct cash gifts (not to donor-advised funds) up to the limit
    const charitableNonitemizer = Math.min(
      charitableNonitemizerLimit,
      charitableGifts.filter(gift => !gift['DonorAdvisedFund']).reduce((total, gift) => total + (gift['Amount'] || 0), 0),
    );
    if (itemizedDeduction > standardDeduction + charitableNonitemizer) {
      pushToDict(f, '12', itemizedDeduction);
    } else {
      pushToDict(f, '12', standardDeduction);
      delete formsState[k_1040sa];
      // the 2026 charitable floor / IRC 68 limitation only matter when itemizing
      delete summaryInfo[`${k_1040sa} 14 Charitable gifts below the AGI floor`];
      delete summaryInfo[`${w_itemized_limitation} 6 Itemized deduction limitation (IRC 68)`];
      // PROVISIONAL key until the final 2026 Form 1040 line is known
      pushToDict(f, 'charitable_nonitemizer', charitableNonitemizer);
      if (charitableNonitemizer > 0) {
        summaryInfo[`${k_1040} Charitable deduction for non-itemizers`] = charitableNonitemizer;
      }
    }
    summaryInfo[`${k_1040} 12 Standard deduction or itemized deductions`] = f['12'];

    pushToDict(f, '13', qualifiedBusinessDeduction);
    pushToDict(f, '13_b', existing(k_1040s1a)['38'] || 0);
    pushSum(f, '14', ['12', '13', '13_b', 'charitable_nonitemizer']);
    pushToDict(f, '15', Math.max(0, (f['11'] || 0) - (f['14'] || 0)));  // Taxable income
    if (!('15' in f)) f['15'] = 0;  // 'If zero or less, enter -0-'
    summaryInfo[`${k_1040} 15 Taxable income`] = f['15'];

    if (dividendsQualified) {
      buildQualifiedDividendsWorksheet();  // enters value in 16
    } else {
      pushToDict(f, '16', computation(f['15']));
    }
    if (!('16' in f)) f['16'] = 0;
    summaryInfo[`${k_1040} 16 Tax`] = f['16'];

    // Schedule 3 first: Form 6251 line 10 subtracts the foreign tax credit (Schedule 3 line 1)
    if (foreignTax > 0 || excessSocialSecurity > 0) buildForm1040s3();  // fills 20 and 31

    buildForm1040s2();  // fills 17 and 23
    if ((existing(k_1040s2)['3'] || 0) === 0 && (existing(k_1040s2)['21'] || 0) === 0) {
      delete formsState[k_1040s2];
    }

    pushSum(f, '18', ['16', '17']);
    pushToDict(f, '19', 0);  // child tax credit
    pushSum(f, '21', ['19', '20']);
    pushToDict(f, '22', Math.max(0, (f['18'] || 0) - (f['21'] || 0)));

    pushSum(f, '24', ['22', '23']);  // total tax
    summaryInfo[`${k_1040} 24 Total Tax`] = f['24'];

    pushToDict(f, '25_a', federalTax);  // from W2
    pushToDict(f, '25_b', retirementFederalTax + governmentFederalTax);  // from 1099
    pushSum(f, '25_d', ['25_a', '25_b', '25_c']);

    const estimatedPayments = (d['EstimatedIncomeTax']?.['Federal'] || [])
      .reduce((total: number, line: D) => total + line['Amount'], 0);
    pushToDict(f, '26', estimatedPayments);

    pushToDict(f, '27_a', 0);  // Earned Income Credit
    pushToDict(f, '27_b', 0);  // Nontaxable combat pay election
    pushToDict(f, '27_c', 0);  // Prior year Earned Income
    pushToDict(f, '28', 0);  // Additional child tax Credit
    pushToDict(f, '29', 0);  // American opportunity credit Form 8863, line 8
    pushToDict(f, '30', 0);  // Recovery rebate credit
    // line 31: Schedule 3 line 15, filled by Form1040s3
    pushSum(f, '32', ['27_a', '27_b', '27_c', '28', '29', '30', '31']);

    pushSum(f, '33', ['25_d', '26', '32']);  // total payments
    summaryInfo[`${k_1040} 33 Total Payments`] = f['33'];

    const overpaid = f['33'] - f['24'];
    if (overpaid > 0) {
      pushToDict(f, '34', overpaid);
      summaryInfo[`${k_1040} 34 Overpaid`] = f['34'];
      pushToDict(f, '35a_value', overpaid);
      f['35b'] = d['routing_number'];
      if (d['checking']) {
        f['35c_checking'] = true;
      } else {
        f['35c_savings'] = true;
      }
      f['35d'] = d['account_number'];
      f['36'] = '-0-';
    } else {
      pushToDict(f, '37', -overpaid);
      pushToDict(f, '38', 0);
      summaryInfo[`${k_1040} 37 amount you owe`] = f['37'] || 0;
    }

    pushToDict(f, 'other_designee_n', true);
  }

  /** Schedule 1-A Additional Deductions (2025-2028), following the form line by line.
   * Input keys (all optional): qualified_tips (line 4c), qualified_tips_business (line 5),
   * qualified_overtime (line 14a, W-2), qualified_overtime_1099 (line 14b),
   * vehicle_loans: [{VIN, Interest, DeductedOnBusinessSchedule}] (line 22, at most 2 rows),
   * birth_date / spouse.birth_date ("YYYY-MM-DD") for the senior deduction. */
  function buildForm1040s1a() {
    const f = form(k_1040s1a);
    pushNameSsn(f);

    // Part I - MAGI (Puerto Rico / Form 2555 / Form 4563 exclusions not supported)
    pushToDict(f, '1', existing(k_1040)['11'] || 0);
    pushToDict(f, '3', f['1'] || 0);
    const magi = f['3'] || 0;

    // Part II - No tax on tips
    pushToDict(f, '4_c', d['qualified_tips'] || 0);
    pushToDict(f, '5', d['qualified_tips_business'] || 0);
    pushToDict(f, '6', (f['4_c'] || 0) + (f['5'] || 0));
    if ('6' in f) {
      pushToDict(f, '7', Math.min(f['6'], config.tips_deduction_max));
      pushToDict(f, '8', magi);
      pushToDict(f, '9', config.tips_overtime_phaseout_start);
      pushToDict(f, '10', Math.max(0, magi - f['9']));
      pushToDict(f, '11', Math.floor((f['10'] || 0) / 1_000));  // rounded down
      pushToDict(f, '12', (f['11'] || 0) * 100);
      pushToDict(f, '13', Math.max(0, (f['7'] || 0) - (f['12'] || 0)));
    }

    // Part III - No tax on overtime
    pushToDict(f, '14_a', d['qualified_overtime'] || 0);
    pushToDict(f, '14_b', d['qualified_overtime_1099'] || 0);
    pushToDict(f, '14_c', (f['14_a'] || 0) + (f['14_b'] || 0));
    if ('14_c' in f) {
      pushToDict(f, '15', Math.min(f['14_c'], config.overtime_deduction_max));
      pushToDict(f, '16', magi);
      pushToDict(f, '17', config.tips_overtime_phaseout_start);
      pushToDict(f, '18', Math.max(0, magi - f['17']));
      pushToDict(f, '19', Math.floor((f['18'] || 0) / 1_000));
      pushToDict(f, '20', (f['19'] || 0) * 100);
      pushToDict(f, '21', Math.max(0, (f['15'] || 0) - (f['20'] || 0)));
    }

    // Part IV - No tax on car loan interest
    const vehicleLoans: D[] = d['vehicle_loans'] || [];
    if (vehicleLoans.length > 2) {
      console.error('Schedule 1-A line 22: more than two vehicles, attach a statement (only 2 filled)');
    }
    const deductibleInterest = (loan: D) => (loan['Interest'] || 0) - (loan['DeductedOnBusinessSchedule'] || 0);
    vehicleLoans.slice(0, 2).forEach((loan, index) => {
      const row = 'ab'[index];
      f[`22${row}_vin`] = loan['VIN'] ?? '';
      pushToDict(f, `22${row}_deducted`, loan['DeductedOnBusinessSchedule'] || 0);
      pushToDict(f, `22${row}_value`, deductibleInterest(loan));
    });
    pushToDict(f, '23', vehicleLoans.reduce((total, loan) => total + deductibleInterest(loan), 0));
    if ('23' in f) {
      pushToDict(f, '24', Math.min(f['23'], config.car_loan_interest_max));
      pushToDict(f, '25', magi);
      pushToDict(f, '26', config.car_loan_phaseout_start);
      pushToDict(f, '27', Math.max(0, magi - f['26']));
      // line 28 rounds the count UP (unlike tips/overtime)
      pushToDict(f, '28', Math.ceil((f['27'] || 0) / 1_000));
      pushToDict(f, '29', (f['28'] || 0) * 200);
      pushToDict(f, '30', Math.max(0, (f['24'] || 0) - (f['29'] || 0)));
    }

    // Part V - Enhanced deduction for seniors (born before the cutoff, e.g. January 2, 1961 for 2025)
    const cutoff = config.senior_birth_cutoff;
    const selfSenior = (d['birth_date'] || '9999-12-31') < cutoff;
    const spouseSenior = marriedFilingJointly && (spouse['birth_date'] || '9999-12-31') < cutoff;
    if (selfSenior || spouseSenior) {
      pushToDict(f, '31', magi);
      pushToDict(f, '32', config.senior_phaseout_start);
      pushToDict(f, '33', Math.max(0, magi - f['32']));
      pushToDict(f, '34', (f['33'] || 0) * config.senior_phaseout_rate);
      pushToDict(f, '35', Math.max(0, config.senior_deduction - (f['34'] || 0)));
      if (selfSenior) pushToDict(f, '36_a', f['35'] || 0);
      if (spouseSenior) pushToDict(f, '36_b', f['35'] || 0);
      pushToDict(f, '37', (f['36_a'] || 0) + (f['36_b'] || 0));
    }

    // Part VI - total, to Form 1040 line 13b
    pushToDict(f, '38', ['13', '21', '30', '37'].reduce((total, key) => total + (f[key] || 0), 0));
    if ('38' in f) summaryInfo[`${k_1040s1a} 38 Additional deductions (Schedule 1-A)`] = f['38'];
  }

  function buildForm1040s1() {
    const f = form(k_1040s1);
    pushNameSsn(f);
    pushToDict(f, '7', unemployment);  // unemployment compensation (1099-G box 1)
    if (unemployment > 0) summaryInfo[`${k_1040s1} 7 Unemployment compensation`] = unemployment;
    if (k_8889 in formsState) {
      const hsa = formsState[k_8889] as D;
      const hsaDeduction = hsa['13'] || 0;
      if (hsaDeduction > 0) pushToDict(f, '13', hsaDeduction);
      // income from Form 8889: taxable distributions (line 16) + testing period income (line 20)
      const hsaIncome = (hsa['16'] || 0) + (hsa['20'] || 0);
      if (hsaIncome > 0) pushToDict(f, '8_f', hsaIncome);
      if ((hsa['13'] || 0) === 0 && hsaIncome === 0) delete formsState[k_8889];
    }
    // 8a, 8d, 8s are losses/subtractions on the IRS form
    const value = (key: string) => f[key] || 0;
    pushToDict(f, '9',
      -value('8_a') + value('8_b') + value('8_c') - value('8_d') + value('8_e') + value('8_f')
      + value('8_g') + value('8_h') + value('8_i') + value('8_j') + value('8_k') + value('8_l')
      + value('8_m') + value('8_n') + value('8_o') + value('8_p') + value('8_q') + value('8_r')
      - value('8_s') + value('8_t') + value('8_u') + value('8_v') + value('8_z')
    );
    pushSum(f, '10', ['1', '2_a', '3', '4', '5', '6', '7', '9']);  // to 1040 line 8
    pushSum(f, '25', ['24_a', '24_b', '24_c', '24_d', '24_e', '24_f', '24_g', '24_h', '24_i', '24_j', '24_k', '24_z']);
    pushSum(f, '26', ['11', '12', '13', '14', '15', '16', '17', '18', '19_a', '20', '21', '23', '25']);  // to 1040 line 10
  }

  function buildForm1040s2() {
    const f = form(k_1040s2);
    pushNameSsn(f);

    // Part I - Tax
    // line 2: AMT. From 2025 the 1040 instructions point to Form 6251 Who Must File, so it is always computed.
    buildForm6251();  // fills 2
    // Who Must File: attach only when line 7 is more than line 10 (i.e. there is AMT)
    if ((existing(k_6251)['11_value'] || 0) === 0) delete formsState[k_6251];
    pushSum(f, '3', ['1_z', '2']);
    pushToDict(form(k_1040, true), '17', f['3']);

    // Part II - Other Taxes
    pushSum(f, '7', ['5', '6']);
    buildForm8959();  // Additional Medicare Tax - fills 11
    const f8959 = formsState[k_8959] as D;
    if (f8959['18'] === 0 && f8959['24'] === 0) delete formsState[k_8959];

    buildForm8960();  // Net Investment Income Tax - fills 12
    if ((existing(k_8960)['17'] || 0) === 0) delete formsState[k_8960];

    // HSA additional taxes from Form 8889
    if (k_8889 in formsState) {
      pushToDict(f, '17_c', existing(k_8889)['17_b'] || 0);
      pushToDict(f, '17_d', existing(k_8889)['21'] || 0);
    }

    pushSum(f, '18', [
      '17_a_value', '17_b', '17_c', '17_d', '17_e', '17_f', '17_g', '17_h',
      '17_i', '17_j', '17_k', '17_l', '17_m', '17_n', '17_o', '17_p', '17_q', '17_z_amount',
    ]);

    pushSum(f, '21', ['4', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '18']);
    summaryInfo[`${k_1040s2} 21 Total Other Taxes`] = f['21'];
    pushToDict(form(k_1040, true), '23', f['21']);
  }

  function buildForm1116(): number {
    const f = form(k_1116);
    pushNameSsn(f);

    // Passive category income (box c)
    f['c'] = true;

    // Part I: foreign source income, only from 1099 entries that paid foreign tax
    let foreignSourceDividends = 0;
    let foreignSourceInterest = 0;
    let foreignCountry: string | null = null;
    for (const entry of entries1099) {
      if ((entry['Foreign Tax Paid'] || 0) > 0) {
        foreignSourceDividends += entry['Ordinary Dividends'] || 0;
        foreignSourceInterest += entry['Interest'] || 0;
        foreignCountry = entry['Foreign Country'] || foreignCountry;
      }
    }
    const foreignSourceIncome = foreignSourceDividends + foreignSourceInterest;
    if (foreignCountry) f['i_a'] = foreignCountry;
    f['i_1a_source1'] = 'Dividends, Interest';
    pushToDict(f, 'i_1a_a', foreignSourceIncome);
    pushToDict(f, 'i_1a_total', foreignSourceIncome);

    // Line 3a: standard deduction or certain itemized deductions, apportioned by foreign / gross income
    const f1040 = existing(k_1040);
    const grossIncome = f1040['9'] || 0;
    const apportionmentRatio = grossIncome > 0 ? rounded(foreignSourceIncome / grossIncome, 4) : 0;
    const deduction = f1040['12'] || 0;
    const line3a = grossIncome > 5000 ? rounded(deduction * apportionmentRatio, 2) : deduction;
    pushToDict(f, '2_a', line3a);
    pushToDict(f, 'i_1a_a', foreignSourceIncome);
    pushToDict(f, '7_total', foreignSourceIncome - line3a);

    // Part II: foreign taxes paid ("Paid" method, box j)
    pushToDict(f, 'j', true);
    if (foreignCountry) f['a_l'] = foreignCountry;
    pushToDict(f, 'a_t', foreignTax);
    pushToDict(f, '8', foreignTax);

    // Part III: figuring the credit
    pushToDict(f, '9', foreignTax);
    pushToDict(f, '11', foreignTax);
    pushToDict(f, '13', 0);
    pushToDict(f, '14', foreignTax);
    pushToDict(f, '15', foreignSourceIncome - line3a);
    pushToDict(f, '17', Math.max(0, f['15'] || 0));

    const taxableIncome = f1040['15'] || 0;
    pushToDict(f, '18', taxableIncome);

    let limitationFraction = 0;
    if (taxableIncome > 0) {
      limitationFraction = Math.min(rounded((f['17'] || 0) / taxableIncome, 4), 1.0);
    }
    pushToDict(f, '19', limitationFraction, 4);

    const usTax = f1040['16'] || 0;
    pushToDict(f, '20', usTax);
    const maxCredit = rounded(limitationFraction * usTax);
    pushToDict(f, '21', maxCredit);
    pushToDict(f, '23', maxCredit);

    const credit = Math.min(f['14'] || 0, f['23'] || 0);
    pushToDict(f, '24', credit);

    // Part IV: summary (only one Form 1116)
    pushToDict(f, '25', credit);
    pushToDict(f, '32', credit);
    pushToDict(f, '33', Math.min(usTax, credit));
    pushToDict(f, '35', 0);

    summaryInfo[`${k_1116} 17 Foreign source taxable income`] = f['17'] || 0;
    summaryInfo[`${k_1116} 19 Limitation fraction`] = limitationFraction;
    summaryInfo[`${k_1116} 21 Maximum credit`] = maxCredit;
    summaryInfo[`${k_1116} 24 Foreign tax credit`] = credit;
    if (credit < foreignTax) {
      summaryInfo[`${k_1116} Excess foreign tax (carryforward)`] = foreignTax - credit;
    }
    return credit;
  }

  function buildForm1040s3() {
    const f = form(k_1040s3);
    pushNameSsn(f);
    // Part I - Nonrefundable credits
    if (foreignTax > 0) pushToDict(f, '1', buildForm1116());
    pushToDict(f, '8', ['1', '2', '3', '4', '5', '7'].reduce((total, key) => total + (f[key] || 0), 0));
    pushToDict(form(k_1040, true), '20', f['8'] || 0);
    // Part II - Other payments and refundable credits
    pushToDict(f, '11', excessSocialSecurity, 2);
    pushToDict(f, '14', ['13_a', '13_b', '13_c', '13_d', '13_z_amount'].reduce((total, key) => total + (f[key] || 0), 0));
    pushToDict(f, '15', ['9', '10', '11', '12', '14'].reduce((total, key) => total + (f[key] || 0), 0), 2);
    pushToDict(form(k_1040, true), '31', f['15'] || 0, 2);
  }

  function buildForm1040sa() {
    const f = form(k_1040sa);
    pushNameSsn(f);
    const agi = existing(k_1040)['11'] || 0;

    pushToDict(f, '1', d['medical_expenses'] || 0);
    pushToDict(f, '2', agi);
    pushToDict(f, '3', (f['2'] || 0) * 0.075);
    pushToDict(f, '4', Math.max(0, (f['1'] || 0) - (f['3'] || 0)));

    if (d['deduct_sales_tax']) {
      pushToDict(f, '5_a_y', true);
      pushToDict(f, '5_a', d['deduct_sales_tax_amount'] || 0);
    } else {
      pushToDict(f, '5_a', stateTax + localTax);
    }

    const propertyTax = otherEntries.reduce((total, line) => total + (line['PropertyTax'] || 0), 0);
    pushToDict(f, '5_c', propertyTax);
    pushSum(f, '5_d', ['5_a', '5_b', '5_c']);
    // Line 5e: SALT deduction limit (worksheet-based for 2025+)
    pushToDict(f, '5_e', buildSALTWorksheet(f['5_d'] || 0));
    pushSum(f, '7', ['5_e', '6']);

    buildMortgageInterestWorksheet();  // 8a
    pushSum(f, '8_e', ['8_a', '8_b', '8_c']);
    pushSum(f, '10', ['8_e', '9']);

    // charity (Schedule A lines 11-14): 11 cash, 12 other than cash, 13 carryover
    const charitableCash = charitableGifts.reduce((total, gift) => total + (gift['Amount'] || 0), 0);
    pushToDict(f, '11', charitableCash);
    pushSum(f, '14', ['11', '12', '13']);
    if (charitableAgiFloorRate && f['14'] > 0) {
      // 2026+: gifts count only above 0.5% of AGI (contribution base)
      const charitableFloor = Math.min(f['14'], agi * charitableAgiFloorRate);
      summaryInfo[`${k_1040sa} 14 Charitable gifts below the AGI floor`] = bankersRound(charitableFloor);
      f['14'] = rounded(f['14'] - charitableFloor);
    }

    pushSum(f, '17', ['4', '7', '10', '14', '15', '16']);
    if (itemizedLimitationRate && f['17'] > 0) {
      f['17'] = rounded(f['17'] - buildItemizedDeductionLimitationWorksheet(f['17']));
    }
    // to 1040 line 12
  }

  function buildForm1040sb() {
    const f = form(k_1040sb);
    pushNameSsn(f);

    function fillValue(index: string, key: string) {
      let i = 1;
      for (const entry of entries1099) {
        if (key in entry && entry[key] !== 0) {
          if (entry['Institution'] === 'Department of the Treasury') {
            summaryInfo[`${k_1040sb} Treasury Interest`] = entry[key];
          }
          f[`${index}_${i}_payer`] = entry['Institution'];
          pushToDict(f, `${index}_${i}_value`, entry[key]);
          i++;
        }
        if (key === 'Interest' && 'InterestBondsObligations' in entry && entry['InterestBondsObligations'] !== 0) {
          f[`${index}_${i}_payer`] = entry['Institution'] + ' US Govt Bonds';
          pushToDict(f, `${index}_${i}_value`, entry['InterestBondsObligations']);
          summaryInfo[`${k_1040sb} ${entry['Institution']} US Govt Bonds Interest`] = entry['InterestBondsObligations'];
          i++;
        }
        if (key === 'Interest' && 'Other Income' in entry && entry['Other Income'] !== 0) {
          f[`${index}_${i}_payer`] = entry['Institution'] + ' ' + entry['Other Description'];
          pushToDict(f, `${index}_${i}_value`, entry['Other Income']);
          i++;
        }
      }
    }
    fillValue('1', 'Interest');
    fillValue('5', 'Ordinary Dividends');

    pushSum(f, '2_value', Array.from({ length: 14 }, (_, index) => `1_${index + 1}_value`));
    pushToDict(f, '4_value', (f['2_value'] || 0) - (f['3_value'] || 0));
    pushSum(f, '6_value', Array.from({ length: 16 }, (_, index) => `5_${index + 1}_value`));

    pushToDict(form(k_1040, true), '2_b', f['4_value'] || 0);
    pushToDict(form(k_1040, true), '3_b', f['6_value'] || 0);

    if ('foreign_account' in d) {
      f['7a_y'] = true;
      f['7a_yes_y'] = true;
      f['7b_1'] = d['foreign_account'];
      f['8_n'] = true;
    } else {
      f['7a_n'] = true;
      f['8_n'] = true;
    }
  }

  function buildForm1040sd() {
    const f = form(k_1040sd);
    pushNameSsn(f);
    f['dispose_opportunity_n'] = true;

    function fillGains(lsKey: 'SHORT' | 'LONG', boxIndex: string, numberIndex: string) {
      const totals = sumTrades[lsKey][boxIndex];
      pushToDict(f, `${numberIndex}_proceeds`, totals.Proceeds);
      pushToDict(f, `${numberIndex}_cost`, totals.Cost);
      if (!numberIndex.includes('a') && !numberIndex.includes('b')) {
        pushToDict(f, `${numberIndex}_adjustments`, totals.Adjustment);
      }
      pushToDict(f, `${numberIndex}_gain`, totals.Gain);
    }
    fillGains('SHORT', 'A', '1a');
    fillGains('SHORT', 'B', '2');
    fillGains('SHORT', 'C', '3');
    fillGains('LONG', 'D', '8a');
    fillGains('LONG', 'E', '9');
    fillGains('LONG', 'F', '10');

    // Form 6781 Section 1256 contracts -> Schedule D lines 4 and 11
    if (contract1256 && k_6781 in formsState) {
      const f6781 = formsState[k_6781] as D;
      if ('8' in f6781) pushToDict(f, '4', f6781['8']);
      if ('9' in f6781) pushToDict(f, '11', f6781['9']);
    }

    buildCapitalLossCarryoverWorksheet();  // fills '6' and '14'

    // loss as positive number, flip sign for the sum
    revertSign(f, '6');
    pushSum(f, '7', ['1a_gain', '1b_gain', '2_gain', '3_gain', '4', '5', '6']);
    revertSign(f, '6');
    summaryInfo[`${k_1040sd} 7 Net short-term capital gain or (loss)`] = f['7'];

    if (capitalGains) pushToDict(f, '13', capitalGains);
    revertSign(f, '14');
    pushSum(f, '15', ['8a_gain', '8b_gain', '9_gain', '10_gain', '11', '12', '13', '14']);
    revertSign(f, '14');
    summaryInfo[`${k_1040sd} 15 Net long-term capital gain or (loss)`] = f['15'];

    pushSum(f, '16', ['7', '15']);
    if (f['16'] > 0) {
      pushToDict(form(k_1040, true), '7_value', f['16']);
      if (f['15'] > 0 && f['16'] > 0) {
        f['17_y'] = true;
        // 18 is '28% Rate Gain Worksheet', 19 is 'Unrecaptured Section 1250 Gain Worksheet', 20 also 4952
        const form4952 = false;
        if ((f['18'] || 0) === 0 && (f['19'] || 0) === 0 && !form4952) {
          f['20_y'] = true;
        } else {
          f['20_n'] = true;
        }
        return;  // don't fill 22
      }
      f['17_n'] = true;
    } else if (f['16'] < 0) {
      const capitalLossLimit = config.capital_loss_limit;  // $3,000 single and MFJ ($1,500 MFS)
      pushToDict(f, '21', -Math.min(capitalLossLimit, -f['16']));
      pushToDict(form(k_1040, true), '7_value', f['21']);
      revertSign(f, '21');  // show amount as positive
    }

    if (dividendsQualified !== null && dividendsQualified > 0) {
      f['22_y'] = true;
    } else {
      f['22_n'] = true;
    }
  }

  function buildForm6251() {
    const f = form(k_6251);
    pushNameSsn(f);
    const f1040 = existing(k_1040);

    // Part I - Alternative Minimum Taxable Income (AMTI)
    // 2025+: line 1a = f1040 line 14 - Schedule 1-A line 37 (senior deduction, allowed for AMT),
    //        line 1b = f1040 line 11 - line 1a (can be negative); '1_value' holds line 1 / 1b
    const seniorDeduction = existing(k_1040s1a)['37'] || 0;
    const line1a = (f1040['14'] || 0) - seniorDeduction;
    if (config.form_6251_line_1_split) pushToDict(f, '1a_value', line1a);
    pushToDict(f, '1_value', (f1040['11'] || 0) - line1a);
    // Line 2a: taxes from Schedule A line 7 when itemizing, otherwise the standard deduction (f1040 line 12)
    if (k_1040sa in formsState) {
      pushToDict(f, '2a_value', existing(k_1040sa)['7'] || 0);
    } else {
      pushToDict(f, '2a_value', f1040['12'] || 0);
    }
    // IRC 68 itemized limitation (2026+) doesn't apply for AMT (IRC 56(b)(1)(F)): subtract it back.
    // PROVISIONAL key until the final 2026 Form 6251 line is known.
    const itemizedLimitation = itemizedLimitationReduction();
    if (itemizedLimitation > 0) pushToDict(f, 'itemized_limitation_adjustment', -itemizedLimitation);
    // Line 4: AMTI = sum of lines 1 through 3
    pushSum(f, '4_value', [
      'itemized_limitation_adjustment',
      '1_value',
      ...'abcdefghijklmnopqrst'.split('').map(letter => `2${letter}_value`),
      '3_value',
    ]);
    if ('4_value' in f) summaryInfo[`${k_6251} 4 Alternative minimum taxable income`] = f['4_value'];

    // Part II - AMT Exemption and Computation
    // Line 5: exemption reduced by 25% (50% from 2026) of AMTI exceeding phaseout start
    const amti = f['4_value'] || 0;
    let exemption = config.amt_exemption;
    const phaseoutStart = config.should_fill_6251_phaseout;
    if (amti > phaseoutStart) {
      exemption = Math.max(0, exemption - amtPhaseoutRate * (amti - phaseoutStart));
    }
    pushToDict(f, '5_value', exemption);
    // Line 6: AMTI minus exemption
    pushToDict(f, '6_value', Math.max(0, amti - (f['5_value'] || 0)));

    if ((f['6_value'] || 0) > 0) {
      const amtTaxable = f['6_value'];

      /** 26% up to threshold, 28% above. */
      const amt2628 = (amount: number) => (amount <= config.amt_28pct_threshold
        ? amount * 0.26
        : amount * 0.28 - config.amt_28pct_excess);

      // Line 7: Part III (preferential capital gain rates) or flat 26%/28%
      const scheduleD = existing(k_1040sd);
      const usePartIII =
        (dividendsQualified !== null && dividendsQualified > 0) ||
        (scheduleDFiled && (scheduleD['15'] || 0) > 0 && (scheduleD['16'] || 0) > 0);

      if (usePartIII) {
        // Part III: 0%/15%/20% on qualified dividends and capital gains, 26%/28% on ordinary portion only
        const qdiv = f1040['3_a'] || 0;
        let sdGain: number;
        if (scheduleDFiled) {
          const sd15 = scheduleD['15'] || 0;
          const sd16 = scheduleD['16'] || 0;
          sdGain = (sd15 > 0 && sd16 > 0) ? Math.max(0, Math.min(sd15, sd16)) : 0;
        } else {
          sdGain = Math.max(0, f1040['7_value'] || 0);
        }
        const capGains = qdiv + sdGain;
        const ordinary = Math.max(0, amtTaxable - capGains);
        const zeroCeiling = config.qualified_div_0pct;
        const line18 = Math.min(amtTaxable, zeroCeiling);
        const atZero = line18 - Math.min(ordinary, line18);
        const line21 = Math.min(amtTaxable, capGains);
        const line25 = Math.min(amtTaxable, config.qualified_div_20pct);
        const line27 = Math.max(0, line25 - (ordinary + atZero));
        const atFifteen = Math.min(line21 - atZero, line27);
        const atTwenty = line21 - atZero - atFifteen;
        const preferential = atFifteen * 0.15 + atTwenty * 0.20 + amt2628(ordinary);
        pushToDict(f, '7_value', Math.min(preferential, amt2628(amtTaxable)));
      } else {
        pushToDict(f, '7_value', amt2628(amtTaxable));
      }
      // Line 10: f1040 line 16 + Schedule 2 line 1z - Schedule 3 line 1 (foreign tax credit)
      pushToDict(f, '10_value', Math.max(
        0,
        (f1040['16'] || 0) + (existing(k_1040s2)['1_z'] || 0) - (existing(k_1040s3)['1'] || 0),
      ));
      // Line 8: AMT foreign tax credit, only needed when line 10 is less than line 7
      if (k_1116 in formsState && (f['10_value'] || 0) < (f['7_value'] || 0)) {
        pushToDict(f, '8_value', amtForeignTaxCredit(f['7_value'], amti));
      }
      // Line 9: tentative minimum tax
      pushToDict(f, '9_value', (f['7_value'] || 0) - (f['8_value'] || 0));
    }

    // Line 11: AMT = tentative minimum tax minus regular tax (floor 0)
    pushToDict(f, '11_value', Math.max(0, (f['9_value'] || 0) - (f['10_value'] || 0)));
    if ('11_value' in f) {
      summaryInfo[`${k_6251} 11 AMT`] = f['11_value'];
      pushToDict(form(k_1040s2, true), '2', f['11_value']);
    }
  }

  /** AMT Form 1116 with the simplified limitation election (i6251 line 8): the AMT foreign source income is
   * the regular-tax Form 1116 line 17, the worldwide income is AMTI (Form 6251 line 4), and the limitation
   * applies that fraction to Form 6251 line 7. Not attached as a separate form. */
  function amtForeignTaxCredit(tentativeMinimumTax: number, amti: number): number {
    const regular1116 = existing(k_1116);
    const fraction = amti > 0 ? Math.min(1.0, rounded((regular1116['17'] || 0) / amti, 4)) : 0;
    const limitation = rounded(fraction * tentativeMinimumTax);
    const credit = Math.min(regular1116['14'] || 0, limitation);
    summaryInfo[`${k_6251} 8 AMT foreign tax credit (simplified limitation election)`] = credit;
    return credit;
  }

  function buildForm6781() {
    const f = form(k_6781);
    function* yieldContracts() {
      for (const entry of entries1099) {
        if (!('Institution' in entry)) continue;
        const institution = entry['Institution'];
        if (Array.isArray(entry['Contract1256'])) {
          for (const item of entry['Contract1256']) yield { ...item, Institution: institution };
        }
        if ((entry['Realized1256'] || 0) !== 0 || (entry['Unrealized1256'] || 0) !== 0) {
          yield { ProfitOrLoss: (entry['Realized1256'] || 0) + (entry['Unrealized1256'] || 0), Institution: institution };
        }
      }
    }
    let index = 1;
    for (const item of yieldContracts()) {
      if (index > 3) throw new Error('Form6781 more than 3 contracts need a new page');
      f[`1_${index}_a`] = `Form 1099-B ${item.Institution}`;
      if (item.ProfitOrLoss < 0) {
        pushToDict(f, `1_${index}_b`, -item.ProfitOrLoss);
      } else {
        pushToDict(f, `1_${index}_c`, item.ProfitOrLoss);
      }
      index++;
    }
    pushNameSsn(f);
    pushSum(f, '2_b', ['1_1_b', '1_2_b', '1_3_b']);
    pushSum(f, '2_c', ['1_1_c', '1_2_c', '1_3_c']);
    pushToDict(f, '3', (f['2_c'] || 0) - (f['2_b'] || 0));
    pushSum(f, '5', ['3', '4']);
    pushSum(f, '7', ['5', '6']);
    pushToDict(f, '8', rounded((f['7'] || 0) * 0.4));
    pushToDict(f, '9', rounded((f['7'] || 0) * 0.6));
  }

  function buildForm8889() {
    const f = form(k_8889);
    pushNameSsn(f);

    // health_savings_account_coverage = 'self' (default) or 'family'
    // MFJ with family coverage: one Form 8889 for the family limit, assumed not split with spouse
    let maxContribution: number;
    if ((d['health_savings_account_coverage'] ?? 'self') === 'family') {
      f['1_family'] = true;
      maxContribution = config.hsa_max_contribution_family;
    } else {
      f['1_self'] = true;
      maxContribution = config.hsa_max_contribution;
    }

    pushToDict(f, '2', d['health_savings_account_contributions'] || 0);
    pushToDict(f, '3', maxContribution);
    pushToDict(f, '4', 0);
    pushToDict(f, '5', (f['3'] || 0) - (f['4'] || 0));
    pushToDict(f, '6', f['5'] || 0);  // except if family limit is split with spouse
    pushToDict(f, '7', 0);
    pushSum(f, '8', ['6', '7']);
    pushToDict(f, '9', d['health_savings_account_employer_contributions'] || 0);
    pushToDict(f, '10', 0);
    pushSum(f, '11', ['9', '10']);
    pushToDict(f, '12', Math.max(0, (f['8'] || 0) - (f['11'] || 0)));
    pushToDict(f, '13', Math.min(f['2'] || 0, f['12'] || 0));  // to Schedule 1 line 13

    pushToDict(f, '14_a', d['health_savings_account_distributions'] || 0);
    pushToDict(f, '14_b', 0);  // distribution rolled over
    pushToDict(f, '14_c', (f['14_a'] || 0) - (f['14_b'] || 0));
    // line 15: qualified medical expenses paid from the HSA (defaults to all distributions)
    pushToDict(f, '15', Math.min(
      f['14_c'] || 0,
      d['health_savings_account_qualified_medical_expenses'] ?? (f['14_c'] || 0),
    ));
    pushToDict(f, '16', Math.max(0, (f['14_c'] || 0) - (f['15'] || 0)));  // to Schedule 1 line 8f

    // line 17: 20% additional tax on taxable distributions, unless an exception applies
    // (age 65+, disabled, or death - all-or-nothing)
    if (d['health_savings_account_distribution_exception']) {
      if ((f['16'] || 0) > 0) f['17_a'] = true;
    } else {
      pushToDict(f, '17_b', (f['16'] || 0) * 0.20);  // to Schedule 2 line 17c
    }

    // Part III: failure to stay HDHP-eligible during the testing period
    pushToDict(f, '18', d['health_savings_account_last_month_rule_income'] || 0);
    pushToDict(f, '19', d['health_savings_account_funding_distribution_income'] || 0);
    pushToDict(f, '20', (f['18'] || 0) + (f['19'] || 0));  // to Schedule 1 line 8f
    // line 21: 10% additional tax (none if the failure was due to death or disability)
    if (!d['health_savings_account_testing_period_exception']) {
      pushToDict(f, '21', (f['20'] || 0) * 0.10);  // to Schedule 2 line 17d
    }
  }

  function buildForm8949() {
    form(k_8949);

    function* yieldTrades(longShort: string, formCode: string) {
      for (const entry of entries1099) {
        for (const trade of entry['Trades'] || []) {
          if (trade['LongShort'].includes(longShort) && formCode === trade['FormCode']) yield trade;
        }
      }
      // 1256 contracts go directly to Schedule D lines 4/11, not through 8949
    }

    const tradesSubsets: [string, { SHORT: D[]; LONG: D[] }][] = [];
    const tradesPerPageLimit = config.trades_per_page_limit;
    const take = (trades: Generator<D>) => {
      const page: D[] = [];
      while (page.length < tradesPerPageLimit) {
        const next = trades.next();
        if (next.done) break;
        page.push(next.value);
      }
      return page;
    };

    for (const code of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const shortTrades = yieldTrades('SHORT', code);
      const longTrades = yieldTrades('LONG', code);
      while (true) {
        const trades = { SHORT: take(shortTrades), LONG: take(longTrades) };
        if (trades.SHORT.length === 0 && trades.LONG.length === 0) break;
        tradesSubsets.push([code, trades]);
      }
    }

    function buildOne([code, trades]: [string, { SHORT: D[]; LONG: D[] }]): D | null {
      const page: D = {};
      pushNameSsn(page, 'I_');
      pushNameSsn(page, 'II_');

      function fillTrades(lsKey: 'SHORT' | 'LONG', checkKey: string, index: string) {
        if (trades[lsKey].length === 0) return;
        page[checkKey] = true;
        let sumProceeds = 0, sumCost = 0, sumAdjustment = 0, sumGain = 0;
        trades[lsKey].forEach((trade, position) => {
          const row = `${index}_1_${position + 1}`;
          page[`${row}_description`] = `${trade['Shares']} ${trade['SalesDescription']}`;
          page[`${row}_date_acq`] = trade['DateAcquired'];
          page[`${row}_date_sold`] = trade['DateSold'];
          const proceeds = trade['Proceeds'];
          pushToDict(page, `${row}_proceeds`, proceeds);
          const cost = trade['Cost'];
          pushToDict(page, `${row}_cost`, cost);
          let adjustment = 0;
          if ('WashSaleValue' in trade) {
            adjustment = trade['WashSaleValue'];
            pushToDict(page, `${row}_adjustment`, adjustment);
            page[`${row}_code`] = trade['WashSaleCode'];
          }
          const gain = bankersRound(proceeds) - bankersRound(cost) + bankersRound(adjustment);
          pushToDict(page, `${row}_gain`, gain);
          sumProceeds += bankersRound(proceeds);
          sumCost += bankersRound(cost);
          sumAdjustment += bankersRound(adjustment);
          sumGain += bankersRound(gain);
        });
        pushToDict(page, `${index}_2_proceeds`, sumProceeds);
        pushToDict(page, `${index}_2_cost`, sumCost);
        pushToDict(page, `${index}_2_adjustment`, sumAdjustment);
        pushToDict(page, `${index}_2_gain`, sumGain);

        const totals = sumTrades[lsKey][code];
        totals.Proceeds += sumProceeds;
        totals.Cost += sumCost;
        totals.Adjustment += sumAdjustment;
        totals.Gain += sumGain;
      }

      fillTrades('SHORT', `short_${code.toLowerCase()}`, 'I');
      fillTrades('LONG', `long_${code.toLowerCase()}`, 'II');
      return ['A', 'D'].includes(code) ? null : { ...page };
    }

    const pages = tradesSubsets.map(buildOne).filter((page): page is D => page !== null);
    if (pages.length === 0) {
      delete formsState[k_8949];
    } else if (tradesSubsets.length === 1) {
      formsState[k_8949] = pages[0];
    } else {
      formsState[k_8949] = pages;
    }
  }

  function buildForm8959() {
    const f = form(k_8959);
    pushNameSsn(f);

    // Part I
    pushToDict(f, '1', medicareWages);
    pushSum(f, '4', ['1', '2', '3']);
    pushToDict(f, '5', config.additional_medicare_threshold);
    pushToDict(f, '6', Math.max(0, (f['4'] || 0) - (f['5'] || 0)));
    pushToDict(f, '7', (f['6'] || 0) * 0.009);
    if ('7' in f) summaryInfo[`${k_8959} 7 Additional Medicare Tax on Medicare wages`] = f['7'];

    // Part II (line 8: self-employment income)
    pushToDict(f, '9', config.additional_medicare_threshold);
    pushSum(f, '10', ['4']);
    pushToDict(f, '11', Math.max(0, (f['9'] || 0) - f['10']));
    pushToDict(f, '12', Math.max(0, (f['8'] || 0) - (f['11'] || 0)));
    pushToDict(f, '13', (f['12'] || 0) * 0.009);
    if ('13' in f) summaryInfo[`${k_8959} 13 Additional Medicare Tax on self-employment income`] = f['13'];

    // Part IV
    pushSum(f, '18', ['7', '13', '17']);
    summaryInfo[`${k_8959} 18 Total Additional Medicare Tax`] = f['18'];
    pushToDict(form(k_1040s2, true), '11', f['18']);

    // Part V
    pushToDict(f, '19', medicareTax);
    pushSum(f, '20', ['1']);
    pushToDict(f, '21', (f['20'] || 0) * 0.0145);
    if ('21' in f) summaryInfo[`${k_8959} 21 Regular Medicare Tax withholding on Medicare wages`] = f['21'];
    pushToDict(f, '22', Math.max(0, (f['19'] || 0) - (f['21'] || 0)));
    if ('22' in f) summaryInfo[`${k_8959} Additional Medicare Tax withholding on Medicare wages`] = f['22'];

    pushSum(f, '24', ['22', '23']);
    if ('24' in f) summaryInfo[`${k_8959} 24 Total Additional Medicare Tax withholding`] = f['24'];
    pushToDict(form(k_1040, true), '25_c', f['24']);
  }

  function buildForm8960() {
    const f = form(k_8960);
    pushNameSsn(f);
    const f1040 = existing(k_1040);

    // Part I - Net Investment Income
    pushToDict(f, '1', f1040['2_b'] || 0);  // taxable interest
    pushToDict(f, '2', f1040['3_b'] || 0);  // ordinary dividends
    pushToDict(f, '4_a', 0);
    pushToDict(f, '4_b', 0);
    pushSum(f, '4_c', ['4_a', '4_b']);
    pushToDict(f, '5_a', f1040['7_value'] || 0);  // net gain/loss from disposition of property
    pushSum(f, '5_d', ['5_a', '5_b', '5_c']);
    pushSum(f, '8', ['1', '2', '3', '4_c', '5_d', '6', '7']);

    // Part II - Investment Expenses
    pushSum(f, '9_d', ['9_a', '9_b', '9_c']);
    pushToDict(f, '11', Math.max(0, (f['8'] || 0) - (f['9_d'] || 0) - (f['10'] || 0)));
    summaryInfo[`${k_8960} 8 Net investment income`] = f['8'] || 0;

    // Part III - Tax Computation (Individuals)
    pushToDict(f, '12', f['11'] || 0);
    pushToDict(f, '13', f1040['11'] || 0);  // MAGI = AGI (no section 911 or CFC/PFIC)
    pushToDict(f, '14', config.niit_threshold);
    pushToDict(f, '15', Math.max(0, (f['13'] || 0) - (f['14'] || 0)));
    pushToDict(f, '16', Math.min(f['12'] || 0, f['15'] || 0));
    const niit = rounded((f['16'] || 0) * 0.038);
    pushToDict(f, '17', niit);
    summaryInfo[`${k_8960} 17 Net Investment Income Tax`] = niit;
    pushToDict(form(k_1040s2, true), '12', niit);
  }

  // ===================== WORKSHEETS =====================

  /** State and Local Tax Deduction Worksheet (Schedule A line 5e): cap phased out by 30% of
   * (MAGI - start), with a floor. Returns line 10. */
  function buildSALTWorksheet(saltTotal: number): number {
    const ws = worksheet(w_salt_deduction, 10);
    // If total SALT <= floor, deduction isn't limited - skip worksheet
    if (saltTotal <= config.salt_floor) {
      summaryInfo[`${w_salt_deduction} 10 SALT deduction`] = saltTotal;
      return saltTotal;
    }
    ws[1] = config.salt_limit;
    ws[2] = existing(k_1040)['11'] || 0;  // MAGI = AGI (foreign exclusions not supported)
    ws[4] = ws[2];
    ws[5] = config.salt_phaseout_start;
    if (ws[4] > ws[5]) {
      ws[6] = ws[4] - ws[5];
      ws[7] = ws[6] * config.salt_phaseout_rate;
      ws[8] = ws[1] - ws[7];
      ws[9] = Math.max(ws[8], config.salt_floor);
    } else {
      ws[9] = ws[1];
    }
    ws[10] = Math.min(ws[9], saltTotal);
    summaryInfo[`${w_salt_deduction} 10 SALT deduction`] = ws[10];
    return ws[10];
  }

  /** IRC 68 as amended by OBBBA (2026+): itemized deductions are reduced by 2/37 of the lesser of the
   * itemized deductions or the amount by which taxable income (before this limitation, increased by
   * itemized deductions) exceeds the start of the 37% bracket. Returns line 6. PROVISIONAL layout. */
  function buildItemizedDeductionLimitationWorksheet(itemizedTotal: number): number {
    const ws = worksheet(w_itemized_limitation, 6);
    ws[1] = itemizedTotal;
    // taxable income before the limitation + itemized deductions = AGI - QBI - Schedule 1-A deductions
    ws[2] = (existing(k_1040)['11'] || 0) - qualifiedBusinessDeduction - (existing(k_1040s1a)['38'] || 0);
    ws[3] = config.fed_brackets[config.fed_brackets.length - 1];  // start of the 37% bracket
    ws[4] = Math.max(0, ws[2] - ws[3]);
    ws[5] = Math.min(ws[1], ws[4]);
    ws[6] = rounded(ws[5] * itemizedLimitationRate);
    if (ws[6] > 0) summaryInfo[`${w_itemized_limitation} 6 Itemized deduction limitation (IRC 68)`] = ws[6];
    return ws[6];
  }

  // See IRS Publication 936 - Home Mortgage Interest Deduction
  function buildMortgageInterestWorksheet() {
    const ws = worksheet(w_mortgage_interest_deduction, 16);
    let interestPaid = 0;
    let balanceStart = 0;
    let principalPayments = 0;
    for (const item of d['1098'] || []) {
      balanceStart += item['PrincipalBalance'] || 0;
      for (const payment of item['Payments'] || []) {
        interestPaid += payment['InterestAmount'] || 0;
        principalPayments += payment['PrincipalAmount'] || 0;
      }
    }
    // Part I - Qualified Loan Limit
    ws[1] = 0;  // grandfathered
    ws[2] = 0;  // old
    ws[3] = 1_000_000;  // pre-TCJA grandfathered debt ceiling (IRS Pub 936)
    ws[4] = Math.max(ws[1], ws[3]);
    ws[5] = ws[1] + ws[2];
    ws[6] = Math.min(ws[4], ws[5]);
    ws[7] = balanceStart - 0.5 * principalPayments;  // average balance
    ws[8] = config.mortgage_limit;
    ws[9] = Math.max(ws[6], ws[8]);
    ws[10] = ws[6] + ws[7];
    ws[11] = Math.min(ws[9], ws[10]);
    summaryInfo[`${w_mortgage_interest_deduction} 11 Qualified loan limit for ${year}`] = ws[11];

    // Part II - Deductible Home Mortgage Interest
    ws[12] = ws[1] + ws[2] + ws[7];
    ws[13] = interestPaid;
    if (ws[11] >= ws[12]) {
      pushToDict(form(k_1040sa, true), '8_a', ws[13]);
      summaryInfo[`${w_mortgage_interest_deduction} 13 All Interest Deductible for ${year}`] = ws[13];
      return;
    }
    // Partial deduction - prorate by qualified loan ratio
    ws[14] = rounded(ws[11] / ws[12], 3);
    ws[15] = ws[13] * ws[14];
    pushToDict(form(k_1040sa, true), '8_a', ws[15]);
    summaryInfo[`${w_mortgage_interest_deduction} 15 Deductible Home Mortgage Interest for ${year}`] = ws[15];
    ws[16] = ws[13] - ws[15];
    summaryInfo[`${w_mortgage_interest_deduction} 16 Personal (not Deductible) Interest for ${year}`] = ws[16];
  }

  function buildCapitalLossCarryoverWorksheet() {
    const ws = worksheet(w_capital_loss_carryover, 13);
    if (priorYear === null) return;
    ws[1] = priorYear.taxable_income;
    ws[2] = Math.max(0, priorYear.schedule_d_loss_deduction);  // sign flip
    ws[3] = Math.max(0, ws[1] + ws[2]);
    ws[4] = Math.min(ws[2], ws[3]);
    if (priorYear.schedule_d_net_short_term < 0) {
      ws[5] = Math.max(0, -priorYear.schedule_d_net_short_term);
      ws[6] = Math.max(0, priorYear.schedule_d_net_long_term);
      ws[7] = ws[4] + ws[6];
      ws[8] = Math.max(0, ws[5] - ws[7]);  // enter this in D 6, loss as positive number
      summaryInfo[`${w_capital_loss_carryover} 8 Short-term capital loss carryover for ${year}`] = ws[8];
    }
    if (priorYear.schedule_d_net_long_term < 0) {
      ws[9] = Math.max(0, -priorYear.schedule_d_net_long_term);
      ws[10] = Math.max(0, priorYear.schedule_d_net_short_term);
      ws[11] = Math.max(0, ws[4] - ws[5]);
      ws[12] = ws[10] + ws[11];
      ws[13] = Math.max(0, ws[9] - ws[12]);  // enter in D 14, loss as positive number
      summaryInfo[`${w_capital_loss_carryover} 13 Long-term capital loss carryover for ${year}`] = ws[13];
    }
    pushToDict(form(k_1040sd, true), '6', ws[8]);
    pushToDict(form(k_1040sd, true), '14', ws[13]);
  }

  function buildQualifiedDividendsWorksheet() {
    const ws = worksheet(w_qualified_dividends_and_capital_gains, 25);
    const f1040 = existing(k_1040);
    ws[1] = f1040['15'] || 0;  // except if foreign earned income
    ws[2] = f1040['3_a'] || 0;
    if (scheduleDFiled) {
      ws[3] = Math.max(0, Math.min(existing(k_1040sd)['15'] || 0, existing(k_1040sd)['16'] || 0));
    } else {
      ws[3] = f1040['7_value'] || 0;  // capital gain distributions (line 7 without Schedule D)
    }
    ws[4] = ws[2] + ws[3];
    ws[5] = Math.max(0, ws[1] - ws[4]);
    ws[6] = config.qualified_div_0pct;
    ws[7] = Math.min(ws[1], ws[6]);
    ws[8] = Math.min(ws[5], ws[7]);
    ws[9] = ws[7] - ws[8];  // taxed 0%
    ws[10] = Math.min(ws[1], ws[4]);
    ws[11] = ws[9];
    ws[12] = ws[10] - ws[11];
    ws[13] = config.qualified_div_20pct;
    ws[14] = Math.min(ws[1], ws[13]);
    ws[15] = ws[5] + ws[9];
    ws[16] = Math.max(0, ws[14] - ws[15]);
    ws[17] = Math.min(ws[12], ws[16]);
    ws[18] = ws[17] * 0.15;
    ws[19] = ws[9] + ws[17];
    ws[20] = ws[10] - ws[19];
    ws[21] = ws[20] * 0.20;
    ws[22] = computation(ws[5]);
    ws[23] = ws[18] + ws[21] + ws[22];
    ws[24] = computation(ws[1]);
    ws[25] = Math.min(ws[23], ws[24]);
    summaryInfo[`${w_qualified_dividends_and_capital_gains} 25 Tax on all taxable income`] = ws[25];
    pushToDict(form(k_1040, true), '16', ws[25]);
  }

  // ===================== NY STATE =====================

  function buildFormIT201() {
    const f = form(k_it201);
    const f1040 = existing(k_1040);
    pushToDict(f, '1', f1040['1_z'] || 0);
    pushToDict(f, '2', f1040['2_b'] || 0);
    pushToDict(f, '3', f1040['3_b'] || 0);
    pushToDict(f, '7', f1040['7_value'] || 0);
    pushToDict(f, '9', f1040['4_b'] || 0);  // taxable IRA distributions
    // line 10: taxable pensions and annuities; the line 29 exclusion (age 59 1/2) is not implemented
    pushToDict(f, '10', f1040['5_b'] || 0);
    pushToDict(f, '14', unemployment);
    // line 16: other income = federal Schedule 1 additional income (1040 line 8) not reported on line 14,
    // e.g. taxable HSA
    pushToDict(f, '16', (f1040['8'] || 0) - unemployment);
    pushSum(f, '17', ['1', '2', '3', '7', '9', '10', '14', '16']);
    // line 18: total federal adjustments to income (1040 line 10), e.g. HSA deduction
    pushToDict(f, '18', f1040['10'] || 0);
    pushToDict(f, '19', (f['17'] || 0) - (f['18'] || 0));

    // line 28: interest on U.S. government bonds (subtracted from NY income)
    // TreasuryDirect interest (by institution name) + broker-reported amounts
    if (has1099) {
      const treasuryInterest = entries1099
        .filter(entry => entry['Institution'] === 'Department of the Treasury')
        .reduce((total, entry) => total + (entry['Interest'] || 0), 0);
      const brokerBonds = entries1099.reduce((total, entry) => total + (entry['InterestBondsObligations'] || 0), 0);
      const usGovtInterest = treasuryInterest + brokerBonds;
      pushToDict(f, '28', usGovtInterest);
      if (usGovtInterest > 0) summaryInfo[`${k_it201} 28 US government bond interest`] = usGovtInterest;
    }

    pushSum(f, '24', ['19', '20', '21', '22', '23']);  // additions
    pushSum(f, '32', ['25', '26', '27', '28', '29', '30', '31']);  // subtractions
    pushToDict(f, '33', (f['24'] || 0) - (f['32'] || 0));
    if ('33' in f) summaryInfo[`${k_it201} 33 New York adjusted gross income`] = f['33'];

    const nyStandardDeduction = config.ny_standard_deduction;
    buildFormIT196();
    const itemizedDeductionNY = existing(k_it196)['49'] || 0;
    if (itemizedDeductionNY > nyStandardDeduction) {
      pushToDict(f, '34', itemizedDeductionNY);
    } else {
      pushToDict(f, '34', nyStandardDeduction);
      delete formsState[k_it196];
    }
    if ('34' in f) summaryInfo[`${k_it201} 34 Standard/Itemized deduction`] = f['34'];
    pushToDict(f, '35', (f['33'] || 0) - (f['34'] || 0));
    pushToDict(f, '37', (f['35'] || 0) - (f['36'] || 0));
    if ('37' in f) summaryInfo[`${k_it201} 37 Taxable income`] = f['37'];
    pushSum(f, '38', ['37']);
    const computedTaxNY = computation_ny(f['38'] || 0);
    summaryInfo[`${k_it201} 39 Tax pre-Recapture`] = computedTaxNY;
    const recaptureAmountNY = computation_ny_recapture(f['38'] || 0, f['33'] || 0, exact);
    const computedTaxNYFull = computedTaxNY + recaptureAmountNY;
    summaryInfo[`${k_it201} 39 Tax post-Recapture`] = computedTaxNYFull;
    pushToDict(f, '39', computedTaxNYFull);
    pushSum(f, '43', ['40', '41', '42']);
    pushToDict(f, '44', (f['39'] || 0) - (f['43'] || 0));
    pushSum(f, '46', ['44', '45']);
    if ('46' in f) summaryInfo[`${k_it201} 46 Total New York State taxes`] = f['46'];

    pushSum(f, '47', ['38']);
    pushToDict(f, '47a', computation_nyc(f['47'] || 0));
    pushToDict(f, '49', Math.max(0, (f['47a'] || 0) - (f['48'] || 0)));
    pushSum(f, '52', ['49', '50', '51']);
    pushToDict(f, '54', Math.max(0, (f['52'] || 0) - (f['53'] || 0)));
    pushSum(f, '58', ['54', '54e', '55', '56', '57']);
    if ('58' in f) summaryInfo[`${k_it201} 58 Total New York City and Yonkers taxes / surcharges and MCTMT`] = f['58'];
    if ('59' in f) summaryInfo[`${k_it201} 59 Sales or use tax`] = f['59'];
    if ('60' in f) summaryInfo[`${k_it201} 60 Voluntary contributions`] = f['60'];
    pushSum(f, '61', ['46', '58', '59', '60']);
    if ('61' in f) summaryInfo[`${k_it201} 61 Total New York State, New York City, Yonkers, and sales or use taxes, MCTMT, and voluntary contributions`] = f['61'];
    pushSum(f, '62', ['61']);

    // fixed school tax credit (eligibility based on income = line 19)
    const incomeForSchoolCredit = f['19'] || 0;
    pushToDict(f, '69', incomeForSchoolCredit <= 250_000 ? config.nyc_school_fixed_credit : 0);
    // school tax rate reduction (eligibility on income, calculation on city taxable income)
    const cityTaxableIncome = f['47'] || 0;
    const rateReductionThreshold = config.nyc_school_rate_reduction_threshold;
    let schoolTaxReduction = 0;
    if (incomeForSchoolCredit <= 500_000) {
      schoolTaxReduction = cityTaxableIncome <= rateReductionThreshold
        ? cityTaxableIncome * 0.00171
        : config.nyc_school_rate_reduction_base + (cityTaxableIncome - rateReductionThreshold) * 0.00228;
    }
    pushToDict(f, '69a', schoolTaxReduction);

    pushToDict(f, '72', stateTax);
    pushToDict(f, '73', localTax);

    const estimatedPaymentsNY = (d['EstimatedIncomeTax']?.['State'] || [])
      .reduce((total: number, line: D) => total + line['Amount'], 0);
    pushToDict(f, '75', estimatedPaymentsNY);

    pushSum(f, '76', ['63', '64', '65', '66', '67', '68', '69', '69a', '70', '71', '72', '73', '74', '75']);
    if ('76' in f) summaryInfo[`${k_it201} 76 Total Payments`] = f['76'];

    if ((f['76'] || 0) > (f['62'] || 0)) {
      pushToDict(f, '77', Math.max(0, (f['76'] || 0) - (f['62'] || 0)));
      if ('77' in f) summaryInfo[`${k_it201} 77 overpaid`] = f['77'];
      pushToDict(f, '78', Math.max(0, (f['77'] || 0) - (f['79'] || 0)));
      if ('78' in f) summaryInfo[`${k_it201} 78 Refund`] = f['78'];
      pushToDict(f, '78b', Math.max(0, (f['78'] || 0) - (f['78a'] || 0)));
    } else {
      pushToDict(f, '80', Math.max(0, (f['62'] || 0) - (f['76'] || 0)));
      if ('80' in f) summaryInfo[`${k_it201} 80 owe`] = f['80'];
    }
  }

  function buildFormIT196() {
    const f = form(k_it196);
    f['name'] = returnNames();
    const it201 = existing(k_it201);

    // medical and dental
    pushToDict(f, '2', it201['19'] || 0);
    pushToDict(f, '3', (f['2'] || 0) * 0.10);
    pushToDict(f, '4', Math.max(0, (f['1'] || 0) - (f['3'] || 0)));

    // taxes (NY has no SALT cap)
    pushToDict(f, '5', stateTax + localTax);
    // line 6: real estate taxes (same as federal Sch A line 5c)
    pushToDict(f, '6', otherEntries.reduce((total, line) => total + (line['PropertyTax'] || 0), 0));
    // line 7: personal property taxes (co-op state taxes)
    pushToDict(f, '7', otherEntries.reduce((total, line) => total + (line['CoopStateTaxes'] || 0), 0));
    pushSum(f, '9', ['5', '6', '7', '8']);

    // interest: NY uses pre-TCJA $1M mortgage limit, not federal $750k
    if (w_mortgage_interest_deduction in worksheets) {
      const mortgage = worksheets[w_mortgage_interest_deduction];
      if (mortgage[12] <= config.ny_mortgage_limit) {
        pushToDict(f, '10', mortgage[13]);
      } else {
        pushToDict(f, '10', mortgage[13] * config.ny_mortgage_limit / mortgage[12]);
      }
    }
    pushSum(f, '15', ['10', '11', '12', '14']);

    // gifts (IT-196 lines 16-19): 16 cash, 17 other than cash, 18 carryover
    pushToDict(f, '16_value', charitableGifts.reduce((total, gift) => total + (gift['Amount'] || 0), 0));
    pushSum(f, '19', ['16_value', '17', '18']);

    buildNYLine40Worksheet();
    buildNYLine41Worksheet();
    pushToDict(f, '42', (f['40'] || 0) - (f['41'] || 0));
    pushSum(f, '45', ['42', '43', '44']);

    // 46: itemized deduction adjustment (NYAGI-dependent)
    const nyAGI = it201['33'] || 0;
    buildNYLine46Worksheet();
    // 47: itemized deduction after adjustment
    if (nyAGI <= 100_000) {
      pushToDict(f, '47', f['45']);
    } else if (nyAGI <= 1_000_000) {
      pushToDict(f, '47', f['45'] - (f['46'] || 0));
    } else if (nyAGI <= 10_000_000) {
      pushToDict(f, '47', (f['19'] || 0) * 0.50);
    } else {
      pushToDict(f, '47', (f['19'] || 0) * 0.25);
    }
    pushSum(f, '49', ['47', '48']);
    summaryInfo[`${k_it196} 49 NY State Itemized Deductions`] = f['49'];
  }

  function buildNYLine40Worksheet() {
    const ws = worksheet(w_ny_line40_itemized_deductions, 10);
    const it196 = existing(k_it196);
    const sumOf = (keys: string[]) => keys.reduce((total, key) => total + (it196[key] || 0), 0);
    ws[1] = sumOf(['4', '9', '15', '19', '20', '28', '39']);
    ws[2] = sumOf(['4', '14', '16_value', '20', '29', '30', '37']);
    if (ws[1] <= ws[2]) {
      summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[1];
      pushToDict(it196, '40', ws[1]);
      return;
    }
    ws[3] = ws[1] - ws[2];
    ws[4] = ws[3] * 0.80;
    ws[5] = existing(k_it201)['19'] || 0;  // federal AGI
    ws[6] = config.ny_itemized_deduction_threshold;
    if (ws[6] >= ws[5]) {
      summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[1];
      pushToDict(it196, '40', ws[1]);
      return;
    }
    ws[7] = ws[5] - ws[6];
    ws[8] = ws[7] * 0.03;
    ws[9] = Math.min(ws[4], ws[8]);
    ws[10] = Math.max(0, ws[1] - ws[9]);
    summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[10];
    pushToDict(it196, '40', ws[10]);
  }

  function buildNYLine41Worksheet() {
    const ws = worksheet(w_ny_line41_itemized_deductions_subtractions, 11);
    const federalAGI = existing(k_it201)['19'] || 0;
    const it196 = existing(k_it196);
    // subtraction A: state/local income tax (line 5) + foreign tax (line 8)
    const taxesSubtracted = (it196['5'] || 0) + (it196['8'] || 0);
    if (federalAGI <= config.ny_itemized_deduction_threshold) {
      pushToDict(it196, '41', taxesSubtracted);
      return;
    }
    // no reduction was applied in Line 40 worksheet (line1 <= line2)
    const line40 = worksheets[w_ny_line40_itemized_deductions];
    if (line40[1] <= line40[2]) {
      pushToDict(it196, '41', taxesSubtracted);
      return;
    }
    ws[1] = line40[9];
    ws[2] = line40[3];
    ws[3] = rounded(ws[1] / ws[2], 4);
    ws[4] = taxesSubtracted;
    ws[5] = 0;  // B, C
    ws[6] = ws[4] + ws[5];
    ws[7] = ws[3] * ws[6];
    ws[8] = ws[6] - ws[7];
    ws[9] = 0;  // D, E
    ws[10] = 0;  // long-term care
    ws[11] = ws[8] + ws[9] + ws[10];
    summaryInfo[`${w_ny_line41_itemized_deductions_subtractions} NY Worksheet2 Line 41 - Itemized Deduction Subtractions`] = ws[11];
    pushToDict(it196, '41', ws[11]);
  }

  function buildNYLine46Worksheet() {
    const ws = worksheet(w_ny_line46_itemized_deduction_adjustments, 7);
    const nyAGI = existing(k_it201)['33'] || 0;
    const line45 = existing(k_it196)['45'] || 0;
    // worksheet 3 line 2: $100,000 single, $200,000 MFJ
    const adjustmentStart = config.ny_itemized_adjustment_start;
    if (nyAGI <= adjustmentStart) return;
    if (nyAGI > 1_000_000) return;  // line 47 uses a different formula; no line 46 needed
    let adjustment: number;
    if (nyAGI <= 475_000) {
      // Worksheet 3: phase-in from 0% to 25%
      const fraction = rounded(Math.min(nyAGI - adjustmentStart, 50_000) / 50_000, 4);
      adjustment = fraction * line45 * 0.25;
    } else if (nyAGI <= 525_000) {
      // Worksheet 4: phase-in from 25% to 50%
      const fraction = rounded(Math.min(nyAGI - 475_000, 50_000) / 50_000, 4);
      adjustment = line45 * 0.25 + fraction * line45 * 0.25;
    } else {
      // NYAGI $525k-$1M: flat 50%
      adjustment = line45 * 0.50;
    }
    ws[1] = nyAGI;
    ws[7] = adjustment;
    summaryInfo[`${w_ny_line46_itemized_deduction_adjustments} NY Worksheet3 Line 46 - Itemized Deduction Adjustment`] = adjustment;
    pushToDict(existing(k_it196), '46', adjustment);
  }

  // ===================== MAIN EXECUTION =====================

  buildForm1040();
  buildFormIT201();

  // Foreign tax credit carryforward (Form 1116: tax paid minus credit allowed)
  const foreignTaxCredit = existing(k_1040s3)['1'] || 0;
  const foreignTaxCarryforward = Math.max(0, bankersRound(foreignTax - foreignTaxCredit));

  const carryover = {
    taxable_income: existing(k_1040)['15'] || 0,
    schedule_d_net_short_term: existing(k_1040sd)['7'] || 0,
    schedule_d_net_long_term: existing(k_1040sd)['15'] || 0,
    schedule_d_loss_deduction: existing(k_1040sd)['21'] || 0,
    foreign_tax_credit_carryforward: foreignTaxCarryforward,
  };

  if (config.field_maps) applyFieldMaps(formsState, config.field_maps);

  return { formsState, worksheets, summaryInfo, carryover };
}
