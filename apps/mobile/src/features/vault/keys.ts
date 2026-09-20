import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { defineSetting, readSetting, writeSetting } from '@/db/settings';
import {
  DEFAULT_KDF,
  deriveKey,
  fromBase64,
  isSaneKdf,
  KEY_BYTES,
  openSecret,
  randomBytes,
  SALT_BYTES,
  sealSecret,
  toBase64,
  type KdfParams,
} from '@/lib/crypto';

/*
 * The vault's key.
 *
 * Two halves, deliberately kept apart:
 *
 * - The **salt, the KDF parameters and a check value** live in `settings`, so
 *   they travel inside an encrypted backup. Without that, restoring onto a new
 *   phone would derive a different key from the same passphrase and every
 *   stored password would be lost for ever.
 * - The **derived key** lives in the Android Keystore via SecureStore, never
 *   in the database and never in a backup. A stolen backup file therefore
 *   still needs the vault passphrase, even after the backup passphrase is
 *   known.
 *
 * The passphrase itself is never stored anywhere.
 */

const KEY_STORE = 'medos.vault.key';

/** What the check value seals — proves a typed passphrase is the right one. */
const CHECK_PLAINTEXT = 'medos.vault.check.v1';
const CHECK_AAD = 'medos.vault.check';

const storedKdf = z
  .object({
    log2N: z.number(),
    r: z.number(),
    p: z.number(),
    // Written by this app only, so the scheme is always present — unlike the
    // backup keyset, which has to read records from before schemes existed.
    scheme: z.union([z.literal(1), z.literal(2)]),
  })
  .refine(isSaneKdf);

const vaultKeysetSchema = z.object({
  v: z.literal(1),
  salt: z.string(),
  kdf: storedKdf,
  /** Bumped on every passphrase change; rows carry the version that sealed them. */
  keyVersion: z.number().int().min(1),
  check: z.object({ nonce: z.string(), sealed: z.string() }),
});

export type VaultKeyset = z.infer<typeof vaultKeysetSchema>;

/** Not prefixed `backup.`, so it travels with the data it protects. */
const vaultKeyset = defineSetting<VaultKeyset | null>('vault.keyset', vaultKeysetSchema.nullable(), null);

export async function vaultKeysetRecord(): Promise<VaultKeyset | null> {
  return readSetting(vaultKeyset);
}

export async function isVaultConfigured(): Promise<boolean> {
  return (await vaultKeysetRecord()) != null;
}

/** The key for this session, if the vault has been unlocked on this phone. */
export async function loadVaultKey(): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(KEY_STORE);
    if (!stored) return null;
    const key = fromBase64(stored);
    return key.length === KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

/** Forget the derived key. The vault then needs the passphrase again. */
export async function forgetVaultKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE).catch(() => undefined);
}

const utf8 = (text: string) => new TextEncoder().encode(text);

async function checkValue(key: Uint8Array) {
  const { nonce, sealed } = await sealSecret(key, utf8(CHECK_PLAINTEXT), utf8(CHECK_AAD));
  return { nonce: toBase64(nonce), sealed: toBase64(sealed) };
}

async function passphraseMatches(key: Uint8Array, record: VaultKeyset): Promise<boolean> {
  try {
    const opened = await openSecret(
      key,
      { nonce: fromBase64(record.check.nonce), sealed: fromBase64(record.check.sealed) },
      utf8(CHECK_AAD),
    );
    return new TextDecoder().decode(opened) === CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

/**
 * Set the vault passphrase for the first time.
 *
 * Refuses when a vault already exists: changing it has to re-encrypt every
 * stored secret, which is `rekeyVault` in `queries.ts`, not this.
 */
export async function createVault(passphrase: string, onProgress?: (fraction: number) => void): Promise<void> {
  if (await isVaultConfigured()) throw new Error('گاوصندوق از قبل ساخته شده است');
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(passphrase, salt, DEFAULT_KDF, onProgress);
  await writeSetting(vaultKeyset, {
    v: 1,
    salt: toBase64(salt),
    kdf: DEFAULT_KDF,
    keyVersion: 1,
    check: await checkValue(key),
  });
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
}

/**
 * Derive the key from a typed passphrase and keep it for this phone.
 *
 * Returns false for a wrong passphrase — checked against the stored check
 * value, so a mistake is caught before anything is decrypted with it.
 */
export async function unlockVault(passphrase: string, onProgress?: (fraction: number) => void): Promise<boolean> {
  const record = await vaultKeysetRecord();
  if (!record) return false;
  const key = await deriveKey(passphrase, fromBase64(record.salt), record.kdf as KdfParams, onProgress);
  if (!(await passphraseMatches(key, record))) return false;
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  return true;
}

/** Derive a key without storing it — used while re-keying. */
export async function deriveVaultKey(
  passphrase: string,
  record: VaultKeyset,
  onProgress?: (fraction: number) => void,
): Promise<{ key: Uint8Array; matches: boolean }> {
  const key = await deriveKey(passphrase, fromBase64(record.salt), record.kdf as KdfParams, onProgress);
  return { key, matches: await passphraseMatches(key, record) };
}

/** Write the new keyset once every row has been re-sealed. See `rekeyVault`. */
export async function replaceVaultKeyset(key: Uint8Array, salt: Uint8Array, keyVersion: number): Promise<void> {
  await writeSetting(vaultKeyset, {
    v: 1,
    salt: toBase64(salt),
    kdf: DEFAULT_KDF,
    keyVersion,
    check: await checkValue(key),
  });
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
}
