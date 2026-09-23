import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { captureInbox, notes, noteVersions, tasks } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  captureCountQuery,
  captureQuery,
  createCapture,
  deletedCapturesQuery,
  discardCapture,
  discardCaptureIfEmpty,
  fileCaptureAsNote,
  fileCaptureAsTask,
  filedCapturesQuery,
  inboxQuery,
  restoreCapture,
  updateCapture,
} from './queries';
import { CaptureWriter } from './writer';
import { addAttachment, entityAttachmentsQuery } from '../attachments/queries';
import { patientNotesQuery } from '../notes/queries';
import { createPatient, deletePatient } from '../patients/queries';
import { startShift } from '../shifts/queries';
import { tasksQuery } from '../tasks/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'outpatient' });
});

/** A voice capture, without touching the filesystem. */
async function attachVoice(captureId: string): Promise<string> {
  return addAttachment({
    entityType: 'capture',
    entityId: captureId,
    kind: 'voice',
    relativePath: 'media/test/rec.m4a',
    durationMs: 4200,
  });
}

describe('a capture', () => {
  /*
   * The whole point: it demands nothing. No patient, no type, no title — the
   * questions are what stop a thing from being written down at all.
   */
  it('needs nothing but the words, and waits in the inbox', async () => {
    const id = await createCapture({ text: 'خانواده‌ی تخت ۱۲ دنبال جواب پاتولوژی' });

    const [row] = await captureQuery(id);
    expect(row?.patientId).toBeNull();
    expect(row?.filedAt).toBeNull();
    expect(await inboxQuery()).toHaveLength(1);
    expect(await filedCapturesQuery()).toHaveLength(0);
  });

  it('remembers which shift it was caught on, and keeps that answer afterwards', async () => {
    const shiftId = await startShift({ ward: 'داخلی ۲' });
    const id = await createCapture({ text: 'سونوگرافی فردا صبح' });

    expect((await captureQuery(id))[0]?.shiftId).toBe(shiftId);

    // A later shift does not rewrite an earlier night.
    await startShift({ ward: 'اورژانس' });
    expect((await captureQuery(id))[0]?.shiftId).toBe(shiftId);
  });

  it('is not filed by being read, only by being filed', async () => {
    const id = await createCapture({ text: 'تماس با رادیولوژی' });
    await inboxQuery();
    await updateCapture(id, { text: 'تماس با رادیولوژی بابت سی‌تی' });
    expect((await captureQuery(id))[0]?.filedAt).toBeNull();
  });
});

describe('filing a capture', () => {
  it('as a task takes it out of the inbox without destroying it', async () => {
    const id = await createCapture({ text: 'تماس با رادیولوژی' });
    const taskId = await fileCaptureAsTask(id);

    const tasks = await tasksQuery({ status: 'open' });
    expect(tasks.map((r) => r.task.id)).toContain(taskId);
    expect(tasks.find((r) => r.task.id === taskId)?.task.title).toBe('تماس با رادیولوژی');

    expect(await inboxQuery()).toHaveLength(0);
    const [row] = await captureQuery(id);
    expect(row?.filedAs).toBe('task');
    expect(row?.filedId).toBe(taskId);
    expect(row?.deletedAt).toBeNull();
    expect(await filedCapturesQuery()).toHaveLength(1);
  });

  /*
   * A note under the wrong person is worse than a capture still waiting, so
   * the guess is never made.
   */
  it('as a note refuses when nobody knows whose it is', async () => {
    const id = await createCapture({ text: 'فشارش افتاد بعد از دیالیز' });
    await expect(fileCaptureAsNote(id)).rejects.toThrow();
    expect(await inboxQuery()).toHaveLength(1);
  });

  it('as a note carries the recording over to the note', async () => {
    const id = await createCapture({ text: 'حرف‌های همراه بیمار', patientId });
    await attachVoice(id);

    const noteId = await fileCaptureAsNote(id);

    const notes = await patientNotesQuery(patientId);
    expect(notes.map((n) => n.id)).toContain(noteId);
    expect(notes.find((n) => n.id === noteId)?.body).toBe('حرف‌های همراه بیمار');

    // One file, one home: it moved rather than being copied.
    expect(await entityAttachmentsQuery('capture', id)).toHaveLength(0);
    const moved = await entityAttachmentsQuery('note', noteId);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.patientId).toBe(patientId);
  });

  it('returns the same destination on retry and refuses a conflicting conversion', async () => {
    const id = await createCapture({ text: 'تماس با آزمایشگاه' });
    const taskId = await fileCaptureAsTask(id);
    await expect(fileCaptureAsTask(id)).resolves.toBe(taskId);
    await expect(fileCaptureAsNote(id, { patientId })).rejects.toThrow();
  });

  it('creates one task under concurrent requests', async () => {
    const id = await createCapture({ text: 'Call lab' });
    const ids = await Promise.all([fileCaptureAsTask(id), fileCaptureAsTask(id)]);
    expect(ids[0]).toBe(ids[1]);
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
  });

  it('creates one note and keeps its selected patient and attachments under concurrent requests', async () => {
    const id = await createCapture({ text: 'Progress' });
    await attachVoice(id);
    const ids = await Promise.all([fileCaptureAsNote(id, { patientId }), fileCaptureAsNote(id, { patientId })]);
    expect(ids[0]).toBe(ids[1]);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(1);
    expect((await captureQuery(id))[0]?.patientId).toBe(patientId);
    expect(await entityAttachmentsQuery('note', ids[0]!)).toHaveLength(1);
  });

  it('rolls back a task if marking the capture filed fails', async () => {
    const id = await createCapture({ text: 'Call lab' });
    failFiling();
    await expect(fileCaptureAsTask(id)).rejects.toThrow();
    expect(t.db.select().from(tasks).all()).toHaveLength(0);
    expect((await captureQuery(id))[0]?.filedAt).toBeNull();
    t.sqlite.exec('DROP TRIGGER fail_filing');
    await fileCaptureAsTask(id);
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
  });

  it('rolls back the note, history and attachment move if filing fails', async () => {
    const id = await createCapture({ text: 'Progress' });
    await attachVoice(id);
    failFiling();
    await expect(fileCaptureAsNote(id, { patientId })).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toHaveLength(0);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(0);
    expect(await entityAttachmentsQuery('capture', id)).toHaveLength(1);
    expect((await captureQuery(id))[0]?.patientId).toBeNull();
    t.sqlite.exec('DROP TRIGGER fail_filing');
    await fileCaptureAsNote(id, { patientId });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });

  it('refuses to file under a deleted patient or silently switch the filed patient', async () => {
    const id = await createCapture({ text: 'Progress', patientId });
    await fileCaptureAsNote(id);
    const otherId = await createPatient({ firstName: 'Test', lastName: 'Other', status: 'outpatient' });
    await expect(fileCaptureAsNote(id, { patientId: otherId })).rejects.toThrow();
    await deletePatient(patientId);
    const unfiled = await createCapture({ text: 'Another', patientId });
    await expect(fileCaptureAsNote(unfiled)).rejects.toThrow();
    expect((await captureQuery(unfiled))[0]?.filedAt).toBeNull();
  });

  it('as a task needs words, because a task with no title is nothing', async () => {
    const id = await createCapture({ kind: 'voice' });
    await attachVoice(id);
    await expect(fileCaptureAsTask(id)).rejects.toThrow();
    expect(await inboxQuery()).toHaveLength(1);
  });
});

function failFiling() {
  t.sqlite.exec(
    "CREATE TRIGGER fail_filing BEFORE UPDATE OF filed_at ON capture_inbox BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
  );
}

describe('throwing a capture away', () => {
  it('is a soft delete, like everything else in the record', async () => {
    const id = await createCapture({ text: 'بی‌اهمیت' });
    await discardCapture(id);

    expect(await inboxQuery()).toHaveLength(0);
    expect(t.db.select().from(captureInbox).all()).toHaveLength(1);
  });

  it('can be undone from the trash', async () => {
    const id = await createCapture({ text: 'اشتباهی پاک شد' });
    await discardCapture(id);
    expect((await deletedCapturesQuery()).map((c) => c.id)).toContain(id);

    await restoreCapture(id);
    expect(await deletedCapturesQuery()).toHaveLength(0);
    expect((await inboxQuery()).map((r) => r.capture.id)).toContain(id);
  });

  it('happens by itself only when the row is truly empty', async () => {
    const blank = await createCapture({});
    expect(await discardCaptureIfEmpty(blank)).toBe(true);
    expect(await inboxQuery()).toHaveLength(0);

    const withVoice = await createCapture({ kind: 'voice' });
    await attachVoice(withVoice);
    expect(await discardCaptureIfEmpty(withVoice)).toBe(false);

    const withWords = await createCapture({ text: 'چیزی' });
    expect(await discardCaptureIfEmpty(withWords)).toBe(false);
  });
});

describe('the inbox', () => {
  it('retrieves items past both preview limits and counts the full search result', async () => {
    for (let i = 0; i < 76; i += 1) {
      const id = await createCapture({ text: `پیگیری ${i}` });
      if (i < 23) await fileCaptureAsTask(id);
    }
    const deleted = await createCapture({ text: 'پیگیری حذف‌شده' });
    await discardCapture(deleted);
    await createCapture({ text: 'Unrelated' });

    const first = await inboxQuery();
    const all = await inboxQuery(100);
    expect(first).toHaveLength(50);
    expect(all).toHaveLength(54);
    expect(all.slice(0, 50)).toEqual(first);
    expect((await captureCountQuery(false))[0]?.total).toBe(54);
    expect((await captureCountQuery(false, 'پيگيري'))[0]?.total).toBe(53);
    expect(await inboxQuery(100, 'پيگيري')).toHaveLength(53);

    const filedPreview = await filedCapturesQuery();
    const filedAll = await filedCapturesQuery(40, 'پيگيري');
    expect(filedPreview).toHaveLength(20);
    expect(filedAll).toHaveLength(23);
    expect(filedAll.slice(0, 20)).toEqual(filedPreview);
    expect((await captureCountQuery(true, 'پيگيري'))[0]?.total).toBe(23);
    expect((await captureCountQuery(true, 'absent'))[0]?.total).toBe(0);
  });

  it('keeps a capture whose patient was deleted, without naming them', async () => {
    const id = await createCapture({ text: 'پیگیری جواب', patientId });
    await deletePatient(patientId);

    const rows = await inboxQuery();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.capture.id).toBe(id);
    expect(rows[0]?.patient).toBeNull();
  });

  it('shows what has waited longest first', async () => {
    const older = await createCapture({ text: 'اول', capturedAt: new Date('2026-09-20T08:00:00Z') });
    const newer = await createCapture({ text: 'دوم', capturedAt: new Date('2026-09-21T08:00:00Z') });

    const rows = await inboxQuery();
    expect(rows.map((r) => r.capture.id)).toEqual([older, newer]);
  });
});

describe('the capture writer', () => {
  it('retries failed creation with the newest text after a transient database error', async () => {
    const writer = new CaptureWriter();
    t.sqlite.exec(
      "CREATE TRIGGER fail_capture BEFORE INSERT ON capture_inbox BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(writer.write({ text: 'first', patientId: null })).rejects.toThrow();
    expect(writer.started).toBe(false);
    t.sqlite.exec('DROP TRIGGER fail_capture');
    await writer.write({ text: 'latest', patientId });
    const rows = t.db.select().from(captureInbox).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe('latest');
    expect(rows[0]?.patientId).toBe(patientId);
  });
  /*
   * Three things on the capture screen can be first to produce something worth
   * keeping, and all three ask for the row. Two rows would mean a recording
   * and the words that go with it ending up in different places.
   */
  it('creates one row however many things ask for it at once', async () => {
    const writer = new CaptureWriter();
    writer.set({ text: 'یک بار', patientId: null });

    const ids = await Promise.all([
      writer.ensure(),
      writer.ensure({ kind: 'voice' }),
      writer.write({ text: 'یک بار', patientId: null }),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(t.db.select().from(captureInbox).all()).toHaveLength(1);
  });

  it('leaves nothing behind when the screen was opened and abandoned', async () => {
    const writer = new CaptureWriter();
    expect(writer.started).toBe(false);
    expect(await writer.discardIfEmpty()).toBe(false);
    expect(t.db.select().from(captureInbox).all()).toHaveLength(0);
  });
});
