import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { prescriptionTemplates, topics } from '@/db/schema';
import { createDoctor } from '@/features/doctors/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createIdea, ideasQuery, setIdeaStatus, suggestIdeaAreas, updateIdea } from './ideas-queries';
import { cleanItems, prescriptionLine, prescriptionText } from './logic';
import {
  createPrescription,
  duplicatePrescription,
  markPrescriptionUsed,
  prescriptionsQuery,
} from './prescriptions-queries';
import { createTopic, markTopicReviewed, reindexTopics, suggestTopicTags, topicsQuery, updateTopic } from './queries';
import { createSpecialtyProfile, specialtyProfilesQuery } from './specialty-profiles-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

let t: TestDatabase;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

describe('topics', () => {
  it('finds a subject by the teacher who taught it', async () => {
    const teacher = await createDoctor({ firstName: 'حسن', lastName: 'کریمی', relationship: 'professor' });
    await createTopic({ title: 'ARDS', taughtById: teacher, summary: 'ventilation strategy', context: 'راند' });
    await createTopic({ title: 'DKA', summary: 'fluids first' });

    // The name lives in another table, so it has to be copied into the index.
    const found = await topicsQuery({ search: 'کریمی' });
    expect(found.map((r) => r.topic.title)).toEqual(['ARDS']);
    expect(found[0]?.teacher?.lastName).toBe('کریمی');

    // ...and the Persian search still folds ی/ي the way the rest of the app does.
    expect((await topicsQuery({ search: 'كريمي' })).length).toBe(1);
  });

  it('rebuilds the index from the whole subject on a partial edit', async () => {
    const id = await createTopic({ title: 'Sepsis', body: 'source control matters most' });
    await updateTopic(id, { title: 'Sepsis and septic shock' });
    // Editing the title must not drop the body out of the index.
    expect((await topicsQuery({ search: 'source control' })).length).toBe(1);
    expect((await topicsQuery({ search: 'septic shock' })).length).toBe(1);
  });

  it('clears the review flag and stamps when it was reviewed', async () => {
    const id = await createTopic({ title: 'Hyponatremia', needsReview: true });
    expect((await topicsQuery({ needsReviewOnly: true })).length).toBe(1);

    await markTopicReviewed(id);
    expect((await topicsQuery({ needsReviewOnly: true })).length).toBe(0);
    const row = (await t.db.select().from(topics))[0];
    expect(row?.lastReviewedAt).toBeInstanceOf(Date);
  });

  it('suggests the tags already in use, most used first', async () => {
    await createTopic({ title: 'A', tags: ['نفرولوژی', 'امتحان'] });
    await createTopic({ title: 'B', tags: ['امتحان'] });
    expect(await suggestTopicTags()).toEqual(['امتحان', 'نفرولوژی']);
  });

  it('reindexes without touching rows whose text is already right', async () => {
    await createTopic({ title: 'Asthma', summary: 'stepwise' });
    expect(await reindexTopics()).toBe(0);
  });
});

describe('prescription templates', () => {
  const uti = {
    title: 'UTI ساده',
    condition: 'خانم بالغ، بدون تب',
    items: [
      { drug: 'Nitrofurantoin', dose: '100 mg', form: 'cap', route: 'PO', frequency: 'BD', duration: '5 روز' },
      { drug: 'Acetaminophen', sig: '500 mg PO PRN درد' },
      // A blank line the editor left behind.
      { drug: '   ' },
    ],
    adviceText: 'آب زیاد',
    cautionsText: 'تب یا درد پهلو یعنی برگردد',
  };

  it('writes one readable line per drug, in Latin digits', () => {
    expect(prescriptionLine(uti.items[0]!)).toBe('Nitrofurantoin 100 mg cap PO BD × 5 روز');
    // A line the user wrote themselves is reproduced as written.
    expect(prescriptionLine(uti.items[1]!)).toBe('Acetaminophen 500 mg PO PRN درد');
  });

  it('drops the empty rows an editor leaves behind', () => {
    expect(cleanItems(uti.items)).toHaveLength(2);
  });

  it('copies as text with only the sections that have something in them', () => {
    const text = prescriptionText(
      {
        title: uti.title,
        condition: uti.condition,
        adviceText: uti.adviceText,
        cautionsText: null,
        followUpText: null,
      },
      cleanItems(uti.items),
    );
    expect(text).toContain('UTI ساده — خانم بالغ، بدون تب');
    expect(text).toContain('1. Nitrofurantoin 100 mg cap PO BD × 5 روز');
    expect(text).toContain('توصیه‌ها:');
    expect(text).not.toContain('هشدارها:');
    expect(text).not.toContain('پیگیری:');
  });

  it('is found by a drug inside it, and rises as it gets used', async () => {
    const id = await createPrescription(uti);
    await createPrescription({ title: 'فارنژیت', items: [{ drug: 'Penicillin V' }] });

    expect((await prescriptionsQuery({ search: 'Nitrofurantoin' })).map((r) => r.template.id)).toEqual([id]);

    await markPrescriptionUsed(id);
    await markPrescriptionUsed(id);
    const rows = await prescriptionsQuery();
    expect(rows[0]?.template.id).toBe(id);
    expect(rows[0]?.template.usageCount).toBe(2);
    expect(rows[0]?.template.lastUsedAt).toBeInstanceOf(Date);
    // Blank rows are not stored.
    expect(rows[0]?.template.items).toHaveLength(2);
  });

  it('duplicates a template as the start of a variant, without its usage count', async () => {
    const id = await createPrescription(uti);
    await markPrescriptionUsed(id);
    const copyId = await duplicatePrescription(id);

    const copy = (await t.db.select().from(prescriptionTemplates)).find((r) => r.id === copyId);
    expect(copy?.title).toBe('UTI ساده (کپی)');
    expect(copy?.usageCount).toBe(0);
    expect(copy?.items).toHaveLength(2);
  });
});

describe('the idea inbox', () => {
  it('orders by what is moving, then by priority', async () => {
    await createIdea({ title: 'تقویم شیفت', priority: 'normal' });
    const doing = await createIdea({ title: 'ویجت امروز', status: 'doing', priority: 'low' });
    const urgent = await createIdea({ title: 'بکاپ ابری', priority: 'high' });
    const done = await createIdea({ title: 'چیز تمام‌شده', status: 'done', priority: 'high' });

    const rows = await ideasQuery();
    expect(rows.map((i) => i.id).slice(0, 2)).toEqual([doing, urgent]);
    expect(rows[rows.length - 1]?.id).toBe(done);
    expect((await ideasQuery({ openOnly: true })).map((i) => i.id)).not.toContain(done);
  });

  it('keeps the search index in step with an edit, and learns the areas used', async () => {
    const id = await createIdea({ title: 'ایده‌ی اول', area: 'کاردکس' });
    await updateIdea(id, { body: 'دوز را از دفعه‌ی قبل بیاورد' });
    expect((await ideasQuery({ search: 'دوز' })).length).toBe(1);

    await setIdeaStatus(id, 'done');
    expect((await ideasQuery({ status: 'done' })).length).toBe(1);
    expect(await suggestIdeaAreas()).toEqual(['کاردکس']);
  });
});

describe('specialty profiles', () => {
  it('is searchable by the specialty’s own names as well as the notes', async () => {
    const specialtyId = (await t.db.query.specialties.findFirst({ where: (s, { eq }) => eq(s.slug, 'cardio') }))?.id;
    await createSpecialtyProfile({
      specialtyId: specialtyId ?? null,
      nameText: specialtyId ? null : 'قلب',
      dailyWork: 'اکو و آنژیو',
      personalFit: 4,
    });

    expect((await specialtyProfilesQuery({ search: 'آنژیو' })).length).toBe(1);
    if (specialtyId) expect((await specialtyProfilesQuery({ search: 'Cardiology' })).length).toBe(1);
  });
});
