import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import {
  ATTACHMENT_ENTITIES,
  attachments,
  captureInbox,
  credentials,
  doctors,
  encounters,
  followUps,
  ideas,
  imagingStudies,
  labPanels,
  notes,
  noteDrafts,
  places,
  prescriptionTemplates,
  topics,
  type AttachmentEntity,
} from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { newId, softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { addAttachment, attachmentQuery, deleteAttachment, updateAttachment } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
let otherPatientId: string;
let ids: Record<AttachmentEntity, string>;
const clinical = [
  'patient',
  'encounter',
  'note',
  'note_draft',
  'lab_panel',
  'imaging_study',
  'follow_up',
  'capture',
] as const;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Media' });
  otherPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
  ids = Object.fromEntries(ATTACHMENT_ENTITIES.map((type) => [type, newId()])) as Record<AttachmentEntity, string>;
  ids.patient = patientId;
  const base = (type: AttachmentEntity) => ({ id: ids[type], ...stamps() });
  t.db
    .insert(encounters)
    .values({ ...base('encounter'), patientId, kind: 'admission' })
    .run();
  t.db
    .insert(notes)
    .values({ ...base('note'), patientId, noteDate: new Date() })
    .run();
  t.db
    .insert(noteDrafts)
    .values({ ...base('note_draft'), patientId, type: 'general', voices: [] })
    .run();
  t.db
    .insert(labPanels)
    .values({ ...base('lab_panel'), patientId, collectedAt: new Date() })
    .run();
  t.db
    .insert(imagingStudies)
    .values({ ...base('imaging_study'), patientId })
    .run();
  t.db
    .insert(followUps)
    .values({ ...base('follow_up'), patientId, dueAt: new Date(), reason: 'Synthetic' })
    .run();
  t.db
    .insert(captureInbox)
    .values({ ...base('capture'), patientId, capturedAt: new Date() })
    .run();
  t.db
    .insert(doctors)
    .values({ ...base('doctor'), firstName: 'Synthetic', lastName: 'Teacher' })
    .run();
  t.db
    .insert(topics)
    .values({ ...base('topic'), title: 'Synthetic topic' })
    .run();
  t.db
    .insert(ideas)
    .values({ ...base('idea'), title: 'Synthetic idea' })
    .run();
  t.db
    .insert(prescriptionTemplates)
    .values({ ...base('prescription_template'), title: 'Synthetic template' })
    .run();
  t.db
    .insert(places)
    .values({ ...base('place'), name: 'Synthetic place' })
    .run();
  t.db
    .insert(credentials)
    .values({ ...base('credential'), systemName: 'Synthetic system' })
    .run();
});

const input = (entityType: AttachmentEntity, patient?: string | null) => ({
  entityType,
  entityId: ids[entityType],
  patientId: patient,
  kind: 'voice' as const,
  relativePath: `media/test/${entityType}.m4a`,
});

describe('attachment ownership at publication', () => {
  it('refuses an empty patient target instead of treating it as general media', async () => {
    await expect(addAttachment({ ...input('patient'), entityId: '' })).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });
  it.each(ATTACHMENT_ENTITIES)(
    'refuses a missing %s target instead of publishing an invisible attachment',
    async (type) => {
      await expect(addAttachment({ ...input(type), entityId: newId() })).rejects.toThrow();
      expect(t.db.select().from(attachments).all()).toEqual([]);
    },
  );

  it.each(clinical)('derives the canonical patient for %s when the caller omits the denormalized id', async (type) => {
    const id = await addAttachment(input(type));
    expect((await attachmentQuery(id))[0]?.patientId).toBe(patientId);
  });

  it.each(clinical)('refuses %s metadata pointing at a different live patient', async (type) => {
    await expect(addAttachment(input(type, otherPatientId))).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it.each(clinical)('refuses a %s attachment after its patient is soft deleted', async (type) => {
    await deletePatient(patientId);
    await expect(addAttachment(input(type, patientId))).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it('keeps general capture and knowledge media independent of a patient', async () => {
    t.db.update(captureInbox).set({ patientId: null }).where(eq(captureInbox.id, ids.capture)).run();
    for (const type of [
      'capture',
      'topic',
      'doctor',
      'idea',
      'place',
      'credential',
      'prescription_template',
    ] as const) {
      const id = await addAttachment(input(type));
      expect((await attachmentQuery(id))[0]?.patientId).toBeNull();
    }
  });

  it('refuses a deleted target even while its patient is alive', async () => {
    t.db.update(notes).set(softDelete()).where(eq(notes.id, ids.note)).run();
    await expect(addAttachment(input('note', patientId))).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it('rejects a stale metadata edit rather than silently acknowledging it', async () => {
    const id = await addAttachment(input('patient', patientId));
    await deleteAttachment(id);
    await expect(updateAttachment(id, { caption: 'New caption' })).rejects.toThrow();
    expect(t.db.select().from(attachments).get()?.caption).toBeNull();
  });
});
