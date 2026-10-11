import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, credentials, workspaceFormDrafts } from '@/db/schema';
import {
  publishWorkspaceDraft,
  saveWorkspaceDraft,
  workspaceDraftsQuery,
  workspaceFormSeed,
} from '@/features/workspace-forms/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { FormDraftConflict, UnsupportedFormDraft } from '@/lib/form-document';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { credentialExpiry, credentialFormCodec } from './form-draft';
import { credentialFormPort, credentialFormQuery, describeCredentialFields } from './form-draft-queries';
import { createCredential, credentialQuery, credentialSecret, credentialsQuery, updateCredential } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
let t: TestDatabase;
let generation: number;
const now = new Date('2026-01-02T10:00:00.123Z');
const secret = ' \tSynthetic-P@ssword\n  ';
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  generation = datasetGeneration();
});
const raw = () => t.db.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, 'raw-credential')).get()!;
async function document(id: string | null = null) {
  return workspaceFormSeed(credentialFormPort, (await credentialFormQuery(id))[0]!, id, now).document;
}
const save = (value: Awaited<ReturnType<typeof document>>, revision = 0) =>
  saveWorkspaceDraft(credentialFormPort, 'raw-credential', value, revision, generation);
const publish = (id: string | null, revision = 1) =>
  publishWorkspaceDraft(credentialFormPort, 'raw-credential', id, revision, now, generation);

describe('credential raw documents and atomic publication on migrated SQLite', () => {
  it('watches both tables and stores a partial secret/date/tags without creating a credential', async () => {
    expect(tablesOf(credentialFormQuery(null)).sort()).toEqual(['credentials', 'workspace_form_drafts']);
    const value = await document();
    Object.assign(value.fields, { secret, expiresText: '1404/13/', notes: ' \nunfinished  ', tags: 'a، ،b, ' });
    await save(value);
    expect(credentialFormCodec.decode(raw().body)).toEqual(value);
    expect(t.db.select().from(credentials).all()).toEqual([]);
    await expect(publish(null)).rejects.toThrow();
    expect(raw()).toMatchObject({ revision: 1, committedId: null, deletedAt: null });
  });
  it('publishes exact whitespace once, records only ids, and cannot revive a retired draft', async () => {
    const value = await document();
    Object.assign(value.fields, { systemName: ' Synthetic portal ', secret, tags: ' a، , b ' });
    await save(value);
    const id = await publish(null);
    expect(await publish(null)).toBe(id);
    const row = (await credentialQuery(id))[0]!;
    expect(row).toMatchObject({ systemName: 'Synthetic portal', secretText: secret, tags: ['a', 'b'] });
    expect(t.db.select().from(credentials).all()).toHaveLength(1);
    expect(await credentialsQuery({ search: 'Synthetic-P@ssword' })).toEqual([]);
    expect(t.db.select().from(auditLog).all()).toHaveLength(2);
    const audits = t.db.select().from(auditLog).all();
    expect(audits.every((entry) => entry.entityId === id && entry.summary === null)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(secret);
    await expect(save(value, 1)).rejects.toThrow(FormDraftConflict);
  });
  it('preserves the exact existing expiry time and legacy secret on unrelated edits', async () => {
    const expiresAt = new Date('2026-09-16T12:34:56.789Z');
    const id = await createCredential({ systemName: 'Synthetic legacy', expiresAt });
    t.db
      .update(credentials)
      .set({ secretCipher: 'synthetic-cipher', secretNonce: 'synthetic-nonce', keyVersion: 8 })
      .where(eq(credentials.id, id))
      .run();
    const value = await document(id);
    expect(credentialExpiry(value.fields, now)).toEqual(expiresAt);
    value.fields.username = 'synthetic-user';
    await save(value);
    await publish(id);
    expect((await credentialQuery(id))[0]).toMatchObject({
      expiresAt,
      secretCipher: 'synthetic-cipher',
      secretNonce: 'synthetic-nonce',
      keyVersion: 8,
    });
  });
  it.each(['clear', 'replace'] as const)(
    'uses explicit %s intent without resurrecting a legacy secret',
    async (action) => {
      const id = await createCredential({ systemName: 'Synthetic legacy' });
      t.db
        .update(credentials)
        .set({ secretCipher: 'synthetic-cipher', secretNonce: 'synthetic-nonce' })
        .where(eq(credentials.id, id))
        .run();
      const value = await document(id);
      if (action === 'clear') value.fields.clearSecret = true;
      else value.fields.secret = secret;
      await save(value);
      await publish(id);
      const row = (await credentialQuery(id))[0]!;
      expect(row.secretCipher).toBeNull();
      expect(row.secretNonce).toBeNull();
      expect(credentialSecret(row)).toEqual({ text: action === 'clear' ? null : secret, sealed: false });
    },
  );
  it('refuses contradictory clear/new-secret input without touching the raw receipt or original', async () => {
    const id = await createCredential({ systemName: 'Synthetic contradictory', secret: 'Original synthetic' });
    const original = (await credentialQuery(id))[0]!;
    const value = await document(id);
    Object.assign(value.fields, { secret, clearSecret: true });
    await save(value);
    await expect(publish(id)).rejects.toThrow();
    expect((await credentialQuery(id))[0]).toEqual(original);
    expect(raw()).toMatchObject({ revision: 1, committedId: null, deletedAt: null });
  });
  it('never publishes a previous parsed expiry when the visible date is invalid', async () => {
    const id = await createCredential({ systemName: 'Synthetic expiry', expiresAt: new Date('2026-09-16T12:34:56Z') });
    const original = (await credentialQuery(id))[0];
    const value = await document(id);
    value.fields.expiresText = '1404/13/';
    await save(value);
    await expect(publish(id)).rejects.toThrow();
    expect((await credentialQuery(id))[0]).toEqual(original);
    value.fields.expiresText = ' ';
    await save(value, 1);
    await publish(id, 2);
    expect((await credentialQuery(id))[0]!.expiresAt).toBeNull();
  });
  it.each(['domain-audit', 'receipt-audit'])(
    'rolls back a %s failure including legacy-secret removal',
    async (failure) => {
      const id = await createCredential({ systemName: 'Synthetic rollback' });
      t.db
        .update(credentials)
        .set({ secretCipher: 'synthetic-cipher', secretNonce: 'synthetic-nonce' })
        .where(eq(credentials.id, id))
        .run();
      const original = (await credentialQuery(id))[0]!;
      const audits = t.db.select().from(auditLog).all();
      const value = await document(id);
      value.fields.clearSecret = true;
      await save(value);
      t.sqlite.exec(
        `CREATE TRIGGER refuse_credential_audit BEFORE INSERT ON audit_log WHEN NEW.action = '${failure === 'domain-audit' ? 'vault.updated' : 'workspace.formPublished'}' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`,
      );
      await expect(publish(id)).rejects.toThrow();
      expect((await credentialQuery(id))[0]).toEqual(original);
      expect(t.db.select().from(auditLog).all()).toEqual(audits);
      expect(raw()).toMatchObject({ revision: 1, deletedAt: null, committedId: null });
    },
  );
  it('compares the entire original secret rather than trusting a repeated updatedAt', async () => {
    const id = await createCredential({ systemName: 'Synthetic basis', secret: 'Original synthetic' });
    const value = await document(id);
    value.fields.username = 'typed';
    await save(value);
    t.db.update(credentials).set({ secretText: 'Concurrent synthetic' }).where(eq(credentials.id, id)).run();
    await expect(publish(id)).rejects.toThrow(FormDraftConflict);
    expect((await credentialQuery(id))[0]!.secretText).toBe('Concurrent synthetic');
    expect(raw().committedId).toBeNull();
  });
  it('does not edit a deleted target or acknowledge writes from a replaced dataset', async () => {
    const id = await createCredential({ systemName: 'Synthetic target' });
    const value = await document(id);
    value.fields.username = 'typed';
    await save(value);
    t.db.update(credentials).set(softDelete()).where(eq(credentials.id, id)).run();
    await expect(publish(id)).rejects.toThrow(FormDraftConflict);
    const replacement = reserveDatasetReplacement();
    try {
      replacement.committed();
    } finally {
      replacement.release();
    }
    await expect(save(value, 1)).rejects.toThrow(DatasetChangedError);
    await expect(publish(id)).rejects.toThrow(DatasetChangedError);
  });
  it('keeps raw foreign/future documents unchanged and projects no secret into recovery links', async () => {
    const value = await document();
    value.fields.systemName = 'Synthetic preview';
    value.fields.secret = secret;
    await save(value);
    const links = await workspaceDraftsQuery('credential');
    expect(links[0]!.title).toBe('Synthetic preview');
    expect(Object.keys(links[0]!).sort()).toEqual(['id', 'recordId', 'title', 'updatedAt']);
    expect(JSON.stringify(links)).not.toContain(secret);
    expect(describeCredentialFields(value.fields)).not.toContain(secret);
    const future = JSON.stringify({ ...value, version: 2 });
    t.db.update(workspaceFormDrafts).set({ body: future }).where(eq(workspaceFormDrafts.id, 'raw-credential')).run();
    await expect(publish(null)).rejects.toThrow(UnsupportedFormDraft);
    expect(raw().body).toBe(future);
    expect(() => credentialFormCodec.decode(JSON.stringify({ ...value, kind: 'idea' }))).toThrow(UnsupportedFormDraft);
  });
  it('rolls back ordinary credential updates when their required audit cannot be saved', async () => {
    const id = await createCredential({ systemName: 'Synthetic ordinary', secret });
    const original = (await credentialQuery(id))[0];
    t.sqlite.exec(
      "CREATE TRIGGER refuse_ordinary_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(updateCredential(id, { username: 'new', secret: '' })).rejects.toThrow();
    expect((await credentialQuery(id))[0]).toEqual(original);
  });
});
