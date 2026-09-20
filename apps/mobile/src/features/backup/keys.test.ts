import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_KDF, KEY_BYTES, SALT_BYTES, toBase64 } from '@/lib/crypto';
import { resetSecureStore, secureStoreKeys, seedSecureStore } from '@/test/mocks/secure-store';

import { hasBackupKey, loadBackupKey, storeBackupKey } from './keys';

jest.mock('expo-secure-store', () => jest.requireActual('@/test/mocks/secure-store'));

const KEY = new Uint8Array(KEY_BYTES).fill(7);
const SALT = new Uint8Array(SALT_BYTES).fill(9);

beforeEach(() => {
  resetSecureStore();
});

describe('the stored backup key', () => {
  /*
   * Key, salt and KDF used to be three separate writes. Interrupted between
   * them — the phone locking mid-change is enough — the next backup would be
   * sealed with a new key against an old salt, and nothing could ever derive
   * that key again. Every such backup file is permanently unreadable.
   */
  it('is one record, so a passphrase change cannot half-happen', async () => {
    await storeBackupKey({ key: KEY, salt: SALT, kdf: DEFAULT_KDF });
    expect(secureStoreKeys()).toEqual(['medos.backup.keyset']);

    const loaded = await loadBackupKey();
    expect(loaded?.key).toEqual(KEY);
    expect(loaded?.salt).toEqual(SALT);
    expect(loaded?.kdf).toEqual(DEFAULT_KDF);
    expect(await hasBackupKey()).toBe(true);
  });

  it('reads a key written by an earlier build and moves it into the record', async () => {
    seedSecureStore({
      'medos.backup.key': toBase64(KEY),
      'medos.backup.salt': toBase64(SALT),
      'medos.backup.kdf': JSON.stringify({ log2N: 15, r: 8, p: 1 }),
    });

    const loaded = await loadBackupKey();
    expect(loaded?.key).toEqual(KEY);
    // No `scheme` was stored before schemes existed; those keys are scheme 1,
    // and calling them anything else would make old backups undecryptable.
    expect(loaded?.kdf.scheme).toBe(1);
    expect(secureStoreKeys()).toEqual(['medos.backup.keyset']);

    // Still the same key after the move.
    expect((await loadBackupKey())?.key).toEqual(KEY);
  });

  it('reports no key rather than a broken one', async () => {
    expect(await loadBackupKey()).toBeNull();

    seedSecureStore({ 'medos.backup.keyset': '{ not json' });
    expect(await loadBackupKey()).toBeNull();

    // A key of the wrong length, or KDF parameters this app would never write.
    resetSecureStore();
    seedSecureStore({
      'medos.backup.keyset': JSON.stringify({
        v: 1,
        key: toBase64(new Uint8Array(8)),
        salt: toBase64(SALT),
        kdf: DEFAULT_KDF,
      }),
    });
    expect(await loadBackupKey()).toBeNull();

    resetSecureStore();
    seedSecureStore({
      'medos.backup.keyset': JSON.stringify({
        v: 1,
        key: toBase64(KEY),
        salt: toBase64(SALT),
        kdf: { log2N: 30, r: 8, p: 1, scheme: 1 },
      }),
    });
    expect(await loadBackupKey()).toBeNull();

    // An incomplete legacy set is not a key either.
    resetSecureStore();
    seedSecureStore({ 'medos.backup.key': toBase64(KEY) });
    expect(await loadBackupKey()).toBeNull();
    expect(await hasBackupKey()).toBe(false);
  });
});
