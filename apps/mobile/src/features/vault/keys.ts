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
/** Where the new key waits while a passphrase change is being carried out. */
const KEY_STORE_NEXT = 'medos.vault.key.next';

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

/** The keyset a passphrase change is moving towards; null when none is. */
const vaultRekeyPending = defineSetting<VaultKeyset | null>('vault.rekey.pending', vaultKeysetSchema.nullable(), null);

export async function vaultKeysetRecord(): Promise<VaultKeyset | null> {
  return readSetting(vaultKeyset);
}

export async function pendingKeysetRecord(): Promise<VaultKeyset | null> {
  return readSetting(vaultRekeyPending);
}

export async function isVaultConfigured(): Promise<boolean> {
  return (await vaultKeysetRecord()) != null;
}

async function storedKey(slot: string): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(slot);
    if (!stored) return null;
    const key = fromBase64(stored);
    return key.length === KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

/**
 * The key for this session, if the vault has been unlocked on this phone.
 *
 * The stored key is proved against the keyset in the database, not merely
 * measured. After a restore the database is a different dataset — its salt,
 * its check value, its key generation — while the Keystore still holds the key
 * derived here from the old one's passphrase. Handing that key out would seal
 * the next password with a key the restored vault cannot derive, and it would
 * surface only later, as a password that will not open with the right
 * passphrase. A key that does not match reads as locked instead; typing the
 * passphrase replaces it. It is left in place rather than deleted: a key that
 * cannot be derived again is never thrown away on a guess.
 */
export async function loadVaultKey(): Promise<Uint8Array | null> {
  const record = await vaultKeysetRecord();
  if (!record) return null;
  const key = await storedKey(KEY_STORE);
  if (!key) return null;
  return (await passphraseMatches(key, record)) ? key : null;
}

/**
 * The key that opens a row sealed at `keyVersion`.
 *
 * While a passphrase change is in flight two generations exist at once: rows
 * already re-sealed carry the pending version, the rest the current one.
 */
export async function vaultKeyForVersion(keyVersion: number): Promise<Uint8Array | null> {
  const record = await vaultKeysetRecord();
  if (record?.keyVersion === keyVersion) return loadVaultKey();
  const pending = await pendingKeysetRecord();
  if (pending?.keyVersion !== keyVersion) return null;
  const key = await storedKey(KEY_STORE_NEXT);
  if (!key) return null;
  return (await passphraseMatches(key, pending)) ? key : null;
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
  if (await passphraseMatches(key, record)) {
    await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
    return true;
  }

  // A passphrase change that did not finish leaves rows sealed with the key
  // the new passphrase derives. It has to be accepted too, or those rows would
  // stay shut on a phone whose Keystore was cleared mid-change.
  const pending = await pendingKeysetRecord();
  if (!pending) return false;
  const next = await deriveKey(passphrase, fromBase64(pending.salt), pending.kdf as KdfParams, onProgress);
  if (!(await passphraseMatches(next, pending))) return false;
  await SecureStore.setItemAsync(KEY_STORE_NEXT, toBase64(next));
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

/**
 * Publish the new key **before** a single row is re-sealed. See `rekeyVault`.
 *
 * A key exists in one place only — the Keystore — and is derived from a
 * passphrase and a salt that exists in one place only: the database. Re-sealing
 * rows with a key held in a local variable means that until the change is
 * committed, every row already rewritten is readable by nothing on earth if
 * the app is killed. Writing the key and its salt down first costs a window in
 * which two keys exist, and buys the guarantee that no row is ever sealed with
 * a key that is not recorded somewhere.
 */
export async function stageNextKeyset(key: Uint8Array, salt: Uint8Array, keyVersion: number): Promise<VaultKeyset> {
  const staged: VaultKeyset = {
    v: 1,
    salt: toBase64(salt),
    kdf: DEFAULT_KDF,
    keyVersion,
    check: await checkValue(key),
  };
  await SecureStore.setItemAsync(KEY_STORE_NEXT, toBase64(key));
  await writeSetting(vaultRekeyPending, staged);
  return staged;
}

/**
 * Make the staged keyset the vault's own, once every row carries its version.
 *
 * The key is moved before the keyset: a keyset whose key is missing reads as a
 * locked vault, while a key whose keyset has not landed yet is still described
 * by the pending record and can be picked up again.
 */
export async function commitNextKeyset(): Promise<void> {
  const pending = await pendingKeysetRecord();
  if (!pending) throw new Error('تغییر رمزی در جریان نیست');
  const key = await storedKey(KEY_STORE_NEXT);
  if (!key || !(await passphraseMatches(key, pending))) throw new Error('کلید جدید گاوصندوق در دسترس نیست');
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  await writeSetting(vaultKeyset, pending);
  await discardPendingKeyset();
}

/** Drop a pending record: either committed, or never started on any row. */
export async function discardPendingKeyset(): Promise<void> {
  await writeSetting(vaultRekeyPending, null);
  await SecureStore.deleteItemAsync(KEY_STORE_NEXT).catch(() => undefined);
}
