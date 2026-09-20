import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { credentials } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { credentialSearchText, daysUntilExpiry, secretHint } from './logic';
import { createCredential, credentialSecret, credentialsQuery, deleteCredential, updateCredential } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

/*
 * A list of working passwords, not a vault: no passphrase, no unlock, no key.
 * What is still enforced is that the password never reaches the search index,
 * and that it is stored exactly as typed.
 */

let t: TestDatabase;

const SECRET = 'Sup3r!Secret-پسورد';

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

const rawRow = async (id: string) => (await t.db.select().from(credentials)).find((r) => r.id === id);

describe('saved logins', () => {
  it('stores a password and gives it straight back', async () => {
    const id = await createCredential({
      systemName: 'سامانه‌ی نسخه',
      username: 'shayan',
      secret: SECRET,
      category: 'prescription',
    });

    const row = (await rawRow(id))!;
    expect(row.secretText).toBe(SECRET);
    expect(credentialSecret(row)).toEqual({ text: SECRET, sealed: false });
  });

  it('never puts the password in the search index', async () => {
    const id = await createCredential({ systemName: 'سامانه‌ی نسخه تأمین اجتماعی', username: 'sh.ay', secret: SECRET });

    expect((await rawRow(id))?.searchText ?? '').not.toContain('Sup3r');
    expect((await credentialsQuery({ search: 'تامين' })).length).toBe(1);
    expect((await credentialsQuery({ search: 'sh.ay' })).length).toBe(1);
    // Searching for the password finds nothing: the box is not an oracle.
    expect((await credentialsQuery({ search: SECRET })).length).toBe(0);
  });

  // A password is whatever the other system accepts, spaces included.
  it('stores it exactly as typed', async () => {
    const padded = '  two spaces each side  ';
    const id = await createCredential({ systemName: 'HIS', secret: padded });
    expect((await rawRow(id))?.secretText).toBe(padded);

    await updateCredential(id, { secret: ' \t' });
    expect((await rawRow(id))?.secretText).toBe(' \t');
  });

  it('leaves the password alone on an edit that does not mention it, and clears it when asked', async () => {
    const id = await createCredential({ systemName: 'بیمه', secret: SECRET });

    await updateCredential(id, { username: 'dr.shayan' });
    expect((await rawRow(id))?.secretText).toBe(SECRET);

    await updateCredential(id, { secret: '' });
    expect((await rawRow(id))?.secretText).toBeNull();
  });

  /*
   * Rows written by the encrypted version of this screen hold ciphertext this
   * build has no key for. Showing an empty field would read as "the password
   * is gone" when it is "this app can no longer open it".
   */
  it('says when a row is left over from the encrypted version', async () => {
    const id = await createCredential({ systemName: 'قدیمی' });
    await t.db.update(credentials).set({ secretCipher: 'sealed-base64' }).where(eq(credentials.id, id));

    expect(credentialSecret((await rawRow(id))!)).toEqual({ text: null, sealed: true });
  });

  it('soft-deletes, like every other row', async () => {
    const id = await createCredential({ systemName: 'قدیمی' });
    await deleteCredential(id);
    expect(await credentialsQuery()).toHaveLength(0);
    expect((await rawRow(id))?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('helpers', () => {
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
