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

import {
  commitNextKeyset,
  deriveVaultKey,
  discardPendingKeyset,
  loadVaultKey,
  pendingKeysetRecord,
  stageNextKeyset,
  vaultKeyForVersion,
  vaultKeysetRecord,
  type VaultKeyset,
} from './keys';
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
  // Never trimmed: a password is whatever the other system accepts, spaces
  // included, and an empty one means there is none to store.
  const secret = input.secret;
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
  const secret = patch.secret;
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
  // By the row's own generation, not the vault's: a passphrase change that was
  // interrupted leaves both, and this row knows which one sealed it.
  const key = await vaultKeyForVersion(row.keyVersion);
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
 * Re-seal every stored secret with a key of a newer generation.
 *
 * Rows are taken one at a time and each is committed on its own, so an
 * interruption leaves a vault half in each generation rather than a
 * half-written row. That is only survivable because both keys are already on
 * the phone before this runs: see `stageNextKeyset`. A row whose own key is
 * not available is counted and skipped, never overwritten.
 */
async function resealRows(
  keyFor: (version: number) => Promise<Uint8Array | null>,
  newKey: Uint8Array,
  nextVersion: number,
  onProgress?: (fraction: number) => void,
): Promise<{ rekeyed: number; skipped: number }> {
  const rows = await db.select().from(credentials);
  let rekeyed = 0;
  let skipped = 0;
  let seen = 0;
  for (const row of rows) {
    seen += 1;
    onProgress?.(seen / Math.max(rows.length, 1));
    // Soft-deleted rows are re-sealed too: they are still restorable, and a
    // password nobody can open is not a deletion anyone asked for.
    if (!row.secretCipher || !row.secretNonce || row.keyVersion === nextVersion) continue;
    const oldKey = await keyFor(row.keyVersion);
    if (!oldKey) {
      skipped += 1;
      continue;
    }
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
  return { rekeyed, skipped };
}

/**
 * Carry on a passphrase change that was interrupted.
 *
 * Safe to call at any time: without a pending keyset it does nothing. The new
 * keyset is only made the vault's own when every secret has reached it —
 * committing earlier would lock the stragglers out, since the key that sealed
 * them is the one being replaced.
 */
export async function finishPendingRekey(onProgress?: (fraction: number) => void): Promise<{
  rekeyed: number;
  remaining: number;
}> {
  const pending = await pendingKeysetRecord();
  if (!pending) return { rekeyed: 0, remaining: 0 };

  const record = await vaultKeysetRecord();
  if (record && record.keyVersion >= pending.keyVersion) {
    // The change went through; this is only its marker left behind.
    await discardPendingKeyset();
    return { rekeyed: 0, remaining: 0 };
  }

  const newKey = await vaultKeyForVersion(pending.keyVersion);
  if (!newKey) {
    const rows = await db.select().from(credentials);
    return { rekeyed: 0, remaining: rows.filter((r) => r.secretCipher && r.keyVersion !== pending.keyVersion).length };
  }

  const { rekeyed, skipped } = await resealRows(vaultKeyForVersion, newKey, pending.keyVersion, onProgress);
  if (skipped === 0) {
    await commitNextKeyset();
    await audit('vault.rekeyed', { detail: { rekeyed, keyVersion: pending.keyVersion, resumed: true } });
  }
  return { rekeyed, remaining: skipped };
}

/**
 * Change the vault passphrase.
 *
 * The new key and its salt are written down first, then every secret is opened
 * with the old key and sealed again with the new one, and only then does the
 * new keyset become the vault's own. Nothing here is atomic — it cannot be,
 * since the Keystore and the database are two stores — so the order is chosen
 * so that every intermediate state is one both keys can be recovered from.
 * `finishPendingRekey` picks up whichever one the app was killed in.
 */
export async function rekeyVault(
  currentPassphrase: string,
  nextPassphrase: string,
  onProgress?: (fraction: number) => void,
): Promise<{ rekeyed: number }> {
  await finishPendingRekey();

  const record: VaultKeyset | null = await vaultKeysetRecord();
  if (!record) throw new VaultLockedError();

  const { key: oldKey, matches } = await deriveVaultKey(currentPassphrase, record, (f) => onProgress?.(f * 0.4));
  if (!matches) throw new Error('رمز فعلی درست نیست');

  const salt = randomBytes(SALT_BYTES);
  const newKey = await deriveKey(nextPassphrase, salt, DEFAULT_KDF, (f) => onProgress?.(0.4 + f * 0.4));
  const nextVersion = record.keyVersion + 1;
  await stageNextKeyset(newKey, salt, nextVersion);

  // The old key came from the typed passphrase, so this works on a vault that
  // was locked; anything sealed at another generation goes through the store.
  const keyFor = async (version: number) => (version === record.keyVersion ? oldKey : vaultKeyForVersion(version));
  const { rekeyed, skipped } = await resealRows(keyFor, newKey, nextVersion, (f) => onProgress?.(0.8 + f * 0.2));
  if (skipped > 0) {
    throw new Error(`${skipped} رمز با کلید دیگری قفل است و باز نشد؛ تغییر رمز ناتمام ماند و چیزی از بین نرفت.`);
  }

  await commitNextKeyset();
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
