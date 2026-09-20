import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import {
  DEFAULT_KDF,
  deriveKey,
  equalBytes,
  fromBase64,
  isSaneKdf,
  KEY_BYTES,
  randomBytes,
  SALT_BYTES,
  toBase64,
  type KdfParams,
} from '@/lib/crypto';

/**
 * The backup key, kept in the Android Keystore via SecureStore.
 *
 * The passphrase itself is never stored — only the key derived from it, so
 * automatic backups can run unattended. Restoring on a new phone needs the
 * passphrase typed in again, by design.
 *
 * Key, salt and KDF parameters are stored as **one record**. Written
 * separately, an interrupted passphrase change could leave a new key beside an
 * old salt: every later backup would then be sealed with a key that nothing
 * can derive again, and those backups would never open. One write, one record.
 */

const KEYSET_STORE = 'medos.backup.keyset';

/** The three separate items written by builds before the record existed. */
const LEGACY_KEY_STORE = 'medos.backup.key';
const LEGACY_SALT_STORE = 'medos.backup.salt';
const LEGACY_KDF_STORE = 'medos.backup.kdf';

export type BackupKey = { key: Uint8Array; salt: Uint8Array; kdf: KdfParams };

const storedKdf = z
  .object({
    log2N: z.number(),
    r: z.number(),
    p: z.number(),
    // Keys stored by the first builds carry no `scheme`; they were derived
    // with scheme 1 and must keep being described that way.
    scheme: z.union([z.literal(1), z.literal(2)]).default(1),
  })
  .refine(isSaneKdf);

const storedKeyset = z.object({
  v: z.literal(1),
  key: z.string(),
  salt: z.string(),
  kdf: storedKdf,
});

export async function hasBackupKey(): Promise<boolean> {
  return (await loadBackupKey()) != null;
}

function decode({ key, salt, kdf }: { key: string; salt: string; kdf: KdfParams }): BackupKey | null {
  const decodedKey = fromBase64(key);
  const decodedSalt = fromBase64(salt);
  if (decodedKey.length !== KEY_BYTES || decodedSalt.length !== SALT_BYTES) return null;
  return { key: decodedKey, salt: decodedSalt, kdf };
}

export async function loadBackupKey(): Promise<BackupKey | null> {
  try {
    const record = await SecureStore.getItemAsync(KEYSET_STORE);
    if (record) {
      const parsed = storedKeyset.parse(JSON.parse(record));
      return decode(parsed);
    }
  } catch {
    return null;
  }

  // A key stored by an earlier build: read it, and move it into one record so
  // the next write is atomic.
  try {
    const [key, salt, kdf] = await Promise.all([
      SecureStore.getItemAsync(LEGACY_KEY_STORE),
      SecureStore.getItemAsync(LEGACY_SALT_STORE),
      SecureStore.getItemAsync(LEGACY_KDF_STORE),
    ]);
    if (!key || !salt || !kdf) return null;
    const loaded = decode({ key, salt, kdf: storedKdf.parse(JSON.parse(kdf)) });
    if (loaded) await storeBackupKey(loaded);
    return loaded;
  } catch {
    return null;
  }
}

export async function storeBackupKey({ key, salt, kdf }: BackupKey): Promise<void> {
  const record: z.infer<typeof storedKeyset> = { v: 1, key: toBase64(key), salt: toBase64(salt), kdf };
  await SecureStore.setItemAsync(KEYSET_STORE, JSON.stringify(record));

  // Only once the record is safely written; a failure here leaves a readable
  // duplicate, not a broken key.
  await Promise.all(
    [LEGACY_KEY_STORE, LEGACY_SALT_STORE, LEGACY_KDF_STORE].map((item) =>
      SecureStore.deleteItemAsync(item).catch(() => undefined),
    ),
  );
}

/** Set (or replace) the passphrase. Existing backup files keep their own salt and scheme. */
export async function setBackupPassphrase(passphrase: string, onProgress?: (fraction: number) => void): Promise<void> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(passphrase, salt, DEFAULT_KDF, onProgress);
  await storeBackupKey({ key, salt, kdf: DEFAULT_KDF });
}

/** True when `passphrase` is the one the stored key was derived from. */
export async function checkBackupPassphrase(passphrase: string): Promise<boolean> {
  const stored = await loadBackupKey();
  if (!stored) return false;
  return equalBytes(await deriveKey(passphrase, stored.salt, stored.kdf), stored.key);
}
