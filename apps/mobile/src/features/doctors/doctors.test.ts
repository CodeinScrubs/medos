import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { occasions } from '@/db/schema';
import { fromJalali, toJalali } from '@/lib/jalali';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  birthdayJalaliMonthDay,
  DEFAULT_GREETING,
  greetingText,
  latestRating,
  occasionNextDate,
  occasionReminderAt,
  ratedAxisCount,
  ratingAverage,
} from './logic';
import { confirmGreetingSent, doctorMessagesQuery, logGreetingPrepared } from './messages-queries';
import {
  cancelDoctorOccasionReminders,
  createOccasion,
  deleteOccasion,
  doctorOccasionsQuery,
  rescheduleOccasionReminders,
  updateOccasion,
} from './occasions-queries';
import { createDoctor, doctorsQuery, quickCreateDoctor } from './queries';
import { addDoctorRating, doctorProfileQuery, doctorRatingsQuery, saveDoctorProfile } from './ratings-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
});

describe('ratings', () => {
  it('averages only the axes that were scored', () => {
    expect(ratingAverage({ knowledge: 5, teaching: 4 })).toBe(4.5);
    expect(ratedAxisCount({ knowledge: 5, teaching: 4 })).toBe(2);
    // An axis with no opinion must not count as a zero.
    expect(ratingAverage({ knowledge: 5, teaching: null })).toBe(5);
    expect(ratingAverage({})).toBeNull();
    expect(ratingAverage(null)).toBeNull();
  });

  it('keeps every rating as history and reads the newest as current', async () => {
    const doctorId = await createDoctor({ firstName: 'مریم', lastName: 'رضایی', relationship: 'attending' });
    const older = new Date('2024-01-01T08:00:00Z');
    await addDoctorRating(doctorId, { knowledge: 3, reasoning: 'اول کار', ratedAt: older });
    await addDoctorRating(doctorId, { knowledge: 5, teaching: 5, reasoning: 'بعد از یک سال' });

    const rows = await doctorRatingsQuery(doctorId);
    expect(rows).toHaveLength(2);
    // Newest first, and the old opinion is still there.
    expect(rows[0]?.knowledge).toBe(5);
    expect(latestRating(rows)?.reasoning).toBe('بعد از یک سال');
    expect(rows.some((r) => r.ratedAt.getTime() === older.getTime())).toBe(true);
  });
});

describe('the social profile', () => {
  it('is one row per doctor, created once and then written', async () => {
    const doctorId = await createDoctor({ firstName: 'حسن', lastName: 'کریمی', relationship: 'professor' });
    await saveDoctorProfile(doctorId, { hometown: 'یزد', interests: ['کوهنوردی'] });
    await saveDoctorProfile(doctorId, { almaMater: 'شیراز' });

    const rows = await doctorProfileQuery(doctorId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hometown).toBe('یزد');
    expect(rows[0]?.almaMater).toBe('شیراز');
    expect(rows[0]?.interests).toEqual(['کوهنوردی']);
  });
});

describe('occasion dates', () => {
  const enabled = { isRecurring: true, remindDaysBefore: 2, isEnabled: true, onDate: null };
  // 12 Mordad 1403 was a Friday; the exact day does not matter, only that it
  // is a fixed point to reason from.
  const now = fromJalali(1403, 5, 12);

  it('resolves a recurring occasion on the Persian calendar', () => {
    const next = occasionNextDate({ ...enabled, jalaliMonth: 5, jalaliDay: 20 }, now);
    expect(next && toJalali(next)).toEqual({ jy: 1403, jm: 5, jd: 20 });

    // A day already past this year rolls to next year, not backwards.
    const passed = occasionNextDate({ ...enabled, jalaliMonth: 2, jalaliDay: 3 }, now);
    expect(passed && toJalali(passed)).toEqual({ jy: 1404, jm: 2, jd: 3 });
  });

  it('reminds the agreed number of days early, at nine in the morning', () => {
    const at = occasionReminderAt({ ...enabled, jalaliMonth: 5, jalaliDay: 20 }, now);
    expect(at && toJalali(at)).toEqual({ jy: 1403, jm: 5, jd: 18 });
    expect(at?.getHours()).toBe(9);
    expect(at!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('moves to next year rather than firing a reminder that is already late', () => {
    // The occasion is tomorrow but the lead time is two days: this year's
    // reminder moment has passed, so the next one is a year away.
    const at = occasionReminderAt({ ...enabled, jalaliMonth: 5, jalaliDay: 13 }, now);
    expect(at && toJalali(at)).toEqual({ jy: 1404, jm: 5, jd: 11 });
  });

  it('gives a one-off occasion no reminder once it is past, and none at all when switched off', () => {
    const oneOff = { isRecurring: false, remindDaysBefore: 1, isEnabled: true, jalaliMonth: null, jalaliDay: null };
    expect(occasionReminderAt({ ...oneOff, onDate: '2020-01-01' }, now)).toBeNull();
    expect(occasionReminderAt({ ...enabled, jalaliMonth: 5, jalaliDay: 20, isEnabled: false }, now)).toBeNull();
  });

  it('reads a birthday as the Jalali day it recurs on', () => {
    expect(birthdayJalaliMonthDay('1991-08-03')).toEqual({ month: 5, day: 12 });
    expect(birthdayJalaliMonthDay(null)).toBeNull();
  });
});

describe('occasion reminders', () => {
  const birthday = (patch: Record<string, unknown> = {}) => ({
    kind: 'birthday' as const,
    title: 'تولد',
    jalaliMonth: toJalali(new Date()).jm,
    jalaliDay: toJalali(new Date()).jd,
    remindDaysBefore: 0,
    ...patch,
  });

  it('schedules one when the occasion is created, and cancels it when deleted', async () => {
    const doctorId = await createDoctor({ firstName: 'سارا', lastName: 'موسوی', relationship: 'colleague' });
    // Two months out, so "9am, N days before" is always still ahead of now.
    const later = toJalali(new Date(Date.now() + 60 * 86_400_000));
    const id = await createOccasion({
      doctorId,
      ...birthday({ jalaliMonth: later.jm, jalaliDay: later.jd, remindDaysBefore: 3 }),
    });

    expect(scheduled.size).toBe(1);
    const reminder = [...scheduled.values()][0]!;
    expect(reminder.title).toContain('موسوی');
    expect(reminder.data).toEqual({ kind: 'occasion', doctorId, occasionId: id });

    await deleteOccasion(id);
    expect(scheduled.size).toBe(0);
    expect((await doctorOccasionsQuery(doctorId)).length).toBe(0);
    // Soft delete: the row is still there, without a dangling reminder id.
    const raw = (await t.db.select().from(occasions))[0];
    expect(raw?.deletedAt).toBeInstanceOf(Date);
    expect(raw?.notificationId).toBeNull();
  });

  it('replaces the reminder when the occasion changes, and switching it off leaves none', async () => {
    const doctorId = await createDoctor({ firstName: 'نیما', lastName: 'شریفی', relationship: 'friend' });
    const later = toJalali(new Date(Date.now() + 60 * 86_400_000));
    const id = await createOccasion({ doctorId, ...birthday({ jalaliMonth: later.jm, jalaliDay: later.jd }) });
    const first = [...scheduled.keys()][0];

    await updateOccasion(id, { remindDaysBefore: 5 });
    expect(scheduled.size).toBe(1);
    expect([...scheduled.keys()][0]).not.toBe(first);

    await updateOccasion(id, { isEnabled: false });
    expect(scheduled.size).toBe(0);
    expect((await doctorOccasionsQuery(doctorId))[0]?.isEnabled).toBe(false);
  });

  /*
   * Without this, a restore leaves the phone with the occasions but no
   * reminders — the notification ids in a backup belong to the phone that
   * made it — and a recurring birthday would be announced once and never again.
   */
  it('rebuilds every enabled reminder from the rows', async () => {
    const doctorId = await createDoctor({ firstName: 'پریسا', lastName: 'نادری', relationship: 'colleague' });
    const later = toJalali(new Date(Date.now() + 60 * 86_400_000));
    await createOccasion({ doctorId, ...birthday({ jalaliMonth: later.jm, jalaliDay: later.jd }) });
    await createOccasion({
      doctorId,
      ...birthday({ title: 'سالگرد', kind: 'anniversary', jalaliMonth: later.jm, jalaliDay: later.jd }),
    });
    await createOccasion({
      doctorId,
      ...birthday({ title: 'خاموش', jalaliMonth: later.jm, jalaliDay: later.jd, isEnabled: false }),
    });

    scheduled.clear();
    expect(await rescheduleOccasionReminders()).toBe(2);
    expect(scheduled.size).toBe(2);

    await cancelDoctorOccasionReminders(doctorId);
    expect(scheduled.size).toBe(0);
  });
});

describe('greetings', () => {
  it('records a handed-over text as prepared, and only the owner can call it sent', async () => {
    const doctorId = await createDoctor({ firstName: 'رضا', lastName: 'قاسمی', relationship: 'professor' });
    const later = toJalali(new Date(Date.now() + 60 * 86_400_000));
    const occasionId = await createOccasion({
      doctorId,
      kind: 'birthday',
      title: 'تولد',
      jalaliMonth: later.jm,
      jalaliDay: later.jd,
    });

    const messageId = await logGreetingPrepared({
      doctorId,
      occasionId,
      channel: 'whatsapp',
      body: 'تولدت مبارک',
    });

    /*
     * Opening WhatsApp is not sending a message: the user can close it
     * without pressing send. Until they say otherwise the log says `ready`,
     * with no sent date to quote back at them next year.
     */
    const prepared = await doctorMessagesQuery(doctorId);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.status).toBe('ready');
    expect(prepared[0]?.sentAt).toBeNull();
    expect(prepared[0]?.occasionId).toBe(occasionId);

    await confirmGreetingSent(messageId);
    const confirmed = await doctorMessagesQuery(doctorId);
    expect(confirmed[0]?.status).toBe('sent');
    expect(confirmed[0]?.sentAt).toBeInstanceOf(Date);
  });

  it('fills the template with the name and the occasion', () => {
    expect(greetingText(DEFAULT_GREETING.birthday, { name: 'دکتر احمدی' })).toContain('دکتر احمدی');
    expect(greetingText('{نام} عزیز، {مناسبت} مبارک', { name: 'دکتر احمدی', occasion: 'روز پزشک' })).toBe(
      'دکتر احمدی عزیز، روز پزشک مبارک',
    );
    // A template with no tokens is sent exactly as written.
    expect(greetingText('سلام', { name: 'دکتر احمدی' })).toBe('سلام');
  });
});

describe('the directory', () => {
  it('finds a doctor typed into a picker, and lists starred first', async () => {
    const quick = await quickCreateDoctor('دکتر علی احمدی');
    expect(quick.label).toBe('دکتر علی احمدی');

    await createDoctor({ firstName: 'زهرا', lastName: 'یوسفی', relationship: 'colleague', starred: true });
    const rows = await doctorsQuery();
    expect(rows[0]?.lastName).toBe('یوسفی');
    // Persian search normalises the ی/ي the name was typed with.
    expect((await doctorsQuery({ search: 'احمدي' })).map((d) => d.id)).toEqual([quick.id]);
  });
});
