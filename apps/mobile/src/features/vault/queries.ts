import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { credentials, type Credential } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import {
  fromBase64,
  openSecret,
  randomBytes,
  SALT_BYTES,
  sealSecret,
  toBase64,
  deriveKey,
  DEFAULT_KDF,
} from '@/lib/crypto';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { deriveVaultKey, loadVaultKey, replaceVaultKeyset, vaultKeysetRecord, type VaultKeyset } from './keys';
import { credentialSearchText } from './logic';

/*
 * Logins for the systems the owner uses: prescription portals, insurance,
 * hospital HIS.
 *
 * The password is the only field that is encrypted, and it is encrypted before
 * it ever reaches the database. Everything else — the system's name, the
 * username, the notes — is ordinary data, searchable and visible, because a
 * vault nobody can search is a vault nobody uses. The secret is bound to its
 * own row through the AAD, so a ciphertext copied into another row will not
 * open.
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
  /** Plaintext; sealed here and never stored as typed. */
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

/** The vault has to be unlocked before a secret can be written or read. */
export class VaultLockedError extends Error {
  constructor() {
    super('گاوصندوق قفل است');
    this.name = 'VaultLockedError';
  }
}

/** What binds a ciphertext to its row: the id and the key generation. */
const secretAad = (id: string, keyVersion: number) => new TextEncoder().encode(`credential:${id}:v${keyVersion}`);

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

async function sealFor(id: string, secret: string, keyVersion: number) {
  const key = await loadVaultKey();
  if (!key) throw new VaultLockedError();
  const { nonce, sealed } = await sealSecret(key, new TextEncoder().encode(secret), secretAad(id, keyVersion));
  return { secretNonce: toBase64(nonce), secretCipher: toBase64(sealed), keyVersion };
}

export async function createCredential(input: CredentialInput): Promise<string> {
  const record = await vaultKeysetRecord();
  if (!record) throw new VaultLockedError();

  const id = newId();
  const row = values(input);
  const secret = input.secret?.trim();
  const sealedParts = secret ? await sealFor(id, secret, record.keyVersion) : {};

  await db.insert(credentials).values({
    id,
    ...stamps(),
    ...row,
    ...sealedParts,
    keyVersion: record.keyVersion,
    // The secret is never part of the index — searching must not be a way to
    // confirm a password by trying it in the search box.
    searchText: credentialSearchText(row),
  });
  await audit('vault.created', { summary: row.systemName });
  return id;
}

export async function updateCredential(id: string, patch: Partial<CredentialInput>): Promise<void> {
  const current = (await credentialQuery(id))[0];
  if (!current) throw new Error(`Credential ${id} not found`);
  const record = await vaultKeysetRecord();
  if (!record) throw new VaultLockedError();

  const row = values({ ...current, ...patch } as CredentialInput);
  // `secret: undefined` means "leave the stored one alone"; an empty string
  // means "remove it".
  const secretGiven = patch.secret !== undefined;
  const secret = patch.secret?.trim();
  const sealedParts = secretGiven
    ? secret
      ? await sealFor(id, secret, record.keyVersion)
      : { secretCipher: null, secretNonce: null }
    : {};

  await db
    .update(credentials)
    .set({ ...row, ...sealedParts, searchText: credentialSearchText(row), ...touch() })
    .where(eq(credentials.id, id));
  await audit('vault.updated', { summary: row.systemName });
}

/**
 * Decrypt one password.
 *
 * Audited without the value: knowing that a credential was revealed at 02:10
 * is useful; knowing what it was would defeat the vault.
 */
export async function revealSecret(id: string): Promise<string | null> {
  const row = (await credentialQuery(id))[0];
  if (!row?.secretCipher || !row.secretNonce) return null;
  const key = await loadVaultKey();
  if (!key) throw new VaultLockedError();

  const opened = await openSecret(
    key,
    { nonce: fromBase64(row.secretNonce), sealed: fromBase64(row.secretCipher) },
    secretAad(row.id, row.keyVersion),
  );
  await db.update(credentials).set({ lastUsedAt: new Date() }).where(eq(credentials.id, id));
  await audit('vault.revealed', { summary: row.systemName });
  return new TextDecoder().decode(opened);
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

/**
 * Change the vault passphrase: every stored secret is opened with the old key
 * and sealed again with the new one, then the keyset is replaced.
 *
 * Order matters. The rows are written first and the keyset last, so an
 * interruption leaves rows sealed with the old key and a keyset that still
 * describes it — recoverable. Replacing the keyset first would leave secrets
 * nothing could open.
 */
export async function rekeyVault(
  currentPassphrase: string,
  nextPassphrase: string,
  onProgress?: (fraction: number) => void,
): Promise<{ rekeyed: number }> {
  const record: VaultKeyset | null = await vaultKeysetRecord();
  if (!record) throw new VaultLockedError();

  const { key: oldKey, matches } = await deriveVaultKey(currentPassphrase, record, (f) => onProgress?.(f * 0.4));
  if (!matches) throw new Error('رمز فعلی درست نیست');

  const salt = randomBytes(SALT_BYTES);
  const newKey = await deriveKey(nextPassphrase, salt, DEFAULT_KDF, (f) => onProgress?.(0.4 + f * 0.4));
  const nextVersion = record.keyVersion + 1;

  const rows = await db.select().from(credentials);
  let rekeyed = 0;
  for (const row of rows) {
    if (!row.secretCipher || !row.secretNonce) continue;
    const plain = await openSecret(
      oldKey,
      { nonce: fromBase64(row.secretNonce), sealed: fromBase64(row.secretCipher) },
      secretAad(row.id, row.keyVersion),
    );
    const { nonce, sealed } = await sealSecret(newKey, plain, secretAad(row.id, nextVersion));
    await db
      .update(credentials)
      .set({ secretCipher: toBase64(sealed), secretNonce: toBase64(nonce), keyVersion: nextVersion })
      .where(eq(credentials.id, row.id));
    rekeyed += 1;
  }

  await replaceVaultKeyset(newKey, salt, nextVersion);
  onProgress?.(1);
  await audit('vault.rekeyed', { detail: { rekeyed, keyVersion: nextVersion } });
  return { rekeyed };
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
