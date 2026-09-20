import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

import { credentials } from '@/db/schema';
import { fromBase64, randomBytes, toBase64 } from '@/lib/crypto';
import { useTestDatabase } from '@/test/db-client';
import { resetSecureStore, seedSecureStore } from '@/test/mocks/secure-store';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createVault, forgetVaultKey, isVaultConfigured, loadVaultKey, unlockVault, vaultKeysetRecord } from './keys';
import { credentialSearchText, daysUntilExpiry, secretHint } from './logic';
import {
  createCredential,
  credentialsQuery,
  deleteCredential,
  finishPendingRekey,
  rekeyVault,
  revealSecret,
  updateCredential,
  VaultLockedError,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('expo-secure-store', () => jest.requireActual('@/test/mocks/secure-store'));

let t: TestDatabase;

const PASSPHRASE = 'yek ramz-e khoob 1404';
const SECRET = 'Sup3r!Secret-پسورد';

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetSecureStore();
});

const rawRow = async (id: string) => (await t.db.select().from(credentials)).find((r) => r.id === id);

describe('the vault key', () => {
  it('is set once, and the salt lives in the database so a restore can still open it', async () => {
    expect(await isVaultConfigured()).toBe(false);
    await createVault(PASSPHRASE);

    const record = await vaultKeysetRecord();
    expect(record?.keyVersion).toBe(1);
    // The salt travels with the data (it is an ordinary setting, not a
    // `backup.` one); without it the same passphrase would derive a different
    // key on a new phone and every secret would be lost.
    expect(fromBase64(record!.salt)).toHaveLength(16);
    await expect(createVault('something else')).rejects.toThrow();
  });

  it('accepts the right passphrase and refuses a wrong one', async () => {
    await createVault(PASSPHRASE);
    await forgetVaultKey();

    expect(await unlockVault('not the passphrase')).toBe(false);
    expect(await unlockVault(PASSPHRASE)).toBe(true);
  });

  /*
   * After a restore the database is another dataset — another salt, another
   * check value — while the Keystore still holds the key derived here from the
   * old one. Measuring that key's length says it is fine; it is not, and a
   * password sealed with it would be unreadable the moment the vault was
   * opened properly.
   */
  it('will not use a key left over from the dataset that was replaced', async () => {
    await createVault(PASSPHRASE);
    const strandedKey = (await SecureStore.getItemAsync('medos.vault.key'))!;

    // A restore: new database, same phone, same Keystore entry.
    t = useTestDatabase(await createTestDatabase());
    await createVault('the other phone’s passphrase');
    seedSecureStore({ 'medos.vault.key': strandedKey });

    expect(await loadVaultKey()).toBeNull();
    await expect(createCredential({ systemName: 'HIS', secret: SECRET })).rejects.toBeInstanceOf(VaultLockedError);

    // And the vault's own passphrase still opens it.
    expect(await unlockVault('the other phone’s passphrase')).toBe(true);
    expect(await loadVaultKey()).not.toBeNull();
  });
});

describe('credentials', () => {
  beforeEach(async () => {
    await createVault(PASSPHRASE);
  });

  it('stores the password as ciphertext and gives it back only when asked', async () => {
    const id = await createCredential({
      systemName: 'سامانه‌ی نسخه',
      username: 'shayan',
      secret: SECRET,
      category: 'prescription',
    });

    const row = await rawRow(id);
    // Nothing readable in the row, and nothing of the secret in the index.
    expect(row?.secretCipher).toBeTruthy();
    expect(row?.secretCipher).not.toContain(SECRET);
    expect(row?.searchText ?? '').not.toContain('Sup3r');
    expect(row?.keyVersion).toBe(1);

    expect(await revealSecret(id)).toBe(SECRET);
    expect((await rawRow(id))?.lastUsedAt).toBeInstanceOf(Date);
  });

  it('will not seal or open anything while the vault is locked', async () => {
    const id = await createCredential({ systemName: 'HIS', secret: SECRET });
    await forgetVaultKey();

    await expect(revealSecret(id)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(createCredential({ systemName: 'X', secret: 'y' })).rejects.toBeInstanceOf(VaultLockedError);

    expect(await unlockVault(PASSPHRASE)).toBe(true);
    expect(await revealSecret(id)).toBe(SECRET);
  });

  // A password is whatever the other system accepts. Trimming it was the app
  // deciding that the spaces the user typed were not part of it.
  it('stores a password exactly as typed, spaces and all', async () => {
    const padded = '  two spaces each side  ';
    const id = await createCredential({ systemName: 'HIS', secret: padded });
    expect(await revealSecret(id)).toBe(padded);

    await updateCredential(id, { secret: ' \t' });
    expect(await revealSecret(id)).toBe(' \t');
  });

  it('leaves the stored password alone on an edit that does not mention it, and clears it when asked', async () => {
    const id = await createCredential({ systemName: 'بیمه', secret: SECRET });

    await updateCredential(id, { username: 'dr.shayan' });
    expect(await revealSecret(id)).toBe(SECRET);

    await updateCredential(id, { secret: '' });
    expect((await rawRow(id))?.secretCipher).toBeNull();
    expect(await revealSecret(id)).toBeNull();
  });

  it('refuses a ciphertext moved to another row', async () => {
    const mine = await createCredential({ systemName: 'A', secret: SECRET });
    const other = await createCredential({ systemName: 'B', secret: 'another' });
    const stolen = await rawRow(mine);

    // The row id is part of the AAD, so the same key cannot open it here.
    await t.db
      .update(credentials)
      .set({ secretCipher: stolen!.secretCipher, secretNonce: stolen!.secretNonce })
      .where(eq(credentials.id, other));
    await expect(revealSecret(other)).rejects.toThrow();
  });

  it('is searchable by everything except the password', async () => {
    await createCredential({ systemName: 'سامانه‌ی نسخه تأمین اجتماعی', username: 'sh.ay', secret: SECRET });
    expect((await credentialsQuery({ search: 'تامين' })).length).toBe(1);
    expect((await credentialsQuery({ search: 'sh.ay' })).length).toBe(1);
    expect((await credentialsQuery({ search: SECRET })).length).toBe(0);
  });

  it('soft-deletes, like every other clinical row', async () => {
    const id = await createCredential({ systemName: 'قدیمی' });
    await deleteCredential(id);
    expect(await credentialsQuery()).toHaveLength(0);
    expect((await rawRow(id))?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('changing the vault passphrase', () => {
  it('re-seals every secret and then replaces the keyset', async () => {
    await createVault(PASSPHRASE);
    const first = await createCredential({ systemName: 'A', secret: SECRET });
    const second = await createCredential({ systemName: 'B', secret: 'second' });
    const before = await rawRow(first);

    await expect(rekeyVault('wrong', 'new one')).rejects.toThrow();

    const { rekeyed } = await rekeyVault(PASSPHRASE, 'a different passphrase');
    expect(rekeyed).toBe(2);

    const after = await rawRow(first);
    expect(after?.keyVersion).toBe(2);
    expect(after?.secretCipher).not.toBe(before?.secretCipher);
    expect((await vaultKeysetRecord())?.keyVersion).toBe(2);

    // Both secrets survive, and the old passphrase no longer opens the vault.
    expect(await revealSecret(first)).toBe(SECRET);
    expect(await revealSecret(second)).toBe('second');
    await forgetVaultKey();
    expect(await unlockVault(PASSPHRASE)).toBe(false);
    expect(await unlockVault('a different passphrase')).toBe(true);
  });

  /*
   * The change is three writes to two stores and cannot be atomic. What it can
   * be is recoverable: the new key and its salt are written down before a
   * single row is touched, so a vault caught halfway has both generations on
   * the phone and every password still opens. Here the second row's ciphertext
   * is damaged, which stops the loop exactly where a killed app would.
   */
  it('loses nothing when it is interrupted, and carries on afterwards', async () => {
    await createVault(PASSPHRASE);
    const first = await createCredential({ systemName: 'A', secret: SECRET });
    const second = await createCredential({ systemName: 'B', secret: 'second' });
    const intact = (await rawRow(second))!.secretCipher;

    await t.db
      .update(credentials)
      .set({ secretCipher: toBase64(randomBytes(32)) })
      .where(eq(credentials.id, second));
    await expect(rekeyVault(PASSPHRASE, 'a different passphrase')).rejects.toThrow();

    // Half re-sealed, and the half that was re-sealed is still readable —
    // with the old code its key existed only in a local variable.
    expect((await rawRow(first))?.keyVersion).toBe(2);
    expect((await vaultKeysetRecord())?.keyVersion).toBe(1);
    expect(await revealSecret(first)).toBe(SECRET);

    await t.db.update(credentials).set({ secretCipher: intact }).where(eq(credentials.id, second));
    const { rekeyed, remaining } = await finishPendingRekey();
    expect({ rekeyed, remaining }).toEqual({ rekeyed: 1, remaining: 0 });

    expect((await vaultKeysetRecord())?.keyVersion).toBe(2);
    expect(await revealSecret(first)).toBe(SECRET);
    expect(await revealSecret(second)).toBe('second');
    await forgetVaultKey();
    expect(await unlockVault('a different passphrase')).toBe(true);
  });

  it('does nothing when no change is in flight', async () => {
    await createVault(PASSPHRASE);
    expect(await finishPendingRekey()).toEqual({ rekeyed: 0, remaining: 0 });
  });
});

describe('vault helpers', () => {
  it('never indexes a secret', () => {
    expect(credentialSearchText({ systemName: 'HIS', username: 'u' })).toContain('his');
  });

  it('hints at a weak password without pretending to measure it', () => {
    expect(secretHint('abc')).toBe('کوتاه است');
    expect(secretHint('abcdefghij')).toBe('می‌شود قوی‌ترش کرد');
    expect(secretHint('Abcdefgh1!')).toBeNull();
    expect(secretHint('')).toBeNull();
  });

  it('counts the days to an expiry', () => {
    const now = new Date('2026-01-01T10:00:00');
    expect(daysUntilExpiry(new Date('2026-01-08T10:00:00'), now)).toBe(7);
    expect(daysUntilExpiry(null, now)).toBeNull();
  });
});
