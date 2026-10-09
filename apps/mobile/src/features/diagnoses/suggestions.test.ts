import { describe, expect, it } from '@jest/globals';

import { matchImpressions } from './suggestions';

describe('matchImpressions', () => {
  it('returns exact abbreviation match first', () => {
    const results = matchImpressions('AF');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.abbr).toBe('AF');
    expect(results[0]!.full).toBe('Atrial Fibrillation');
  });

  it('matches common hospital acronyms (AKI, HTN, DM, COPD)', () => {
    expect(matchImpressions('AKI')[0]!.full).toBe('Acute Kidney Injury');
    expect(matchImpressions('HTN')[0]!.full).toBe('Hypertension');
    expect(matchImpressions('DM')[0]!.full).toBe('Diabetes Mellitus');
    expect(matchImpressions('COPD')[0]!.full).toBe('Chronic Obstructive Pulmonary Disease');
  });

  it('matches prefix abbreviations case-insensitively', () => {
    const results = matchImpressions('hf');
    expect(results.some((r) => r.abbr === 'HF')).toBe(true);
    expect(results.some((r) => r.abbr === 'HFrEF')).toBe(true);
    expect(results.some((r) => r.abbr === 'HFpEF')).toBe(true);
  });

  it('matches full English words and Persian translation', () => {
    const strokeResults = matchImpressions('stroke');
    expect(strokeResults.some((r) => r.abbr === 'CVA')).toBe(true);

    const persianResults = matchImpressions('دیابت');
    expect(persianResults.some((r) => r.abbr === 'DM')).toBe(true);
  });

  it('returns empty array on empty or whitespace query', () => {
    expect(matchImpressions('')).toEqual([]);
    expect(matchImpressions('   ')).toEqual([]);
  });

  it('respects the limit argument', () => {
    const results = matchImpressions('a', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
