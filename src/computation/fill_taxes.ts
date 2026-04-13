// Faithful port of taxes1040/computation/forms_core_impl.py fill_taxes()
// Single filer, no dependents, resident

import {
  k_1040, k_1040s1, k_1040s2, k_1040s3, k_1040sa, k_1040sb, k_1040sd,
  k_6251, k_6781, k_8889, k_8949, k_8959, k_8960, k_1116,
  k_it201, k_it196,
  w_qualified_dividends_and_capital_gains, w_should_fill_6251,
  w_mortgage_interest_deduction, w_salt_deduction, w_capital_loss_carryover,
  w_ny_line40_itemized_deductions, w_ny_line41_itemized_deductions_subtractions,
  w_ny_line46_itemized_deduction_adjustments,
} from './form_names';
import type { TaxConfig } from './config_2025';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;
type FormsState = Record<string, D | D[]>;
type Worksheets = Record<string, number[]>;
type SummaryInfo = Record<string, number | boolean | string>;

interface PriorYear {
  taxable_income: number;
  schedule_d_net_short_term: number;
  schedule_d_net_long_term: number;
  schedule_d_loss_deduction: number;
}

interface SumTrades {
  SHORT: Record<string, { Proceeds: number; Cost: number; Adjustment: number; Gain: number }>;
  LONG: Record<string, { Proceeds: number; Cost: number; Adjustment: number; Gain: number }>;
}

function getMainInfo(d: D) {
  const w = d['W2'][0];
  const fullName: string = w['FullName'];
  const parts = fullName.split(' ');
  const initial = parts.length > 2 ? parts[1][0] : '';
  return {
    first_name: w['FirstName'],
    initial,
    last_name: w['LastName'],
    ssn: w['SSN'],
    address_street_and_number: w['Address'],
    address_apt: w['Address_apt'],
    address_city: w['Address_city'],
    address_state: w['Address_state'],
    address_zip: w['Address_zip'],
    ...(d['override'] || {}),
  };
}

function applyFieldMaps(formsState: FormsState, fieldMaps: Record<string, Record<string, string | null>>) {
  for (const [formKey, fieldMap] of Object.entries(fieldMaps)) {
    if (!(formKey in formsState)) continue;
    const formData = formsState[formKey];
    const remap = (dd: D): D => {
      const result: D = {};
      for (const [key, value] of Object.entries(dd)) {
        if (key in fieldMap) {
          const newKey = fieldMap[key];
          if (newKey !== null) result[newKey] = value;
        } else {
          result[key] = value;
        }
      }
      return result;
    };
    if (Array.isArray(formData)) {
      formsState[formKey] = formData.map(remap);
    } else {
      formsState[formKey] = remap(formData);
    }
  }
}

export interface FillTaxesResult {
  formsState: FormsState;
  worksheets: Worksheets;
  summaryInfo: SummaryInfo;
  carryover: D;
}

export function fillTaxes(
  d: D,
  config: TaxConfig,
  computation: (amount: number) => number,
  computation_ny: (amount: number) => number,
  computation_ny_recapture: (amount: number, gross: number) => number,
  computation_nyc: (amount: number) => number,
): FillTaxesResult {
  const year = config.year;
  const priorYear: PriorYear | null = d['prior_year'] || null;

  const mainInfo = getMainInfo(d);
  const wages: number = d['W2'].reduce((s: number, w: D) => s + w['Wages'], 0);
  const federalTax: number = d['W2'].reduce((s: number, w: D) => s + w['Federal_tax'], 0);
  // socialSecurityTax not used in computation but kept for reference
  void d['W2'].reduce((s: number, w: D) => s + w['SocialSecurity_tax'], 0);
  const medicareTax: number = d['W2'].reduce((s: number, w: D) => s + w['Medicare_tax'], 0);
  const medicareWages: number = d['W2'].reduce((s: number, w: D) => s + w['Medicare_wages'], 0);
  const stateTax: number = d['W2'].reduce((s: number, w: D) => s + w['State_tax'], 0);
  const localTax: number = d['W2'].reduce((s: number, w: D) => s + w['Local_tax'], 0);

  const has1099 = '1099' in d && d['1099'].length > 0;
  let dividendsQualified: number | null = null;
  const additionalIncome: number | null = null;
  const healthSavingsAccount: boolean = d['health_savings_account'] || false;
  let capitalGains: number | null = null;
  let contract1256 = false;
  let foreignTax = 0;

  const sumTrades: SumTrades = {
    SHORT: {
      A: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
      B: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
      C: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
    },
    LONG: {
      D: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
      E: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
      F: { Proceeds: 0, Cost: 0, Adjustment: 0, Gain: 0 },
    },
  };

  if (has1099) {
    foreignTax = d['1099'].reduce((s: number, i: D) => s + (i['Foreign Tax Paid'] || 0), 0);
  }

  const standardDeduction = config.standard_deduction;
  const qualifiedBusinessDeduction = 0;
  const healthSavingsAccountMaxContribution = config.hsa_max_contribution;

  const formsState: FormsState = {};
  const worksheets: Worksheets = {};
  const summaryInfo: SummaryInfo = {};

  // --- Form helper ---
  function form(key: string, getExisting = false): D {
    if (!getExisting) {
      const dd: D = {};
      formsState[key] = dd;
      return dd;
    }
    return formsState[key] as D;
  }

  function pushToDict(dd: D, key: string, value: number | boolean | string, roundI = 0) {
    if (value !== 0 && value !== false) {
      dd[key] = typeof value === 'number' ? Math.round(value * Math.pow(10, roundI)) / Math.pow(10, roundI) : value;
    }
  }

  function pushNameSsn(dd: D, prefix = '', suffix = '') {
    dd[prefix + 'name' + suffix] = (formsState[k_1040] as D)['self_first_name_initial'] + ' ' + (formsState[k_1040] as D)['self_last_name'];
    dd[prefix + 'ssn' + suffix] = mainInfo.ssn;
  }

  function pushSum(dd: D, key: string, keys: string[]) {
    dd[key] = keys.reduce((s, k) => s + (dd[k] || 0), 0);
  }

  function revertSign(dd: D, key: string) {
    if (key in dd) dd[key] = -dd[key];
  }

  function worksheet(key: string, n: number): number[] {
    const arr = new Array(n + 1).fill(0);
    worksheets[key] = arr;
    return arr;
  }

  // ===================== FORM BUILDERS =====================

  function buildForm1040() {
    const f = form(k_1040);
    let firstNameAndInitial = mainInfo.first_name;
    if (mainInfo.initial !== '') firstNameAndInitial += ' ' + mainInfo.initial;
    Object.assign(f, {
      single: true,
      self_first_name_initial: firstNameAndInitial,
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

      dividendsQualified = d['1099'].reduce((s: number, i: D) => s + (i['Qualified Dividends'] || 0), 0);
      pushToDict(f, '3_a', dividendsQualified!);

      capitalGains = d['1099'].reduce((s: number, i: D) => s + (i['Capital Gain Distributions'] || 0), 0);

      contract1256 = d['1099'].some(
        (i: D) => i['Contract1256'] || (i['Realized1256'] || 0) !== 0 || (i['Unrealized1256'] || 0) !== 0
      );

      if (contract1256) buildForm6781();
      buildForm8949();
      buildForm1040sd();
    }

    f['7_n'] = !d['scheduleD'];

    if (healthSavingsAccount || additionalIncome) {
      buildForm8889();
      buildForm1040s1();
      pushToDict(f, '8', ((formsState[k_1040s1] as D) || {})['10'] || 0);
      pushToDict(f, '10', ((formsState[k_1040s1] as D) || {})['26'] || 0);
      if (((formsState[k_1040s1] as D) || {})['10'] === 0 &&
          ((formsState[k_1040s1] as D) || {})['26'] === 0) {
        delete formsState[k_1040s1];
      }
    }

    pushSum(f, '9', ['1_z', '2_b', '3_b', '4_b', '5_b', '6_b', '7_value', '8']);
    summaryInfo[`${k_1040} 9 Total income`] = f['9'];

    pushToDict(f, '11', f['9'] - (f['10'] || 0));
    summaryInfo[`${k_1040} 11 adjusted gross income`] = f['11'];

    buildForm1040sa();
    const itemizedDeduction = ((formsState[k_1040sa] as D) || {})['17'] || 0;
    if (itemizedDeduction > standardDeduction) {
      pushToDict(f, '12', itemizedDeduction);
    } else {
      pushToDict(f, '12', standardDeduction);
    }
    summaryInfo[`${k_1040} 12 Standard deduction or itemized deductions`] = f['12'];

    pushToDict(f, '13', qualifiedBusinessDeduction);
    pushSum(f, '14', ['12', '13']);
    pushToDict(f, '15', Math.max(0, (f['11'] || 0) - (f['14'] || 0)));
    summaryInfo[`${k_1040} 15 Taxable income`] = f['15'];

    if (dividendsQualified) {
      buildQualifiedDividendsWorksheet();
    } else {
      pushToDict(f, '16', computation(f['15']));
    }
    summaryInfo[`${k_1040} 16 Tax`] = f['16'];

    buildForm1040s2();
    if (((formsState[k_1040s2] as D) || {})['3'] === 0 &&
        ((formsState[k_1040s2] as D) || {})['21'] === 0) {
      delete formsState[k_1040s2];
      if (k_6251 in formsState) delete formsState[k_6251];
    }

    pushSum(f, '18', ['16', '17']);
    pushToDict(f, '19', 0);

    if (foreignTax > 0) buildForm1040s3();
    pushSum(f, '21', ['19', '20']);
    pushToDict(f, '22', Math.max(0, (f['18'] || 0) - (f['21'] || 0)));

    pushSum(f, '24', ['22', '23']);
    summaryInfo[`${k_1040} 24 Total Tax`] = f['24'];

    pushToDict(f, '25_a', federalTax);
    pushToDict(f, '25_b', 0);
    pushSum(f, '25_d', ['25_a', '25_b', '25_c']);

    let estimatedPayments = 0;
    if (d['EstimatedIncomeTax']?.['Federal']) {
      for (const line of d['EstimatedIncomeTax']['Federal']) {
        estimatedPayments += line['Amount'];
      }
    }
    pushToDict(f, '26', estimatedPayments);

    pushToDict(f, '27_a', 0);
    pushToDict(f, '27_b', 0);
    pushToDict(f, '27_c', 0);
    pushToDict(f, '28', 0);
    pushToDict(f, '29', 0);
    pushToDict(f, '30', 0);
    pushToDict(f, '31', 0);
    pushSum(f, '32', ['27_a', '27_b', '27_c', '28', '29', '30', '31']);

    pushSum(f, '33', ['25_d', '26', '32']);
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
      summaryInfo[`${k_1040} 37 amount you owe`] = f['37'];
    }

    pushToDict(f, 'other_designee_n', true);
  }

  function buildForm1040s1() {
    const f = form(k_1040s1);
    pushNameSsn(f);
    if (k_8889 in formsState) {
      const hsa = formsState[k_8889] as D;
      const hsaDeduction = hsa['13'] || 0;
      if (hsaDeduction > 0) pushToDict(f, '13', hsaDeduction);
      const hsaTaxableDistribution = hsa['16'] || 0;
      if (hsaTaxableDistribution > 0) pushToDict(f, '8_e', hsaTaxableDistribution);
      if ((hsa['13'] || 0) === 0 && (hsa['16'] || 0) === 0) {
        delete formsState[k_8889];
      }
    }
    pushToDict(f, '9',
      -(f['8_a'] || 0) + (f['8_b'] || 0) + (f['8_c'] || 0)
      - (f['8_d'] || 0) + (f['8_e'] || 0) + (f['8_f'] || 0)
      + (f['8_g'] || 0) + (f['8_h'] || 0) + (f['8_i'] || 0)
      + (f['8_j'] || 0) + (f['8_k'] || 0) + (f['8_l'] || 0)
      + (f['8_m'] || 0) + (f['8_n'] || 0) + (f['8_o'] || 0)
      + (f['8_p'] || 0) + (f['8_q'] || 0) + (f['8_r'] || 0)
      - (f['8_s'] || 0) + (f['8_t'] || 0) + (f['8_u'] || 0)
      + (f['8_v'] || 0) + (f['8_z'] || 0)
    );
    pushSum(f, '10', ['1', '2_a', '3', '4', '5', '6', '7', '9']);
    pushSum(f, '25', ['24_a', '24_b', '24_c', '24_d', '24_e', '24_f', '24_g', '24_h', '24_i', '24_j', '24_k', '24_z']);
    pushSum(f, '26', ['11', '12', '13', '14', '15', '16', '17', '18', '19_a', '20', '21', '23', '25']);
  }

  function buildForm1040s2() {
    const f = form(k_1040s2);
    pushNameSsn(f);

    // Part I
    const shouldFill = buildShouldFill6251Worksheet();
    if (shouldFill) buildForm6251();
    pushSum(f, '3', ['1', '2']);
    pushToDict(form(k_1040, true), '17', f['3']);

    // Part II
    pushSum(f, '7', ['5', '6']);
    buildForm8959();
    const f8959 = formsState[k_8959] as D;
    if (f8959['18'] === 0 && f8959['24'] === 0) delete formsState[k_8959];

    buildForm8960();
    if (((formsState[k_8960] as D) || {})['17'] === 0) {
      if (k_8960 in formsState) delete formsState[k_8960];
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
    pushToDict(f, 'custom_missing_c', true);

    let foreignSourceDividends = 0;
    let foreignSourceInterest = 0;
    let foreignCountry: string | null = null;
    for (const entry of d['1099']) {
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

    const grossIncome = (formsState[k_1040] as D)['9'];
    const apportionmentRatio = grossIncome > 0 ? Math.round(foreignSourceIncome / grossIncome * 10000) / 10000 : 0;

    const deduction = (formsState[k_1040] as D)['12'];
    const line3a = grossIncome > 5000 ? Math.round(deduction * apportionmentRatio * 100) / 100 : deduction;
    pushToDict(f, '2_a', line3a);
    pushToDict(f, 'i_1a_a', foreignSourceIncome);
    pushToDict(f, '7_total', foreignSourceIncome - line3a);

    pushToDict(f, 'j', true);
    if (foreignCountry) f['a_l'] = foreignCountry;
    pushToDict(f, 'a_t', foreignTax);
    pushToDict(f, '8', foreignTax);
    pushToDict(f, '9', foreignTax);
    pushToDict(f, '11', foreignTax);
    pushToDict(f, '13', 0);
    pushToDict(f, '14', foreignTax);
    pushToDict(f, '15', foreignSourceIncome - line3a);
    pushToDict(f, '17', Math.max(0, f['15']));

    const taxableIncome = (formsState[k_1040] as D)['15'];
    pushToDict(f, '18', taxableIncome);

    let limitationFraction = 0;
    if (taxableIncome > 0) {
      limitationFraction = Math.round(f['17'] / taxableIncome * 10000) / 10000;
      limitationFraction = Math.min(limitationFraction, 1.0);
    }
    pushToDict(f, '19', limitationFraction, 4);

    const usTax = (formsState[k_1040] as D)['16'];
    pushToDict(f, '20', usTax);
    const maxCredit = Math.round(limitationFraction * usTax);
    pushToDict(f, '21', maxCredit);
    pushToDict(f, '23', maxCredit);

    const credit = Math.min(f['14'], f['23']);
    pushToDict(f, '24', credit);
    pushToDict(f, '25', credit);
    pushToDict(f, '32', credit);
    pushToDict(f, '33', Math.min(usTax, credit));
    pushToDict(f, '35', 0);

    summaryInfo[`${k_1116} 17 Foreign source taxable income`] = f['17'];
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
    const credit = buildForm1116();
    pushToDict(f, '1', credit);
    pushSum(f, '8', ['1', '2', '3', '4', '5', '7']);
    pushToDict(form(k_1040, true), '20', f['8'] || 0);
  }

  function buildForm1040sa() {
    const f = form(k_1040sa);
    pushNameSsn(f);

    pushToDict(f, '1', d['medical_expenses'] || 0);
    pushToDict(f, '2', (formsState[k_1040] as D)['11']);
    pushToDict(f, '3', f['2'] * 0.075);
    pushToDict(f, '4', Math.max(0, (f['1'] || 0) - f['3']));

    if (d['deduct_sales_tax']) {
      pushToDict(f, '5_a_y', true);
      pushToDict(f, '5_a', d['deduct_sales_tax_amount'] || 0);
    } else {
      pushToDict(f, '5_a', stateTax + localTax);
    }

    let propertyTax = 0;
    if ('Other' in d) {
      for (const line of d['Other']) {
        propertyTax += line['PropertyTax'] || 0;
      }
    }
    pushToDict(f, '5_c', propertyTax);
    pushSum(f, '5_d', ['5_a', '5_b', '5_c']);

    // SALT worksheet
    buildSALTWorksheet(f['5_d'] || 0);
    pushToDict(f, '5_e', worksheets[w_salt_deduction]?.[10] ?? (f['5_d'] || 0));
    pushSum(f, '7', ['5_e', '6']);

    // Mortgage interest
    buildMortgageInterestWorksheet();
    pushSum(f, '8_e', ['8_a', '8_b', '8_c']);
    pushSum(f, '10', ['8_e', '9']);

    // Charity
    const charitableCash: number = (d['Charitable'] || []).reduce((s: number, c: D) => s + (c['Amount'] || 0), 0);
    pushToDict(f, '11', charitableCash);
    pushSum(f, '14', ['11', '12', '13']);

    pushSum(f, '17', ['4', '7', '10', '14', '15', '16']);
  }

  function buildForm1040sb() {
    const f = form(k_1040sb);
    pushNameSsn(f);

    function fillValue(index: string, key: string) {
      let i = 1;
      for (const entry of d['1099']) {
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

    pushSum(f, '2_value', Array.from({ length: 14 }, (_, i) => `1_${i + 1}_value`));
    pushToDict(f, '4_value', (f['2_value'] || 0) - (f['3_value'] || 0));
    pushSum(f, '6_value', Array.from({ length: 16 }, (_, i) => `5_${i + 1}_value`));

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
      pushToDict(f, `${numberIndex}_proceeds`, sumTrades[lsKey][boxIndex]['Proceeds']);
      pushToDict(f, `${numberIndex}_cost`, sumTrades[lsKey][boxIndex]['Cost']);
      if (!numberIndex.includes('a') && !numberIndex.includes('b')) {
        pushToDict(f, `${numberIndex}_adjustments`, sumTrades[lsKey][boxIndex]['Adjustment']);
      }
      pushToDict(f, `${numberIndex}_gain`, sumTrades[lsKey][boxIndex]['Gain']);
    }
    fillGains('SHORT', 'A', '1a');
    fillGains('SHORT', 'B', '2');
    fillGains('SHORT', 'C', '3');
    fillGains('LONG', 'D', '8a');
    fillGains('LONG', 'E', '9');
    fillGains('LONG', 'F', '10');

    if (contract1256 && k_6781 in formsState) {
      const f6781 = formsState[k_6781] as D;
      if ('8' in f6781) pushToDict(f, '4', f6781['8']);
      if ('9' in f6781) pushToDict(f, '11', f6781['9']);
    }

    buildCapitalLossCarryoverWorksheet();

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
        const form4952 = false;
        if ((f['18'] || 0) === 0 && (f['19'] || 0) === 0 && !form4952) {
          f['20_y'] = true;
        } else {
          f['20_n'] = true;
        }
        return;
      } else {
        f['17_n'] = true;
      }
    } else if (f['16'] < 0) {
      const capitalLossLimit = d['single'] ? 3000 : 1500;
      pushToDict(f, '21', -Math.min(capitalLossLimit, -f['16']));
      pushToDict(form(k_1040, true), '7_value', f['21']);
      revertSign(f, '21');
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

    pushToDict(f, '1_value', (formsState[k_1040] as D)['15']);
    if ((formsState[k_1040] as D)['12'] === ((formsState[k_1040sa] as D) || {})['17']) {
      pushToDict(f, '2a_value', ((formsState[k_1040sa] as D) || {})['7']);
    }

    pushSum(f, '4_value', [
      '1_value',
      ...('abcdefghijklmnopqrst'.split('').map(c => `2${c}_value`)),
      '3_value',
    ]);
    if ('4_value' in f) summaryInfo[`${k_6251} 4 Alternative minimum taxable income`] = f['4_value'];

    const amti = f['4_value'] || 0;
    let exemption = config.amt_exemption;
    const phaseoutStart = config.should_fill_6251_phaseout;
    if (amti > phaseoutStart) {
      exemption = Math.max(0, exemption - 0.25 * (amti - phaseoutStart));
    }
    pushToDict(f, '5_value', exemption);
    pushToDict(f, '6_value', Math.max(0, amti - (f['5_value'] || 0)));

    if ((f['6_value'] || 0) > 0) {
      const amtTaxable = f['6_value'];

      function amt2628(amount: number): number {
        if (amount <= config.amt_28pct_threshold) return amount * 0.26;
        return amount * 0.28 - config.amt_28pct_excess;
      }

      const usePartIII =
        (dividendsQualified !== null && dividendsQualified > 0) ||
        (d['scheduleD'] && k_1040sd in formsState &&
          ((formsState[k_1040sd] as D)['15'] || 0) > 0 &&
          ((formsState[k_1040sd] as D)['16'] || 0) > 0);

      if (usePartIII) {
        const qdiv = (formsState[k_1040] as D)['3_a'] || 0;
        let sdGain: number;
        if (d['scheduleD'] && k_1040sd in formsState) {
          const sd15 = (formsState[k_1040sd] as D)['15'] || 0;
          const sd16 = (formsState[k_1040sd] as D)['16'] || 0;
          sdGain = (sd15 > 0 && sd16 > 0) ? Math.max(0, Math.min(sd15, sd16)) : 0;
        } else {
          sdGain = Math.max(0, (formsState[k_1040] as D)['7_value'] || 0);
        }
        const capGains = qdiv + sdGain;
        const ordinary = Math.max(0, amtTaxable - capGains);
        const zeroCeil = config.qualified_div_0pct;
        const l18 = Math.min(amtTaxable, zeroCeil);
        const at0 = l18 - Math.min(ordinary, l18);
        const l21 = Math.min(amtTaxable, capGains);
        const l25 = Math.min(amtTaxable, config.qualified_div_20pct);
        const l27 = Math.max(0, l25 - (ordinary + at0));
        const at15 = Math.min(l21 - at0, l27);
        const at20 = l21 - at0 - at15;
        const preferential = at15 * 0.15 + at20 * 0.20 + amt2628(ordinary);
        pushToDict(f, '7_value', Math.min(preferential, amt2628(amtTaxable)));
      } else {
        pushToDict(f, '7_value', amt2628(amtTaxable));
      }
      pushToDict(f, '8_value', 0);
      pushToDict(f, '9_value', (f['7_value'] || 0) - (f['8_value'] || 0));
      pushToDict(f, '10_value',
        Math.max(0, (formsState[k_1040] as D)['16'] + ((formsState[k_1040s2] as D) || {})['2'] || 0));
    } else {
      pushToDict(f, '7_value', 0);
      pushToDict(f, '9_value', 0);
      pushToDict(f, '11_value', 0);
    }

    pushToDict(f, '11_value', Math.max(0, (f['9_value'] || 0) - (f['10_value'] || 0)));
    if ('11_value' in f) {
      summaryInfo[`${k_6251} 11 AMT`] = f['11_value'];
      pushToDict(form(k_1040s2, true), '1', f['11_value']);
    }
  }

  function buildForm6781() {
    const f = form(k_6781);
    function* yieldContracts() {
      for (const u of d['1099']) {
        if ('Institution' in u) {
          const institution = u['Institution'];
          if ('Contract1256' in u && Array.isArray(u['Contract1256'])) {
            for (const item of u['Contract1256']) {
              yield { ...item, Institution: institution };
            }
          }
          if ((u['Realized1256'] || 0) !== 0 || (u['Unrealized1256'] || 0) !== 0) {
            const pnl = (u['Realized1256'] || 0) + (u['Unrealized1256'] || 0);
            yield { ProfitOrLoss: pnl, Institution: institution };
          }
        }
      }
    }
    let i = 1;
    for (const item of yieldContracts()) {
      if (i > 3) throw new Error('Form6781 more than 3 contracts need a new page');
      f[`1_${i}_a`] = `Form 1099-B ${item.Institution}`;
      if (item.ProfitOrLoss < 0) {
        pushToDict(f, `1_${i}_b`, -item.ProfitOrLoss);
      } else {
        pushToDict(f, `1_${i}_c`, item.ProfitOrLoss);
      }
      i++;
    }
    pushNameSsn(f);
    pushSum(f, '2_b', ['1_1_b', '1_2_b', '1_3_b']);
    pushSum(f, '2_c', ['1_1_c', '1_2_c', '1_3_c']);
    pushToDict(f, '3', (f['2_c'] || 0) - (f['2_b'] || 0));
    pushSum(f, '5', ['3', '4']);
    pushSum(f, '7', ['5', '6']);
    pushToDict(f, '8', Math.round((f['7'] || 0) * 0.4));
    pushToDict(f, '9', Math.round((f['7'] || 0) * 0.6));
  }

  function buildForm8889() {
    const f = form(k_8889);
    pushNameSsn(f);
    f['1_self'] = true;
    pushToDict(f, '2', d['health_savings_account_contributions'] || 0);
    pushToDict(f, '3', healthSavingsAccountMaxContribution);
    pushToDict(f, '4', 0);
    pushToDict(f, '5', (f['3'] || 0) - (f['4'] || 0));
    pushToDict(f, '6', f['5'] || 0);
    pushToDict(f, '7', 0);
    pushSum(f, '8', ['6', '7']);
    pushToDict(f, '9', d['health_savings_account_employer_contributions'] || 0);
    pushToDict(f, '10', 0);
    pushSum(f, '11', ['9', '10']);
    pushToDict(f, '12', Math.max(0, (f['8'] || 0) - (f['11'] || 0)));
    pushToDict(f, '13', Math.min(f['2'] || 0, f['12'] || 0));
    pushToDict(f, '14_a', d['health_savings_account_distributions'] || 0);
    pushToDict(f, '14_b', 0);
    pushToDict(f, '14_c', (f['14_a'] || 0) - (f['14_b'] || 0));
    pushToDict(f, '15', f['14_c'] || 0);
    pushToDict(f, '16', (f['14_c'] || 0) - (f['15'] || 0));
  }

  function buildForm8949() {
    form(k_8949);

    function* yieldTrades(longShort: string, formCode: string) {
      for (const uu of d['1099']) {
        if ('Trades' in uu) {
          for (const tt of uu['Trades']) {
            if (tt['LongShort'].includes(longShort) && formCode === tt['FormCode']) {
              yield tt;
            }
          }
        }
      }
    }

    const tradesSubsets: [string, { SHORT: D[]; LONG: D[] }][] = [];
    const tradesPerPageLimit = config.trades_per_page_limit;

    for (const code of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const shortGen = yieldTrades('SHORT', code);
      const longGen = yieldTrades('LONG', code);
      while (true) {
        const shortTrades: D[] = [];
        const longTrades: D[] = [];
        for (let j = 0; j < tradesPerPageLimit; j++) {
          const n = shortGen.next();
          if (n.done) break;
          shortTrades.push(n.value);
        }
        for (let j = 0; j < tradesPerPageLimit; j++) {
          const n = longGen.next();
          if (n.done) break;
          longTrades.push(n.value);
        }
        if (shortTrades.length === 0 && longTrades.length === 0) break;
        tradesSubsets.push([code, { SHORT: shortTrades, LONG: longTrades }]);
      }
    }

    function buildOne(codeTrades: [string, { SHORT: D[]; LONG: D[] }]): D | null {
      const [code, trades] = codeTrades;
      const page: D = {};
      pushNameSsn(page, 'I_');
      pushNameSsn(page, 'II_');

      function fillTrades(lsKey: 'SHORT' | 'LONG', checkKey: string, index: string) {
        if (trades[lsKey].length > 0) {
          page[checkKey] = true;
          let sProceeds = 0, sCost = 0, sAdj = 0, sGain = 0;
          for (let i = 0; i < trades[lsKey].length; i++) {
            const t = trades[lsKey][i];
            const idx = i + 1;
            page[`${index}_1_${idx}_description`] = `${t['Shares']} ${t['SalesDescription']}`;
            page[`${index}_1_${idx}_date_acq`] = t['DateAcquired'];
            page[`${index}_1_${idx}_date_sold`] = t['DateSold'];
            const proceeds = t['Proceeds'];
            pushToDict(page, `${index}_1_${idx}_proceeds`, proceeds);
            const cost = t['Cost'];
            pushToDict(page, `${index}_1_${idx}_cost`, cost);
            let adj = 0;
            if ('WashSaleValue' in t) {
              adj = t['WashSaleValue'];
              pushToDict(page, `${index}_1_${idx}_adjustment`, adj);
              page[`${index}_1_${idx}_code`] = t['WashSaleCode'];
            }
            const gain = Math.round(proceeds) - Math.round(cost) + Math.round(adj);
            pushToDict(page, `${index}_1_${idx}_gain`, gain);
            sProceeds += Math.round(proceeds);
            sCost += Math.round(cost);
            sAdj += Math.round(adj);
            sGain += Math.round(gain);
          }
          pushToDict(page, `${index}_2_proceeds`, sProceeds);
          pushToDict(page, `${index}_2_cost`, sCost);
          pushToDict(page, `${index}_2_adjustment`, sAdj);
          pushToDict(page, `${index}_2_gain`, sGain);

          sumTrades[lsKey][code]['Proceeds'] += Math.round(sProceeds);
          sumTrades[lsKey][code]['Cost'] += Math.round(sCost);
          sumTrades[lsKey][code]['Adjustment'] += Math.round(sAdj);
          sumTrades[lsKey][code]['Gain'] += Math.round(sGain);
        }
      }

      fillTrades('SHORT', `short_${code.toLowerCase()}`, 'I');
      fillTrades('LONG', `long_${code.toLowerCase()}`, 'II');
      return !(['A', 'D'].includes(code)) ? { ...page } : null;
    }

    if (tradesSubsets.length === 0) {
      delete formsState[k_8949];
    } else if (tradesSubsets.length === 1) {
      const result = buildOne(tradesSubsets[0]);
      if (result === null) {
        delete formsState[k_8949];
      } else {
        formsState[k_8949] = result;
      }
    } else {
      const pages = tradesSubsets.map(buildOne).filter((p): p is D => p !== null);
      if (pages.length === 0) {
        delete formsState[k_8949];
      } else {
        formsState[k_8949] = pages;
      }
    }
  }

  function buildForm8959() {
    const f = form(k_8959);
    pushNameSsn(f);

    pushToDict(f, '1', medicareWages);
    pushSum(f, '4', ['1', '2', '3']);
    pushToDict(f, '5', 200_000);
    pushToDict(f, '6', Math.max(0, f['4'] - f['5']));
    pushToDict(f, '7', (f['6'] || 0) * 0.009);
    if ('7' in f) summaryInfo[`${k_8959} 7 Additional Medicare Tax on Medicare wages`] = f['7'];

    pushToDict(f, '9', 200_000);
    pushSum(f, '10', ['4']);
    pushToDict(f, '11', Math.max(0, f['9'] - f['10']));
    pushToDict(f, '12', Math.max(0, (f['8'] || 0) - (f['11'] || 0)));
    pushToDict(f, '13', (f['12'] || 0) * 0.009);
    if ('13' in f) summaryInfo[`${k_8959} 13 Additional Medicare Tax on self-employment income`] = f['13'];

    pushSum(f, '18', ['7', '13', '17']);
    summaryInfo[`${k_8959} 18 Total Additional Medicare Tax`] = f['18'];
    pushToDict(form(k_1040s2, true), '11', f['18']);

    pushToDict(f, '19', medicareTax);
    pushSum(f, '20', ['1']);
    pushToDict(f, '21', f['20'] * 0.0145);
    if ('21' in f) summaryInfo[`${k_8959} 21 Regular Medicare Tax withholding on Medicare wages`] = f['21'];
    pushToDict(f, '22', Math.max(0, f['19'] - f['21']));
    if ('22' in f) summaryInfo[`${k_8959} Additional Medicare Tax withholding on Medicare wages`] = f['22'];

    pushSum(f, '24', ['22', '23']);
    if ('24' in f) summaryInfo[`${k_8959} 24 Total Additional Medicare Tax withholding`] = f['24'];
    pushToDict(form(k_1040, true), '25_c', f['24']);
  }

  function buildForm8960() {
    const f = form(k_8960);
    pushNameSsn(f);

    pushToDict(f, '1', (formsState[k_1040] as D)['2_b'] || 0);
    pushToDict(f, '2', (formsState[k_1040] as D)['3_b'] || 0);
    pushToDict(f, '4_a', 0);
    pushToDict(f, '4_b', 0);
    pushSum(f, '4_c', ['4_a', '4_b']);
    pushToDict(f, '5_a', (formsState[k_1040] as D)['7_value'] || 0);
    pushSum(f, '5_d', ['5_a', '5_b', '5_c']);
    pushSum(f, '8', ['1', '2', '3', '4_c', '5_d', '6', '7']);
    pushSum(f, '9_d', ['9_a', '9_b', '9_c']);
    pushToDict(f, '11', Math.max(0, (f['8'] || 0) - (f['9_d'] || 0) - (f['10'] || 0)));
    summaryInfo[`${k_8960} 8 Net investment income`] = f['8'] || 0;

    pushToDict(f, '12', f['11'] || 0);
    pushToDict(f, '13', (formsState[k_1040] as D)['11'] || 0);
    pushToDict(f, '14', config.niit_threshold);
    pushToDict(f, '15', Math.max(0, (f['13'] || 0) - (f['14'] || 0)));
    pushToDict(f, '16', Math.min(f['12'] || 0, f['15'] || 0));
    const niit = Math.round((f['16'] || 0) * 0.038);
    pushToDict(f, '17', niit);
    summaryInfo[`${k_8960} 17 Net Investment Income Tax`] = niit;
    pushToDict(form(k_1040s2, true), '12', niit);
  }

  // ===================== WORKSHEETS =====================

  function buildSALTWorksheet(saltTotal: number) {
    const ws = worksheet(w_salt_deduction, 10);
    if (saltTotal <= config.salt_floor) {
      ws[10] = saltTotal;
      summaryInfo[`${w_salt_deduction} 10 SALT deduction`] = saltTotal;
      return;
    }
    ws[1] = config.salt_limit;
    ws[2] = (formsState[k_1040] as D)['11'];
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
  }

  function buildMortgageInterestWorksheet() {
    const ws = worksheet(w_mortgage_interest_deduction, 16);
    let interestPaid = 0;
    let balanceStart = 0;
    let principalPayments = 0;
    if ('1098' in d) {
      for (const item of d['1098']) {
        balanceStart += item['PrincipalBalance'] || 0;
        for (const payment of item['Payments'] || []) {
          interestPaid += payment['InterestAmount'] || 0;
          principalPayments += payment['PrincipalAmount'] || 0;
        }
      }
    }
    ws[1] = 0;
    ws[2] = 0;
    ws[3] = 1_000_000;
    ws[4] = Math.max(ws[1], ws[3]);
    ws[5] = ws[1] + ws[2];
    ws[6] = Math.min(ws[4], ws[5]);
    ws[7] = balanceStart - 0.5 * principalPayments;
    ws[8] = config.mortgage_limit;
    ws[9] = Math.max(ws[6], ws[8]);
    ws[10] = ws[6] + ws[7];
    ws[11] = Math.min(ws[9], ws[10]);
    summaryInfo[`${w_mortgage_interest_deduction} 11 Qualified loan limit for ${year}`] = ws[11];

    ws[12] = ws[1] + ws[2] + ws[7];
    ws[13] = interestPaid;
    if (ws[11] >= ws[12]) {
      pushToDict(form(k_1040sa, true), '8_a', ws[13]);
      summaryInfo[`${w_mortgage_interest_deduction} 13 All Interest Deductible for ${year}`] = ws[13];
      return;
    }
    ws[14] = Math.round(ws[11] / ws[12] * 1000) / 1000;
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
    ws[2] = Math.max(0, priorYear.schedule_d_loss_deduction);
    ws[3] = Math.max(0, ws[1] + ws[2]);
    ws[4] = Math.min(ws[2], ws[3]);
    if (priorYear.schedule_d_net_short_term < 0) {
      ws[5] = Math.max(0, -priorYear.schedule_d_net_short_term);
      ws[6] = Math.max(0, priorYear.schedule_d_net_long_term);
      ws[7] = ws[4] + ws[6];
      ws[8] = Math.max(0, ws[5] - ws[7]);
      summaryInfo[`${w_capital_loss_carryover} 8 Short-term capital loss carryover for ${year}`] = ws[8];
    }
    if (priorYear.schedule_d_net_long_term < 0) {
      ws[9] = Math.max(0, -priorYear.schedule_d_net_long_term);
      ws[10] = Math.max(0, priorYear.schedule_d_net_short_term);
      ws[11] = Math.max(0, ws[4] - ws[5]);
      ws[12] = ws[10] + ws[11];
      ws[13] = Math.max(0, ws[9] - ws[12]);
      summaryInfo[`${w_capital_loss_carryover} 13 Long-term capital loss carryover for ${year}`] = ws[13];
    }
    pushToDict(form(k_1040sd, true), '6', ws[8]);
    pushToDict(form(k_1040sd, true), '14', ws[13]);
  }

  function buildQualifiedDividendsWorksheet() {
    const ws = worksheet(w_qualified_dividends_and_capital_gains, 25);
    ws[1] = (formsState[k_1040] as D)['15'];
    ws[2] = (formsState[k_1040] as D)['3_a'];
    if (d['scheduleD']) {
      ws[3] = Math.max(0, Math.min((formsState[k_1040sd] as D)['15'], (formsState[k_1040sd] as D)['16']));
    } else {
      ws[3] = (formsState[k_1040] as D)['7_value'] || 0;
    }
    ws[4] = ws[2] + ws[3];
    ws[5] = Math.max(0, ws[1] - ws[4]);
    ws[6] = config.qualified_div_0pct;
    ws[7] = Math.min(ws[1], ws[6]);
    ws[8] = Math.min(ws[5], ws[7]);
    ws[9] = ws[7] - ws[8];
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

  function buildShouldFill6251Worksheet(): boolean {
    const ws = worksheet(w_should_fill_6251, 13);
    const itemized = (formsState[k_1040] as D)['12'] === ((formsState[k_1040sa] as D) || {})['17'];
    if (itemized) {
      ws[1] = (formsState[k_1040] as D)['15'];
      ws[2] = ((formsState[k_1040sa] as D) || {})['7'];
      ws[3] = ws[1] + ws[2];
    } else {
      ws[3] = (formsState[k_1040] as D)['11'];
    }
    ws[4] = k_1040s1 in formsState
      ? ((formsState[k_1040s1] as D)['1'] || 0) + ((formsState[k_1040s1] as D)['8_z'] || 0)
      : 0;
    ws[5] = ws[3] - ws[4];
    ws[6] = config.should_fill_6251_exemption;
    if (ws[5] <= ws[6]) {
      summaryInfo[`${w_should_fill_6251} Should fill 6251`] = false;
      return false;
    }
    ws[7] = ws[5] - ws[6];
    ws[8] = config.should_fill_6251_phaseout;
    if (ws[5] <= ws[8]) {
      ws[9] = 0;
      ws[11] = ws[7];
    } else {
      ws[9] = ws[5] - ws[8];
      ws[10] = Math.min(ws[9] * 0.25, ws[6]);
      ws[11] = ws[7] + ws[10];
    }
    if (ws[11] >= config.should_fill_6251_28pct) {
      summaryInfo[`${w_should_fill_6251} Should fill 6251`] = true;
      return true;
    }
    ws[12] = ws[11] * 0.26;
    ws[13] = (formsState[k_1040] as D)['16'] + ((formsState[k_1040s2] as D) || {})['2'] || 0;
    const result = ws[13] < ws[12];
    summaryInfo[`${w_should_fill_6251} Should fill 6251`] = result;
    return result;
  }

  // ===================== NY STATE =====================

  function buildFormIT201() {
    const f = form(k_it201);
    pushToDict(f, '1', (formsState[k_1040] as D)['1_z'] || 0);
    pushToDict(f, '2', (formsState[k_1040] as D)['2_b'] || 0);
    pushToDict(f, '3', (formsState[k_1040] as D)['3_b'] || 0);
    pushToDict(f, '7', (formsState[k_1040] as D)['7_value'] || 0);
    pushSum(f, '17', ['1', '2', '3', '7']);
    pushToDict(f, '19', (f['17'] || 0) - (f['18'] || 0));

    if (has1099) {
      const treasuryInterest = d['1099']
        .filter((i: D) => i['Institution'] === 'Department of the Treasury')
        .reduce((s: number, i: D) => s + (i['Interest'] || 0), 0);
      const brokerBonds = d['1099'].reduce((s: number, i: D) => s + (i['InterestBondsObligations'] || 0), 0);
      const usGovtInterest = treasuryInterest + brokerBonds;
      pushToDict(f, '28', usGovtInterest);
      if (usGovtInterest > 0) summaryInfo[`${k_it201} 28 US government bond interest`] = usGovtInterest;
    }

    pushSum(f, '24', ['19', '20', '21', '22', '23']);
    pushSum(f, '32', ['25', '26', '27', '28', '29', '30', '31']);
    pushToDict(f, '33', (f['24'] || 0) - (f['32'] || 0));
    if ('33' in f) summaryInfo[`${k_it201} 33 New York adjusted gross income`] = f['33'];

    const nyStandardDeduction = config.ny_standard_deduction;
    buildFormIT196();
    const itemizedDeductionNY = ((formsState[k_it196] as D) || {})['49'] || 0;
    if (itemizedDeductionNY > nyStandardDeduction) {
      pushToDict(f, '34', itemizedDeductionNY);
    } else {
      pushToDict(f, '34', nyStandardDeduction);
    }
    if ('34' in f) summaryInfo[`${k_it201} 34 Standard/Itemized deduction`] = f['34'];
    pushToDict(f, '35', (f['33'] || 0) - (f['34'] || 0));
    pushToDict(f, '37', (f['35'] || 0) - (f['36'] || 0));
    if ('37' in f) summaryInfo[`${k_it201} 37 Taxable income`] = f['37'];
    pushSum(f, '38', ['37']);
    const computedTaxNY = computation_ny(f['38'] || 0);
    summaryInfo[`${k_it201} 39 Tax pre-Recapture`] = computedTaxNY;
    const recaptureAmountNY = computation_ny_recapture(f['38'], f['33']);
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
    pushSum(f, '61', ['46', '58', '59', '60']);
    if ('61' in f) summaryInfo[`${k_it201} 61 Total New York State, New York City, Yonkers, and sales or use taxes, MCTMT, and voluntary contributions`] = f['61'];
    pushSum(f, '62', ['61']);

    const incomeForSchoolCredit = f['19'];
    const fixedSchoolTax = incomeForSchoolCredit <= 250_000 ? 63 : 0;
    pushToDict(f, '69', fixedSchoolTax);
    const cityTaxableIncome = f['47'] || 0;
    let schoolTaxReduction = 0;
    if (incomeForSchoolCredit <= 500_000) {
      schoolTaxReduction = cityTaxableIncome <= 12_000
        ? cityTaxableIncome * 0.00171
        : 21 + (cityTaxableIncome - 12_000) * 0.00228;
    }
    pushToDict(f, '69a', schoolTaxReduction);

    pushToDict(f, '72', stateTax);
    pushToDict(f, '73', localTax);

    let estimatedPaymentsNY = 0;
    if (d['EstimatedIncomeTax']?.['State']) {
      for (const line of d['EstimatedIncomeTax']['State']) {
        estimatedPaymentsNY += line['Amount'];
      }
    }
    pushToDict(f, '75', estimatedPaymentsNY);

    pushSum(f, '76', [
      '63', '64', '65', '66', '67', '68', '69', '69a',
      '70', '71', '72', '73', '74', '75',
    ]);
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
    f['name'] = (formsState[k_1040] as D)['self_first_name_initial'] + ' ' + (formsState[k_1040] as D)['self_last_name'];

    pushToDict(f, '2', (formsState[k_it201] as D)['19']);
    pushToDict(f, '3', f['2'] * 0.10);
    pushToDict(f, '4', Math.max(0, (f['1'] || 0) - f['3']));

    pushToDict(f, '5', stateTax + localTax);
    pushToDict(f, '6', ((formsState[k_1040sa] as D) || {})['5_c'] || 0);
    let propertyTaxState = 0;
    if ('Other' in d) {
      for (const line of d['Other']) {
        propertyTaxState += line['CoopStateTaxes'] || 0;
      }
    }
    pushToDict(f, '7', propertyTaxState);
    pushSum(f, '9', ['5', '6', '7', '8']);

    if (w_mortgage_interest_deduction in worksheets) {
      const mortWs = worksheets[w_mortgage_interest_deduction];
      if (mortWs[12] <= config.ny_mortgage_limit) {
        pushToDict(f, '10', mortWs[13]);
      } else {
        pushToDict(f, '10', mortWs[13] * config.ny_mortgage_limit / mortWs[12]);
      }
    }
    pushSum(f, '15', ['10', '11', '12', '14']);

    const charitableCash: number = (d['Charitable'] || []).reduce((s: number, c: D) => s + (c['Amount'] || 0), 0);
    pushToDict(f, '16_value', charitableCash);
    pushSum(f, '19', ['16_value', '17', '18']);

    buildNYLine40Worksheet();
    buildNYLine41Worksheet();
    pushToDict(f, '42', f['40'] - f['41']);
    pushSum(f, '45', ['42', '43', '44']);

    const nyAGI = (formsState[k_it201] as D)['33'];
    buildNYLine46Worksheet();
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
    const it196 = formsState[k_it196] as D;
    const line1 = ['4', '9', '15', '19', '20', '28', '39'].reduce((s, k) => s + (it196[k] || 0), 0);
    const line2 = ['4', '14', '16_value', '20', '29', '30', '37'].reduce((s, k) => s + (it196[k] || 0), 0);
    ws[1] = line1;
    ws[2] = line2;
    if (line1 <= line2) {
      summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[1];
      pushToDict(form(k_it196, true), '40', ws[1]);
      return;
    }
    ws[3] = ws[1] - ws[2];
    ws[4] = ws[3] * 0.80;
    ws[5] = (formsState[k_it201] as D)['19'];
    ws[6] = config.ny_itemized_deduction_threshold;
    if (ws[6] >= ws[5]) {
      summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[1];
      pushToDict(form(k_it196, true), '40', ws[1]);
      return;
    }
    ws[7] = ws[5] - ws[6];
    ws[8] = ws[7] * 0.03;
    ws[9] = Math.min(ws[4], ws[8]);
    ws[10] = Math.max(0, ws[1] - ws[9]);
    summaryInfo[`${w_ny_line40_itemized_deductions} 10 Total itemized deductions`] = ws[10];
    pushToDict(form(k_it196, true), '40', ws[10]);
  }

  function buildNYLine41Worksheet() {
    const ws = worksheet(w_ny_line41_itemized_deductions_subtractions, 11);
    const federalAGI = (formsState[k_it201] as D)['19'];
    const it196 = formsState[k_it196] as D;
    const taxesSubtracted = (it196['5'] || 0) + (it196['8'] || 0);
    if (federalAGI <= config.ny_itemized_deduction_threshold) {
      pushToDict(form(k_it196, true), '41', taxesSubtracted);
      return;
    }
    const ws40 = worksheets[w_ny_line40_itemized_deductions];
    if (ws40[1] <= ws40[2]) {
      pushToDict(form(k_it196, true), '41', taxesSubtracted);
      return;
    }
    ws[1] = ws40[9];
    ws[2] = ws40[3];
    ws[3] = Math.round(ws[1] / ws[2] * 10000) / 10000;
    ws[4] = taxesSubtracted;
    ws[5] = 0;
    ws[6] = ws[4] + ws[5];
    ws[7] = ws[3] * ws[6];
    ws[8] = ws[6] - ws[7];
    ws[9] = 0;
    ws[10] = 0;
    ws[11] = ws[8] + ws[9] + ws[10];
    summaryInfo[`${w_ny_line41_itemized_deductions_subtractions} NY Worksheet2 Line 41 - Itemized Deduction Subtractions`] = ws[11];
    pushToDict(form(k_it196, true), '41', ws[11]);
  }

  function buildNYLine46Worksheet() {
    const ws = worksheet(w_ny_line46_itemized_deduction_adjustments, 7);
    const nyAGI = (formsState[k_it201] as D)['33'];
    const line45 = ((formsState[k_it196] as D) || {})['45'] || 0;
    if (nyAGI <= 100_000) return;
    if (nyAGI > 1_000_000) return;
    let adjustment: number;
    if (nyAGI <= 475_000) {
      const excess = Math.min(nyAGI - 100_000, 50_000);
      const fraction = Math.round(excess / 50_000 * 10000) / 10000;
      adjustment = fraction * line45 * 0.25;
    } else if (nyAGI <= 525_000) {
      const excess = Math.min(nyAGI - 475_000, 50_000);
      const fraction = Math.round(excess / 50_000 * 10000) / 10000;
      adjustment = line45 * 0.25 + fraction * line45 * 0.25;
    } else {
      adjustment = line45 * 0.50;
    }
    ws[1] = nyAGI;
    ws[7] = adjustment;
    summaryInfo[`${w_ny_line46_itemized_deduction_adjustments} NY Worksheet3 Line 46 - Itemized Deduction Adjustment`] = adjustment;
    pushToDict(form(k_it196, true), '46', adjustment);
  }

  // ===================== MAIN EXECUTION =====================

  buildForm1040();
  buildFormIT201();

  // Carryover
  const foreignTaxPaid = (d['1099'] || []).reduce((s: number, i: D) => s + (i['Foreign Tax Paid'] || 0), 0);
  const foreignTaxCredit = ((formsState[k_1040s3] as D) || {})['1'] || 0;
  const foreignTaxCarryforward = Math.max(0, Math.round(foreignTaxPaid - foreignTaxCredit));

  const carryover = {
    taxable_income: ((formsState[k_1040] as D) || {})['15'] || 0,
    schedule_d_net_short_term: ((formsState[k_1040sd] as D) || {})['7'] || 0,
    schedule_d_net_long_term: ((formsState[k_1040sd] as D) || {})['15'] || 0,
    schedule_d_loss_deduction: ((formsState[k_1040sd] as D) || {})['21'] || 0,
    foreign_tax_credit_carryforward: foreignTaxCarryforward,
  };

  // Apply field maps
  const fieldMaps = config.field_maps;
  if (fieldMaps) {
    applyFieldMaps(formsState, fieldMaps as Record<string, Record<string, string | null>>);
  }

  return { formsState, worksheets, summaryInfo, carryover };
}
