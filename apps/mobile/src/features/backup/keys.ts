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
 */

const KEY_STORE = 'medos.backup.key';
const SALT_STORE = 'medos.backup.salt';
const KDF_STORE = 'medos.backup.kdf';

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

export async function hasBackupKey(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_STORE)) != null;
}

export async function loadBackupKey(): Promise<BackupKey | null> {
  const [key, salt, kdf] = await Promise.all([
    SecureStore.getItemAsync(KEY_STORE),
    SecureStore.getItemAsync(SALT_STORE),
    SecureStore.getItemAsync(KDF_STORE),
  ]);
  if (!key || !salt || !kdf) return null;
  try {
    const parsed = storedKdf.parse(JSON.parse(kdf));
    const decodedKey = fromBase64(key);
    const decodedSalt = fromBase64(salt);
    if (decodedKey.length !== KEY_BYTES || decodedSalt.length !== SALT_BYTES) return null;
    return { key: decodedKey, salt: decodedSalt, kdf: parsed };
  } catch {
    return null;
  }
}

export async function storeBackupKey({ key, salt, kdf }: BackupKey): Promise<void> {
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key));
  await SecureStore.setItemAsync(SALT_STORE, toBase64(salt));
  await SecureStore.setItemAsync(KDF_STORE, JSON.stringify(kdf));
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
