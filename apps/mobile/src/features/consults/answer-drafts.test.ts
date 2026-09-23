import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ConsultDraftConflict } from './answer-drafts';
import {
  cancelConsult,
  commitConsultAnswerDraft,
  consultQuery,
  createConsult,
  deleteConsult,
  markConsultRequested,
  openConsultsQuery,
  saveConsultAnswerDraft,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
const answer = { response: '  Exact reply\nwith another line  ', instruction: '  Call tomorrow  ' };
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

describe('durable consult answers', () => {
  it('recovers exact text under the same consult without publishing or changing search facts', async () => {
    const a = await createConsult({ patientId, reason: 'Question A' });
    const b = await createConsult({ patientId, reason: 'Question B' });
    const revision = await saveConsultAnswerDraft(a, answer, 0);
    const [row] = await consultQuery(a);
    expect(row).toMatchObject({
      draftResponse: answer.response,
      draftInstruction: answer.instruction,
      draftRevision: revision,
      response: null,
      respondedAt: null,
      status: 'pending',
    });
    expect(row?.searchText).not.toContain('Exact reply');
    expect((await consultQuery(b))[0]?.draftResponse).toBe('');
    expect(await openConsultsQuery()).toHaveLength(2);
    await commitConsultAnswerDraft(a, revision);
    expect((await consultQuery(b))[0]?.status).toBe('pending');
  });

  it('publishes and retires exactly one draft; retry cannot change the time or add an audit event', async () => {
    const id = await createConsult({ patientId, reason: 'Question' });
    const revision = await saveConsultAnswerDraft(id, answer, 0);
    const at = new Date('2026-09-23T10:00:00Z');
    await Promise.all([
      commitConsultAnswerDraft(id, revision, at),
      commitConsultAnswerDraft(id, revision, new Date('2026-09-24T10:00:00Z')),
    ]);
    expect((await consultQuery(id))[0]).toMatchObject({
      status: 'answered',
      response: answer.response.trim(),
      followUpInstruction: answer.instruction.trim(),
      respondedAt: at,
      draftResponse: '',
      draftInstruction: '',
      draftRevision: revision + 1,
    });
    const audit = t.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.action === 'consult.statusChanged');
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('Exact reply');
    await expect(saveConsultAnswerDraft(id, { response: 'Late write', instruction: '' }, revision)).rejects.toThrow();
    await expect(cancelConsult(id)).rejects.toThrow();
    await expect(markConsultRequested(id)).rejects.toThrow();
    expect((await consultQuery(id))[0]?.status).toBe('answered');
  });

  it('keeps a recoverable draft when publishing fails in SQLite, then permits retry', async () => {
    const id = await createConsult({ patientId, reason: 'Question' });
    const revision = await saveConsultAnswerDraft(id, answer, 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_answer BEFORE UPDATE ON consultations WHEN NEW.status = 'answered' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitConsultAnswerDraft(id, revision)).rejects.toThrow();
    expect((await consultQuery(id))[0]).toMatchObject({
      status: 'pending',
      draftResponse: answer.response,
      draftInstruction: answer.instruction,
      draftRevision: revision,
      response: null,
    });
    t.sqlite.exec('DROP TRIGGER fail_answer');
    await commitConsultAnswerDraft(id, revision);
    expect((await consultQuery(id))[0]?.status).toBe('answered');
  });

  it('rejects stale editors and stale publish without losing the newer draft', async () => {
    const id = await createConsult({ patientId, reason: 'Question' });
    const results = await Promise.allSettled([
      saveConsultAnswerDraft(id, answer, 0),
      saveConsultAnswerDraft(id, { response: 'Other editor', instruction: '' }, 0),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    await expect(commitConsultAnswerDraft(id, 0)).rejects.toBeInstanceOf(ConsultDraftConflict);
    expect((await consultQuery(id))[0]?.draftResponse).toBe(answer.response);
    const revision = (await consultQuery(id))[0]!.draftRevision;
    expect(await saveConsultAnswerDraft(id, answer, revision)).toBe(revision);
    await expect(saveConsultAnswerDraft(id, answer, 0)).rejects.toBeInstanceOf(ConsultDraftConflict);
    // Explicitly choosing to replace the displayed current revision is allowed.
    await saveConsultAnswerDraft(id, { response: 'Merged by owner', instruction: answer.instruction }, revision);
    expect((await consultQuery(id))[0]?.draftResponse).toBe('Merged by owner');
  });

  it('does not clear the old draft or advance the revision when an autosave write fails', async () => {
    const id = await createConsult({ patientId, reason: 'Question' });
    const revision = await saveConsultAnswerDraft(id, answer, 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE UPDATE ON consultations BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(saveConsultAnswerDraft(id, { ...answer, response: 'New' }, revision)).rejects.toThrow();
    expect((await consultQuery(id))[0]).toMatchObject({ draftResponse: answer.response, draftRevision: revision });
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await saveConsultAnswerDraft(id, { ...answer, response: 'New' }, revision);
    expect((await consultQuery(id))[0]?.draftResponse).toBe('New');
  });

  it('preserves cancelled and deleted drafts while refusing further writes', async () => {
    const id = await createConsult({ patientId, reason: 'Question' });
    const revision = await saveConsultAnswerDraft(id, answer, 0);
    await markConsultRequested(id, new Date('2026-09-23T10:00:00Z'));
    await markConsultRequested(id, new Date('2026-09-24T10:00:00Z'));
    expect((await consultQuery(id))[0]?.requestedAt).toEqual(new Date('2026-09-23T10:00:00Z'));
    await cancelConsult(id);
    expect((await consultQuery(id))[0]?.draftResponse).toBe(answer.response);
    await expect(commitConsultAnswerDraft(id, revision)).rejects.toThrow();
    await deleteConsult(id);
    expect(await consultQuery(id)).toHaveLength(0);
    expect((await consultQuery(id, true))[0]?.draftResponse).toBe(answer.response);
    await expect(saveConsultAnswerDraft(id, answer, revision)).rejects.toThrow();
    await expect(cancelConsult('missing')).rejects.toThrow();
    await expect(markConsultRequested('missing')).rejects.toThrow();
    await expect(deleteConsult('missing')).rejects.toThrow();
  });

  it('refuses answering a deleted patient and blank or invalid-date answers', async () => {
    await expect(createConsult({ patientId, reason: ' ' })).rejects.toThrow();
    const id = await createConsult({ patientId, reason: 'Question' });
    await expect(commitConsultAnswerDraft(id, 0)).rejects.toThrow();
    await expect(markConsultRequested(id, new Date(NaN))).rejects.toThrow();
    const revision = await saveConsultAnswerDraft(id, answer, 0);
    await expect(commitConsultAnswerDraft(id, revision, new Date(NaN))).rejects.toThrow();
    await deletePatient(patientId);
    await expect(commitConsultAnswerDraft(id, revision)).rejects.toThrow();
    expect((await consultQuery(id))[0]?.draftResponse).toBe(answer.response);
  });
});
