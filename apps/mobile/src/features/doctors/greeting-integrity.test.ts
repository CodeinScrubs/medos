import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { scheduledMessages } from '@/db/schema';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { fromJalali, toIsoDate } from '@/lib/jalali';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { daysUntilLabel, occasionNextDate, occasionReminderAt } from './logic';
import { confirmGreetingSent, logGreetingPrepared, markGreetingSkipped } from './messages-queries';
import { createOccasion, deleteOccasion } from './occasions-queries';
import { createDoctor, deleteDoctor } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let doctorId: string;
let occasionId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague', relationship: 'colleague' });
  occasionId = await createOccasion({
    doctorId,
    kind: 'birthday',
    title: 'Example birthday',
    jalaliMonth: 1,
    jalaliDay: 1,
  });
});
afterEach(() => {
  jest.useRealTimers();
});
const prepared = () => logGreetingPrepared({ doctorId, occasionId, channel: 'sms', body: 'Example greeting' });
const message = (id: string) => t.db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id)).get()!;

describe('greeting record integrity', () => {
  it('keeps the original sent time across repeated confirmations', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T09:00:00Z'));
    const id = await prepared();
    await confirmGreetingSent(id);
    const before = message(id);
    jest.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    await confirmGreetingSent(id);
    expect(message(id)).toEqual(before);
  });

  it('refuses skipping a message already confirmed sent', async () => {
    const id = await prepared();
    await confirmGreetingSent(id);
    const before = message(id);
    await expect(markGreetingSkipped(id)).rejects.toThrow();
    expect(message(id)).toEqual(before);
  });

  it('refuses confirming deleted messages without silently reviving them', async () => {
    const id = await prepared();
    t.db.update(scheduledMessages).set({ deletedAt: new Date() }).where(eq(scheduledMessages.id, id)).run();
    const before = message(id);
    await expect(confirmGreetingSent(id)).rejects.toThrow();
    expect(message(id)).toEqual(before);
  });

  it('refuses a greeting for an occasion belonging to another doctor', async () => {
    const other = await createDoctor({ firstName: 'Another', lastName: 'Colleague', relationship: 'colleague' });
    await expect(
      logGreetingPrepared({ doctorId: other, occasionId, channel: 'sms', body: 'Example greeting' }),
    ).rejects.toThrow();
    expect(t.db.select().from(scheduledMessages).all()).toHaveLength(0);
  });

  it.each(['doctor', 'occasion'] as const)('refuses preparing against a deleted %s', async (kind) => {
    if (kind === 'doctor') await deleteDoctor(doctorId);
    else await deleteOccasion(occasionId);
    await expect(prepared()).rejects.toThrow();
    expect(t.db.select().from(scheduledMessages).all()).toHaveLength(0);
  });

  it('refuses all old message callbacks after a dataset replacement', async () => {
    const id = await prepared();
    const original = datasetGeneration();
    const before = message(id);
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(
      logGreetingPrepared({ doctorId, occasionId, channel: 'sms', body: 'Old text' }, original),
    ).rejects.toThrow();
    await expect(confirmGreetingSent(id, original)).rejects.toThrow();
    await expect(markGreetingSkipped(id, original)).rejects.toThrow();
    expect(message(id)).toEqual(before);
    expect(t.db.select().from(scheduledMessages).all()).toHaveLength(1);
  });

  it('keeps a skipped record idempotent and never turns it into sent', async () => {
    const id = await prepared();
    await markGreetingSkipped(id);
    const before = message(id);
    await markGreetingSkipped(id);
    expect(message(id)).toEqual(before);
    await expect(confirmGreetingSent(id)).rejects.toThrow();
    expect(message(id)).toEqual(before);
  });
});

describe('occasion calendar boundaries', () => {
  it('does not call a past one-off occasion today', () => {
    expect(daysUntilLabel(-1)).toBe('دیروز');
    expect(daysUntilLabel(-3)).toBe('۳ روز پیش');
  });
  it('rejects corrupt recurring dates instead of normalizing them', () => {
    const invalid = {
      isEnabled: true,
      isRecurring: true,
      jalaliMonth: 7,
      jalaliDay: 31,
      onDate: null,
      remindDaysBefore: 1,
    };
    expect(occasionNextDate(invalid, fromJalali(1405, 1, 1))).toBeNull();
    expect(occasionReminderAt(invalid, fromJalali(1405, 1, 1))).toBeNull();
  });
  it('finds a future annual reminder even when a 365-day lead has passed for two occurrences', () => {
    const now = fromJalali(1404, 1, 1);
    now.setHours(12);
    const occasion = {
      isEnabled: true,
      isRecurring: true,
      jalaliMonth: 1,
      jalaliDay: 1,
      onDate: null,
      remindDaysBefore: 365,
    };
    const next = occasionReminderAt(occasion, now);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
    expect(toIsoDate(next!)).toBe(toIsoDate(fromJalali(1405, 1, 1)));
  });
});
