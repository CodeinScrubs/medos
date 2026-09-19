import { describe, expect, it } from '@jest/globals';
import { gcm } from '@noble/ciphers/aes.js';

import {
  chunkCipher,
  chunkNonce,
  DEFAULT_KDF,
  deriveKey,
  equalBytes,
  fromBase64,
  isSaneKdf,
  normalizePassphrase,
  randomBytes,
  toBase64,
  type KdfParams,
} from './crypto';

const c = (code: number) => String.fromCharCode(code);
const ARABIC_YEH = c(0x064a);
const PERSIAN_YEH = c(0x06cc);
const ARABIC_KAF = c(0x0643);
const PERSIAN_KAF = c(0x06a9);
const ZWNJ = c(0x200c);
const RLM = c(0x200f);
const ARABIC_DECIMAL = c(0x066b);

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string) => new TextEncoder().encode(text);
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const FAST: KdfParams = { log2N: 10, r: 8, p: 1, scheme: 2 };

describe('normalizePassphrase', () => {
  it('scheme 1 applies NFKC and nothing else', () => {
    expect(normalizePassphrase('  ﬁle  ', 1)).toBe('  file  ');
    expect(normalizePassphrase(`${ARABIC_YEH}`, 1)).toBe(ARABIC_YEH);
  });

  it('scheme 2 folds the characters different keyboards produce for the same key', () => {
    const typedOnArabicKeyboard = `${ARABIC_KAF}ت${ARABIC_YEH}ب ١٢٣`;
    const typedOnPersianKeyboard = `${PERSIAN_KAF}ت${PERSIAN_YEH}ب ۱۲۳`;
    const typedOnEnglishDigits = `${PERSIAN_KAF}ت${PERSIAN_YEH}ب 123`;
    const a = normalizePassphrase(typedOnArabicKeyboard, 2);
    expect(a).toBe(normalizePassphrase(typedOnPersianKeyboard, 2));
    expect(a).toBe(normalizePassphrase(typedOnEnglishDigits, 2));
  });

  it('scheme 2 drops invisible characters and collapses whitespace', () => {
    expect(normalizePassphrase(`  می${ZWNJ}روم${RLM}   امروز  `, 2)).toBe('میروم امروز');
  });

  it('scheme 2 keeps case, which is part of what the user typed', () => {
    expect(normalizePassphrase('Correct Horse', 2)).toBe('Correct Horse');
  });

  it('scheme 2 turns the Arabic decimal separator into a point', () => {
    expect(normalizePassphrase(`۱۲${ARABIC_DECIMAL}۵`, 2)).toBe('12.5');
  });
});

describe('deriveKey', () => {
  it('matches the RFC 7914 scrypt test vector', async () => {
    const key = await deriveKey('password', utf8('NaCl'), { log2N: 10, r: 8, p: 16, scheme: 1 });
    expect(hex(key)).toBe('fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162');
  });

  /*
   * These two pin the passphrase schemes. Every backup ever written depends
   * on them: if either fails, backups made before the change can no longer be
   * opened. Add a new scheme instead of changing an old one.
   */
  it('scheme 1 derives the key it always has', async () => {
    const key = await deriveKey('  correct horse  ', SALT, { ...FAST, scheme: 1 });
    expect(hex(key)).toBe('2c9a631e3e3303c5b47b557da17780f6a20f303040b3c82531775b3d27148a7e');
  });

  it('scheme 2 derives the key it always has', async () => {
    const typed = `  رمز  عبور ۱۲۳${ARABIC_DECIMAL}۵ ${ARABIC_YEH}اس می${ZWNJ}خواهم ${RLM} `;
    const key = await deriveKey(typed, SALT, FAST);
    expect(hex(key)).toBe('a766225ad882152c71dfc7f52bb43af8bb4480666a8d0e2bc8fcd260ecd713ea');
  });

  it('gives different keys for different salts', async () => {
    const other = Uint8Array.from({ length: 16 }, (_, i) => 16 - i);
    const a = await deriveKey('same', SALT, FAST);
    const b = await deriveKey('same', other, FAST);
    expect(equalBytes(a, b)).toBe(false);
  });
});

describe('isSaneKdf', () => {
  it('accepts the default', () => {
    expect(isSaneKdf(DEFAULT_KDF)).toBe(true);
  });

  it.each([
    ['N too large', { ...DEFAULT_KDF, log2N: 21 }],
    ['N too small', { ...DEFAULT_KDF, log2N: 9 }],
    ['r too large', { ...DEFAULT_KDF, r: 17 }],
    ['p too large', { ...DEFAULT_KDF, p: 5 }],
    ['memory over the cap', { ...DEFAULT_KDF, log2N: 20, r: 16 }],
    ['non-integer', { ...DEFAULT_KDF, r: 8.5 }],
    ['unknown scheme', { ...DEFAULT_KDF, scheme: 3 as unknown as 1 }],
  ])('rejects %s', (_, params) => {
    expect(isSaneKdf(params)).toBe(false);
  });
});

describe('chunkCipher', () => {
  const key = randomBytes(32);
  const prefix = randomBytes(7);
  const aad = utf8('header');
  const chunk = utf8('chunk body');

  it('lays out the nonce as prefix, big-endian counter, last flag', () => {
    const nonce = chunkNonce(Uint8Array.of(1, 2, 3, 4, 5, 6, 7), 0x01020304, true);
    expect(Array.from(nonce)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 1]);
  });

  it('round-trips, including an empty final chunk', async () => {
    const cipher = await chunkCipher(key, prefix, aad);
    expect(await cipher.open(3, false, await cipher.seal(3, false, chunk))).toEqual(chunk);
    const empty = await cipher.seal(4, true, new Uint8Array(0));
    expect(empty.length).toBe(16);
    expect(await cipher.open(4, true, empty)).toEqual(new Uint8Array(0));
  });

  it('binds each chunk to its position, the last-chunk flag, the header and the key', async () => {
    const cipher = await chunkCipher(key, prefix, aad);
    const sealed = await cipher.seal(3, false, chunk);
    await expect(cipher.open(4, false, sealed)).rejects.toThrow();
    await expect(cipher.open(3, true, sealed)).rejects.toThrow();
    await expect((await chunkCipher(key, prefix, utf8('other header'))).open(3, false, sealed)).rejects.toThrow();
    await expect((await chunkCipher(randomBytes(32), prefix, aad)).open(3, false, sealed)).rejects.toThrow();
    const altered = sealed.slice();
    altered[0] = altered[0]! ^ 1;
    await expect(cipher.open(3, false, altered)).rejects.toThrow();
  });

  // Backups must stay readable by any AES-GCM implementation — a future
  // desktop tool, or a web page using WebCrypto — so the bytes are checked
  // against an independent one in both directions.
  it('produces standard AES-256-GCM, interchangeable with an independent implementation', async () => {
    const cipher = await chunkCipher(key, prefix, aad);
    const sealed = await cipher.seal(7, true, chunk);
    expect(sealed).toEqual(gcm(key, chunkNonce(prefix, 7, true), aad).encrypt(chunk));
    const fromReference = gcm(key, chunkNonce(prefix, 8, false), aad).encrypt(chunk);
    expect(await cipher.open(8, false, fromReference)).toEqual(chunk);
  });
});

describe('base64', () => {
  // RFC 4648 section 10.
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j as %j', (plain, encoded) => {
    expect(toBase64(utf8(plain))).toBe(encoded);
    expect(fromBase64(encoded)).toEqual(utf8(plain));
  });

  it('round-trips arbitrary bytes of every length', () => {
    for (let n = 0; n < 70; n += 1) {
      const bytes = randomBytes(n);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
  });

  it('ignores line breaks and spaces', () => {
    expect(fromBase64('Zm9v\nYmFy ')).toEqual(utf8('foobar'));
  });
});

describe('equalBytes', () => {
  it('compares content and length', () => {
    expect(equalBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(equalBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(equalBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
  });
});
