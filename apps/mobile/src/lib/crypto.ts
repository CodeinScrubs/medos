import { scryptAsync } from '@noble/hashes/scrypt.js';
import * as Crypto from 'expo-crypto';

/**
 * Encryption primitives for backups (and later the credential vault).
 *
 * Only standard, audited building blocks are used: scrypt from @noble/hashes
 * for key derivation, and AES-256-GCM from the platform — Android's own
 * javax.crypto, through expo-crypto. Randomness comes from the OS via
 * expo-crypto, never from Math.random or a JS polyfill.
 *
 * Nothing here is novel cryptography. The one construction worth naming is the
 * chunked stream below, which is the STREAM scheme (Hoang et al., 2015) as used
 * by Tink and age: each chunk is sealed with its own nonce made of a random
 * prefix, a counter and a last-chunk flag, so chunks cannot be reordered,
 * dropped or truncated without the decryption failing.
 */

export const KEY_BYTES = 32;
export const SALT_BYTES = 16;
export const TAG_BYTES = 16;
export const NONCE_PREFIX_BYTES = 7;

export function randomBytes(n: number): Uint8Array {
  return Crypto.getRandomBytes(n);
}

/* -------------------------------------------------------------------------- */
/*  Key derivation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How a passphrase is normalised before key derivation. The scheme is recorded
 * in every backup header and next to the stored key, so improving the rules
 * never makes an existing backup unreadable.
 *
 * 1 — NFKC only. Used by the first builds. NFKC does NOT unify Arabic ي with
 *     Persian ی, or Persian digits with Latin ones, so a passphrase typed on a
 *     different keyboard derived a different key.
 * 2 — NFKC, then the variant folding below, then whitespace collapsed and
 *     trimmed. Current.
 */
export type PassphraseScheme = 1 | 2;
export const CURRENT_PASSPHRASE_SCHEME: PassphraseScheme = 2;

export function isPassphraseScheme(value: unknown): value is PassphraseScheme {
  return value === 1 || value === 2;
}

/*
 * Scheme 2's rules. FROZEN: every backup made with scheme 2 depends on these
 * exact tables, and a single changed entry would make those backups
 * undecryptable. They are deliberately a separate copy of the search folding
 * in lib/persian.ts, which is free to evolve. To change anything here, add
 * scheme 3 and leave scheme 2 as it is. crypto.test.ts pins the behaviour.
 *
 * The folding is generous on purpose. A passphrase that cannot be reproduced
 * loses every backup, while treating ي and ی (or ۱ and 1, or a stray
 * half-space) as the same costs a fraction of a bit of strength.
 */
const SCHEME2_FOLD: Record<string, string> = {
  '\u064A': '\u06CC', // ARABIC YEH           -> PERSIAN YEH
  '\u0649': '\u06CC', // ALEF MAKSURA         -> PERSIAN YEH
  '\u0626': '\u06CC', // YEH WITH HAMZA       -> PERSIAN YEH
  '\u0643': '\u06A9', // ARABIC KAF           -> KEHEH (Persian kaf)
  '\u0629': '\u0647', // TEH MARBUTA          -> HEH
  '\u06C0': '\u0647', // HEH WITH YEH ABOVE   -> HEH
  '\u0623': '\u0627', // ALEF WITH HAMZA ABOVE -> ALEF
  '\u0625': '\u0627', // ALEF WITH HAMZA BELOW -> ALEF
  '\u0622': '\u0627', // ALEF WITH MADDA      -> ALEF
  '\u0624': '\u0648', // WAW WITH HAMZA       -> WAW
  '\u066B': '.', // ARABIC DECIMAL SEPARATOR
  '\u066C': ',', // ARABIC THOUSANDS SEPARATOR
};
for (let i = 0; i < 10; i += 1) {
  SCHEME2_FOLD[String.fromCharCode(0x06f0 + i)] = String(i); // Persian digits
  SCHEME2_FOLD[String.fromCharCode(0x0660 + i)] = String(i); // Arabic-Indic digits
}
/** Harakat, tatweel, zero-width characters and direction controls. */
const SCHEME2_STRIP = /[\u064B-\u065F\u0670\u0640\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizePassphrase(passphrase: string, scheme: PassphraseScheme): string {
  const nfkc = passphrase.normalize('NFKC');
  if (scheme === 1) return nfkc;
  let out = '';
  for (const ch of nfkc) out += SCHEME2_FOLD[ch] ?? ch;
  return out.replace(SCHEME2_STRIP, '').replace(/\s+/g, ' ').trim();
}

export type KdfParams = { log2N: number; r: number; p: number; scheme: PassphraseScheme };

/**
 * scrypt with N = 2^15, r = 8, p = 1: about 32 MB of memory per guess, which
 * is what makes brute-forcing a stolen backup file expensive. On a phone this
 * takes a few seconds, once per backup-passphrase entry.
 */
export const DEFAULT_KDF: KdfParams = { log2N: 15, r: 8, p: 1, scheme: CURRENT_PASSPHRASE_SCHEME };

/** scrypt needs 128·r·N bytes; refuse anything that would not fit comfortably on a phone. */
const MAX_KDF_MEMORY = 256 * 1024 * 1024;

/**
 * Whether KDF parameters are ones this app could have written. They are read
 * from a backup header before anything is authenticated, so a damaged or
 * crafted file must not be able to ask for gigabytes of memory or hours of
 * work.
 */
export function isSaneKdf(params: KdfParams): boolean {
  const { log2N, r, p, scheme } = params;
  return (
    isPassphraseScheme(scheme) &&
    Number.isInteger(log2N) &&
    Number.isInteger(r) &&
    Number.isInteger(p) &&
    log2N >= 10 &&
    log2N <= 20 &&
    r >= 1 &&
    r <= 16 &&
    p >= 1 &&
    p <= 4 &&
    128 * r * 2 ** log2N <= MAX_KDF_MEMORY
  );
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const normalized = normalizePassphrase(passphrase, params.scheme);
  return scryptAsync(new TextEncoder().encode(normalized), salt, {
    N: 2 ** params.log2N,
    r: params.r,
    p: params.p,
    dkLen: KEY_BYTES,
    onProgress,
  });
}

/* -------------------------------------------------------------------------- */
/*  Chunked stream (STREAM construction)                                        */
/* -------------------------------------------------------------------------- */

/** `prefix (7) ‖ chunk index (u32, big-endian) ‖ last-chunk flag (1)` — 12 bytes. */
export function chunkNonce(prefix: Uint8Array, index: number, last: boolean): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setUint32(NONCE_PREFIX_BYTES, index, false);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

/** Seals and opens the chunks of one backup file. */
export type ChunkCipher = {
  seal(index: number, last: boolean, plaintext: Uint8Array): Promise<Uint8Array>;
  /** Throws on a wrong key, altered data, reordering, or truncation. */
  open(index: number, last: boolean, sealed: Uint8Array): Promise<Uint8Array>;
};

/**
 * AES-256-GCM over backup chunks, done natively. A JavaScript AES runs far
 * slower on the phone's engine, which would turn a backup with a few hundred
 * megabytes of photos from seconds into many minutes. The output is plain
 * standard AES-GCM — ciphertext followed by a 16-byte tag, the header as
 * associated data — so any implementation can read a backup: the test suite
 * checks it against an independent one.
 */
export async function chunkCipher(key: Uint8Array, noncePrefix: Uint8Array, aad: Uint8Array): Promise<ChunkCipher> {
  const nativeKey = await Crypto.AESEncryptionKey.import(key);
  return {
    async seal(index, last, plaintext) {
      const sealed = await Crypto.aesEncryptAsync(plaintext, nativeKey, {
        nonce: { bytes: chunkNonce(noncePrefix, index, last) },
        additionalData: aad,
        tagLength: TAG_BYTES,
      });
      return sealed.ciphertext({ includeTag: true });
    },
    async open(index, last, sealed) {
      const data = Crypto.AESSealedData.fromParts(chunkNonce(noncePrefix, index, last), sealed, TAG_BYTES);
      return Crypto.aesDecryptAsync(data, nativeKey, { additionalData: aad });
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Encoding helpers                                                            */
/* -------------------------------------------------------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! + '=' : '==';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    buffer = ((buffer << 6) | B64.indexOf(ch)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Constant-time comparison, for checking a derived key against a stored check value. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
