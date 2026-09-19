import { describe, expect, it } from '@jest/globals';

import {
  buildSearchText,
  formatPhone,
  fullName,
  hasPersianLetters,
  initials,
  isValidNationalId,
  normalizePersian,
  normalizePhone,
  parseDecimal,
  searchTerms,
  toLatinDigits,
  toPersianDigits,
} from './persian';

const c = (...codes: number[]) => String.fromCharCode(...codes);
const ARABIC_YEH = c(0x064a);
const PERSIAN_YEH = c(0x06cc);
const ARABIC_KAF = c(0x0643);
const PERSIAN_KAF = c(0x06a9);
const ZWNJ = c(0x200c);
const TATWEEL = c(0x0640);
const FATHA = c(0x064e);

describe('digits', () => {
  it('folds Persian and Arabic-Indic digits and separators to Latin', () => {
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toLatinDigits(`۱۲${c(0x066b)}۵`)).toBe('12.5');
    expect(toLatinDigits(`۲${c(0x066c)}۵۰۰`)).toBe('2,500');
    expect(toLatinDigits('Hb ۱۲ g/dL')).toBe('Hb 12 g/dL');
  });

  it('writes Persian digits for display', () => {
    expect(toPersianDigits(1403)).toBe('۱۴۰۳');
    expect(toPersianDigits('09:05')).toBe('۰۹:۰۵');
    expect(toPersianDigits('1.5')).toBe('۱٫۵');
    expect(toPersianDigits('v0.1.0')).toBe('v۰٫۱٫۰');
    expect(toPersianDigits('end.')).toBe('end.');
  });
});

describe('parseDecimal', () => {
  it.each([
    ['12.5', 12.5],
    ['۱۲٫۵', 12.5],
    [`١٢${c(0x066b)}٥`, 12.5],
    ['250,000', 250000],
    [`۲۵۰${c(0x066c)}۰۰۰`, 250000],
    [`7${c(0x060c)}500`, 7500],
    ['1,234.5', 1234.5],
    ['.5', 0.5],
    ['5.', 5],
    ['-2', -2],
    ['+2', 2],
    [' 7 ', 7],
    ['1e3', 1000],
  ])('reads %j as %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  // A comma that is not grouping thousands is ambiguous. 7,5 could mean 7.5
  // or 75; a clinical value is never guessed.
  it.each(['12,5', '1,23', '1,2345', '12,', ',5', '1.2.3', 'abc', '', '-', '.', '7 500', 'NaN', 'Infinity'])(
    'refuses %j',
    (input) => {
      expect(parseDecimal(input)).toBeNull();
    },
  );

  it('treats null as not a number', () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});

describe('normalizePersian', () => {
  it('unifies Arabic and Persian yeh and kaf', () => {
    expect(normalizePersian(`عل${ARABIC_YEH}`)).toBe(normalizePersian(`عل${PERSIAN_YEH}`));
    expect(normalizePersian(`${ARABIC_KAF}تاب`)).toBe(`${PERSIAN_KAF}تاب`);
  });

  it('drops half-spaces, harakat and tatweel', () => {
    expect(normalizePersian(`می${ZWNJ}روم`)).toBe('میروم');
    expect(normalizePersian(`ع${FATHA}ل${TATWEEL}${TATWEEL}ی`)).toBe(`عل${PERSIAN_YEH}`);
  });

  it('unifies the presentation forms that text copied from a PDF contains', () => {
    // ﻋ ﻠ ﯽ — initial ain, medial lam, final Farsi yeh
    expect(normalizePersian(c(0xfecb, 0xfee0, 0xfbfd))).toBe(`عل${PERSIAN_YEH}`);
    expect(normalizePersian(c(0xfb01) + 'brinogen')).toBe('fibrinogen');
  });

  it('lowercases Latin, folds digits and collapses whitespace', () => {
    expect(normalizePersian('  Ceftriaxone   ۱G ')).toBe('ceftriaxone 1g');
  });

  it('drops direction marks', () => {
    expect(normalizePersian(`a${c(0x200f)}b${c(0x200e)}c`)).toBe('abc');
  });

  it('returns an empty string for nothing', () => {
    expect(normalizePersian(null)).toBe('');
    expect(normalizePersian(undefined)).toBe('');
    expect(normalizePersian('   ')).toBe('');
  });
});

describe('search text and terms', () => {
  it('joins the non-empty parts, normalised', () => {
    expect(buildSearchText(`عل${ARABIC_YEH}`, null, undefined, ['DM', ''], 'رضایی')).toBe(`عل${PERSIAN_YEH} dm رضایی`);
  });

  it('splits a query into normalised terms', () => {
    expect(searchTerms(`  عل${ARABIC_YEH}   رضا${ARABIC_YEH}${ARABIC_YEH} `)).toEqual([
      `عل${PERSIAN_YEH}`,
      `رضا${PERSIAN_YEH}${PERSIAN_YEH}`,
    ]);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('phone numbers', () => {
  it.each([
    ['۰۹۱۲۰۰۰۰۰۰۱', '09120000001'],
    ['+98 912 000 0001', '09120000001'],
    ['0098-912-000-0001', '09120000001'],
    ['989120000001', '09120000001'],
    ['021-0000-3333', '02100003333'],
  ])('normalises %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('formats a mobile number for display', () => {
    expect(formatPhone('+989120000001')).toBe('۰۹۱۲ ۰۰۰ ۰۰۰۱');
  });

  it('treats nothing as nothing', () => {
    expect(normalizePhone(null)).toBe('');
    expect(formatPhone('')).toBe('');
  });
});

describe('isValidNationalId', () => {
  it('accepts a code whose check digit is right, in any digits', () => {
    expect(isValidNationalId('0000000019')).toBe(true);
    expect(isValidNationalId('۰۰۰۰۰۰۰۰۱۹')).toBe(true);
    expect(isValidNationalId('000-000001-9')).toBe(true);
  });

  it('rejects a wrong check digit, a wrong length and repeated digits', () => {
    expect(isValidNationalId('0000000018')).toBe(false);
    expect(isValidNationalId('000000001')).toBe(false);
    expect(isValidNationalId('1111111111')).toBe(false);
    expect(isValidNationalId(null)).toBe(false);
  });
});

describe('names', () => {
  it('joins title and names, ignoring blanks', () => {
    expect(fullName('  علی ', 'رضایی', 'دکتر')).toBe('دکتر علی رضایی');
    expect(fullName('', 'رضایی', null)).toBe('رضایی');
  });

  it('makes initials, with a placeholder when there are none', () => {
    expect(initials('علی', 'رضایی')).toBe('عر');
    expect(initials(' ', null)).toBe('؟');
  });

  it('detects Persian script', () => {
    expect(hasPersianLetters('Hb')).toBe(false);
    expect(hasPersianLetters('قند خون')).toBe(true);
    expect(hasPersianLetters(null)).toBe(false);
  });
});
