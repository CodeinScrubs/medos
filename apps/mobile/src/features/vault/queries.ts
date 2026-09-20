import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { credentials, type Credential } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { credentialSearchText } from './logic';

/*
 * Passwords for the systems the owner uses: prescription portals, insurance,
 * hospital HIS.
 *
 * A list, not a vault. It replaces a note in Samsung Notes, and the point of
 * it is that everything is in one place, sorted and searchable, with no
 * passphrase and no unlock step. The password is stored as typed.
 *
 * The one rule kept from the encrypted design: the password is **never** part
 * of `searchText`. An index that contained it would leak it into search
 * results and into every place a match is highlighted, for no gain — nobody
 * searches for a password they already have.
 */

const alive = isNull(credentials.deletedAt);

export type CredentialFilter = {
  search?: string;
  category?: Credential['category'] | null;
  ownerKind?: Credential['ownerKind'] | null;
};

export function credentialsQuery(filter: CredentialFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.category) clauses.push(eq(credentials.category, filter.category));
  if (filter.ownerKind) clauses.push(eq(credentials.ownerKind, filter.ownerKind));
  clauses.push(...matchesSearch(credentials.searchText, filter.search));
  return db
    .select()
    .from(credentials)
    .where(and(...clauses))
    .orderBy(desc(credentials.starred), asc(credentials.systemName));
}

export function credentialQuery(id: string) {
  return db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
}

export type CredentialInput = {
  systemName: string;
  category?: Credential['category'];
  url?: string | null;
  username?: string | null;
  /** Stored exactly as typed, spaces included. */
  secret?: string | null;
  secondFactorNotes?: string | null;
  ownerKind?: Credential['ownerKind'];
  ownerName?: string | null;
  ownerConsentNote?: string | null;
  notes?: string | null;
  tags?: string[];
  expiresAt?: Date | null;
  starred?: boolean;
};

function values(input: CredentialInput) {
  return {
    systemName: input.systemName.trim(),
    category: input.category ?? ('other' as const),
    url: input.url?.trim() || null,
    username: input.username?.trim() || null,
    secondFactorNotes: input.secondFactorNotes?.trim() || null,
    ownerKind: input.ownerKind ?? ('self' as const),
    ownerName: input.ownerName?.trim() || null,
    ownerConsentNote: input.ownerConsentNote?.trim() || null,
    notes: input.notes?.trim() || null,
    tags: input.tags ?? [],
    expiresAt: input.expiresAt ?? null,
    starred: input.starred ?? false,
  };
}

export async function createCredential(input: CredentialInput): Promise<string> {
  const id = newId();
  const row = values(input);
  await db.insert(credentials).values({
    id,
    ...stamps(),
    ...row,
    // Never trimmed: a password is whatever the other system accepts, and the
    // spaces at its edges may be part of it.
    secretText: input.secret || null,
    searchText: credentialSearchText(row),
  });
  await audit('vault.created', { summary: row.systemName });
  return id;
}

export async function updateCredential(id: string, patch: Partial<CredentialInput>): Promise<void> {
  const current = (await credentialQuery(id))[0];
  if (!current) throw new Error(`Credential ${id} not found`);

  const row = values({ ...current, ...patch } as CredentialInput);
  // `secret: undefined` means "leave the stored one alone"; an empty string
  // means "remove it".
  const secretGiven = patch.secret !== undefined;

  await db
    .update(credentials)
    .set({
      ...row,
      ...(secretGiven ? { secretText: patch.secret || null } : {}),
      searchText: credentialSearchText(row),
      ...touch(),
    })
    .where(eq(credentials.id, id));
  await audit('vault.updated', { summary: row.systemName });
}

/**
 * The stored password.
 *
 * Rows written by the encrypted version of this screen hold ciphertext this
 * build has no key for. Rather than showing an empty field as if the password
 * were lost, the caller is told which of the two it is.
 */
export function credentialSecret(row: Credential): { text: string | null; sealed: boolean } {
  if (row.secretText) return { text: row.secretText, sealed: false };
  return { text: null, sealed: Boolean(row.secretCipher) };
}

export async function markCredentialUsed(id: string): Promise<void> {
  await db.update(credentials).set({ lastUsedAt: new Date() }).where(eq(credentials.id, id));
}

export async function setCredentialStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(credentials)
    .set({ starred, ...touch() })
    .where(eq(credentials.id, id));
}

export async function deleteCredential(id: string): Promise<void> {
  const current = (await credentialQuery(id))[0];
  await db.update(credentials).set(softDelete()).where(eq(credentials.id, id));
  await audit('vault.deleted', { summary: current?.systemName });
}

export async function reindexCredentials(): Promise<number> {
  const rows = await db.select().from(credentials);
  let changed = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const next = credentialSearchText(row);
      if (next === row.searchText) continue;
      tx.update(credentials).set({ searchText: next }).where(eq(credentials.id, row.id)).run();
      changed += 1;
    }
  });
  return changed;
}
