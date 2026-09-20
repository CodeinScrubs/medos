/**
 * Persian text handling.
 *
 * Two problems this solves:
 *
 * 1. The same Persian word can be typed several ways. Arabic ي and Persian ی
 *    are different code points, as are ك and ک, and a half-space (ZWNJ) may or
 *    may not be present. Without normalisation, searching "علي" misses
 *    "علی", which in a patient list is a real failure.
 * 2. Digits arrive as Latin, Persian (۰-۹) or Arabic-Indic (٠-٩) depending on
 *    the keyboard. Anything numeric has to be folded to Latin before it is
 *    parsed or compared.
 *
 * Look-alike letters are written as \u escapes below on purpose: ي and ی are
 * indistinguishable in most fonts, and a table that cannot be read cannot be
 * reviewed.
 */

/** Persian (U+06F0…) and Arabic-Indic (U+0660…) digits, and the Arabic decimal (٫) and thousands (٬) separators. */
const NUMBER_FOLD: Record<string, string> = {
  '\u066B': '.', // ٫ ARABIC DECIMAL SEPARATOR
  '\u066C': ',', // ٬ ARABIC THOUSANDS SEPARATOR
};
for (let i = 0; i < 10; i += 1) {
  NUMBER_FOLD[String.fromCharCode(0x06f0 + i)] = String(i);
  NUMBER_FOLD[String.fromCharCode(0x0660 + i)] = String(i);
}

/** Letters that different keyboards and sources produce for the same Persian letter. */
const LETTER_FOLD: Record<string, string> = {
  '\u064A': '\u06CC', // ي ARABIC YEH           -> ی
  '\u0649': '\u06CC', // ى ALEF MAKSURA         -> ی
  '\u0626': '\u06CC', // ئ YEH WITH HAMZA       -> ی
  '\u0643': '\u06A9', // ك ARABIC KAF           -> ک
  '\u0629': '\u0647', // ة TEH MARBUTA          -> ه
  '\u06C0': '\u0647', // ۀ HEH WITH YEH ABOVE   -> ه
  '\u0623': '\u0627', // أ ALEF WITH HAMZA      -> ا
  '\u0625': '\u0627', // إ ALEF WITH HAMZA      -> ا
  '\u0622': '\u0627', // آ ALEF WITH MADDA      -> ا
  '\u0624': '\u0648', // ؤ WAW WITH HAMZA       -> و
};

/**
 * Invisible and decorative marks, dropped before comparing: harakat and other
 * combining marks (U+064B–U+065F, U+0670), tatweel (U+0640), zero-width
 * space / non-joiner / joiner (U+200B–U+200D), and direction marks and
 * controls (U+200E–U+200F, U+061C, U+202A–U+202E, U+2066–U+2069, U+FEFF).
 */
const STRIP_RE = /[\u064B-\u065F\u0670\u0640\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** `۱۲٫۵` or `١٢٫٥` -> `12.5`. Safe to call on mixed text. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) out += NUMBER_FOLD[ch] ?? ch;
  return out;
}

const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * `123` -> `۱۲۳`, and a decimal point between digits becomes the Persian `٫`
 * (`1.5` -> `۱٫۵`). For dates, counts and UI chrome only — see the note below.
 */
export function toPersianDigits(input: string | number): string {
  const s = String(input);
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (isDigit(ch)) out += String.fromCharCode(0x06f0 + ch.charCodeAt(0) - 48);
    else if (ch === '.' && isDigit(s[i - 1]) && isDigit(s[i + 1])) out += String.fromCharCode(0x066b);
    else out += ch;
  }
  return out;
}

/**
 * Clinical numbers — doses, lab values, vitals — are deliberately left in
 * Latin digits throughout MedOS. Mixing "۱۲٫۵" and "12.5" in the same screen
 * invites a misread, and a misread dose is the one class of bug this app must
 * not introduce. Persian digits are for dates, counts and labels.
 */
export const CLINICAL_DIGITS_STAY_LATIN = true;

const DECIMAL_RE = /^[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

/**
 * A number as a person types it, or null.
 *
 * Accepts Persian and Arabic-Indic digits, `.` or `٫` as the decimal point,
 * and thousands grouped with `,` `٬` or `،` — `۱۲٫۵`, `12.5`, `250,000`. A
 * comma that is not a thousands separator (`12,5`) could be a European
 * decimal or a typo; a misread clinical value is worse than an unread one, so
 * it is rejected rather than guessed.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = toLatinDigits(input)
    .trim()
    .replace(/\u060C/g, ',');
  if (!DECIMAL_RE.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fold a string into its canonical searchable form: compatibility forms
 * unified (the presentation forms and ligatures that text copied from a PDF
 * is full of), Persian letters unified, digits Latin, marks removed,
 * whitespace collapsed, lowercased for the Latin parts (drug names and
 * diagnoses are typed in English).
 */
export function normalizePersian(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  for (const ch of input.normalize('NFKC')) out += LETTER_FOLD[ch] ?? NUMBER_FOLD[ch] ?? ch;
  return out.replace(STRIP_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Build the `searchText` column value for a row. Nulls are dropped, everything
 * else is normalised and joined, so a single `LIKE %term%` covers name,
 * national id, tags and whatever else the caller passes.
 */
export function buildSearchText(...parts: (string | null | undefined | string[])[]): string {
  const flat: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (Array.isArray(p)) flat.push(...p.filter(Boolean));
    else flat.push(p);
  }
  return normalizePersian(flat.join(' '));
}

/** Whether text contains Persian or Arabic letters — for choosing the direction of mixed-language content. */
export function hasPersianLetters(text: string | null | undefined): boolean {
  return !!text && /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/** Split a query into terms so "علی رضایی" matches regardless of field order. */
export function searchTerms(query: string): string[] {
  return normalizePersian(query).split(' ').filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/*  Phone numbers                                                               */
/* -------------------------------------------------------------------------- */

/** `۰۹۱۲۰۰۰۰۰۰۱` / `+989120000001` / `0912 000 0001` -> `09120000001`. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  const digits = toLatinDigits(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+98')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0098')) return `0${digits.slice(4)}`;
  if (digits.startsWith('98') && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

/** `09120000001` -> `۰۹۱۲ ۰۰۰ ۰۰۰۱`, for display only. */
export function formatPhone(input: string | null | undefined): string {
  const n = normalizePhone(input);
  if (n.length === 11 && n.startsWith('09')) {
    return toPersianDigits(`${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`);
  }
  return toPersianDigits(n);
}

/* -------------------------------------------------------------------------- */
/*  National id                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Iranian کد ملی check-digit validation. Used to warn on a likely typo, never
 * to block saving: a patient in front of you matters more than a clean field.
 */
export function isValidNationalId(input: string | null | undefined): boolean {
  if (!input) return false;
  const code = toLatinDigits(input).replace(/\D/g, '');
  if (code.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(code[i]) * (10 - i);
  const remainder = sum % 11;
  const check = Number(code[9]);
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/** Display a name the way it should be read, trimming stray whitespace. */
export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
  title?: string | null,
): string {
  return [title, first, last]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

/** First letters, for avatar placeholders. */
export function initials(first?: string | null, last?: string | null): string {
  const a = first?.trim()[0] ?? '';
  const b = last?.trim()[0] ?? '';
  return a + b || '؟';
}

/*
 * Bidirectional isolation for a value written in Latin characters.
 *
 * The app is forced RTL, so a paragraph's direction is right-to-left, and a
 * string of digits and punctuation carries no direction of its own — digits
 * are weak, `<` and `>` are neutral *and* mirrored. A lab result of ">100"
 * therefore renders as "100<", which a reader takes as "less than 100": the
 * opposite of what the lab reported. `writingDirection: 'ltr'` on the Text
 * does not fix it, because the run still has no strong character to anchor to.
 *
 * Wrapping the value in an isolate gives it one. Only for values that may
 * begin with a comparator or a sign; ordinary Persian text needs none.
 */
const LTR_ISOLATE = String.fromCharCode(0x2066);
const POP_ISOLATE = String.fromCharCode(0x2069);

export function ltrIsolate(text: string | null | undefined): string {
  return text ? LTR_ISOLATE + text + POP_ISOLATE : '';
}
