import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { computeAll } from './compute';
import { TAX_YEARS } from './config';
import type { TaxYear } from './config';
import { normalizeInput } from '../types/input';
import type { TaxInput } from '../types/input';

// tests/scenarios/<year>/<name>/ copied from taxes1040/tests/scenarios/<year>/
const SCENARIOS_DIR = join(__dirname, '..', '..', 'tests', 'scenarios');

// Filing defaults applied to every scenario (taxes1040 tests/test_computation.py DEFAULTS)
const DEFAULTS: Partial<TaxInput> = {
  occupation: 'Analyst',
  phone: '6465555555',
  email: 'test@test.com',
  routing_number: '11111111',
  checking: true,
  account_number: '444444444',
  prior_year: null,
};

/** Convert a Python scenario input.json into a TaxInput. */
function scenarioToTaxInput(raw: Partial<TaxInput>, year: TaxYear): TaxInput {
  return normalizeInput({ ...DEFAULTS, ...raw, year });
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

for (const year of TAX_YEARS) {
  const yearDir = join(SCENARIOS_DIR, year);
  const scenarioNames = readdirSync(yearDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  describe(`${year} scenario tests (from taxes1040)`, () => {
    for (const name of scenarioNames) {
      const dir = join(yearDir, name);
      const compute = () => computeAll(scenarioToTaxInput(readJson(join(dir, 'input.json')), year));

      it(`${name} — summary matches`, () => {
        const expectedSummary = readJson(join(dir, 'summary.json'));
        const { summaryInfo } = compute();
        for (const [key, expected] of Object.entries(expectedSummary)) {
          const actual = summaryInfo[key];
          if (typeof expected === 'number') {
            expect(actual, `summary key "${key}"`).toBeCloseTo(expected, 0);
          } else {
            expect(actual, `summary key "${key}"`).toEqual(expected);
          }
        }
        // no extra summary lines either
        expect(Object.keys(summaryInfo).sort()).toEqual(Object.keys(expectedSummary).sort());
      });

      it(`${name} — carryover matches`, () => {
        const expectedCarryover = readJson(join(dir, 'carryover.json'));
        const { carryover } = compute();
        for (const [key, expected] of Object.entries(expectedCarryover)) {
          if (typeof expected === 'number') {
            expect(carryover[key], `carryover key "${key}"`).toBeCloseTo(expected, 1);
          } else {
            expect(carryover[key], `carryover key "${key}"`).toEqual(expected);
          }
        }
      });
    }
  });
}
