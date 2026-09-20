import { z } from 'zod';

import { RATING_AXES, type Doctor, type DoctorRating, type Occasion, type RatingAxis } from '@/db/schema';
import { fromIsoDate, nextJalaliOccurrence, toJalali } from '@/lib/jalali';
import { buildSearchText, fullName, normalizePhone, toPersianDigits } from '@/lib/persian';
import { addDays, atTime } from '@/lib/time';

const TITLE_WORDS = ['دکتر', 'دکتور', 'استاد', 'پروفسور', 'پرفسور', 'dr', 'dr.', 'prof', 'prof.'];

/**
 * "دکتر علی احمدی" typed into a picker -> title, first name, surname.
 * The title is peeled off; the last word is the surname, the rest the name.
 * A lone title with no name is treated as a name, not discarded.
 */
export function parseDoctorName(text: string): { title: string | null; firstName: string; lastName: string } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let title: string | null = null;
  if (words.length > 1 && TITLE_WORDS.includes(words[0]!.toLowerCase())) {
    title = words.shift()!;
  }
  const lastName = words.pop() ?? '';
  return { title, firstName: words.join(' '), lastName };
}

export function doctorDisplayName(d: Pick<Doctor, 'title' | 'firstName' | 'lastName'>): string {
  return fullName(d.firstName, d.lastName, d.title);
}

/**
 * The search index for a doctor. Specialty names (Persian, English and common
 * aliases) are included, so "اطفال عفونی" finds a paediatric ID consultant even
 * though neither word is in their name.
 */
export function doctorSearchText(
  d: Partial<
    Pick<Doctor, 'title' | 'firstName' | 'lastName' | 'specialtyText' | 'phone' | 'officeAddress' | 'notes' | 'tags'>
  >,
  specialtyWords: string[],
): string {
  return buildSearchText(
    d.title,
    d.firstName,
    d.lastName,
    d.specialtyText,
    normalizePhone(d.phone),
    d.officeAddress,
    d.notes,
    specialtyWords,
    d.tags ?? undefined,
  );
}

/* -------------------------------------------------------------------------- */
/*  Ratings                                                                     */
/* -------------------------------------------------------------------------- */

export type RatingScores = Partial<Record<RatingAxis, number | null>>;

/**
 * The mean of the axes that were actually scored, to one decimal.
 *
 * Unscored axes are left out rather than counted as zero: "I have not formed
 * an opinion about their teaching" must not drag the average down. A rating
 * with nothing scored has no average at all.
 */
export function ratingAverage(rating: RatingScores | null | undefined): number | null {
  if (!rating) return null;
  const scores = RATING_AXES.map(({ key }) => rating[key]).filter((v): v is number => typeof v === 'number');
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, v) => sum + v, 0) / scores.length) * 10) / 10;
}

/** How much of the picture is filled in — shown next to the average. */
export function ratedAxisCount(rating: RatingScores | null | undefined): number {
  if (!rating) return 0;
  return RATING_AXES.filter(({ key }) => typeof rating[key] === 'number').length;
}

/** The newest rating of a doctor; the older ones stay as history. */
export function latestRating<T extends Pick<DoctorRating, 'ratedAt'>>(ratings: T[]): T | null {
  return ratings.reduce<T | null>((best, r) => (!best || r.ratedAt > best.ratedAt ? r : best), null);
}

/* -------------------------------------------------------------------------- */
/*  Occasions                                                                   */
/* -------------------------------------------------------------------------- */

export type OccasionTiming = Pick<
  Occasion,
  'jalaliMonth' | 'jalaliDay' | 'onDate' | 'isRecurring' | 'remindDaysBefore' | 'isEnabled'
>;

/** The hour of day a greeting reminder fires. Early enough to send before work. */
export const OCCASION_REMINDER_HOUR = 9;

/**
 * When this occasion next happens.
 *
 * A recurring one is a Jalali month/day, so it is resolved on the Persian
 * calendar every year — converting a stored Gregorian birthday back would
 * drift by a day across leap years. A one-off occasion is simply its date,
 * even if that date has passed.
 */
export function occasionNextDate(o: OccasionTiming, now: Date = new Date()): Date | null {
  if (o.isRecurring && o.jalaliMonth && o.jalaliDay) return nextJalaliOccurrence(o.jalaliMonth, o.jalaliDay, now);
  return fromIsoDate(o.onDate);
}

/**
 * When to raise the notification: `remindDaysBefore` days ahead, at 9am.
 *
 * If that moment has already passed, a recurring occasion moves to next
 * year's — a reminder that fires the instant it is created is worse than
 * none. A one-off occasion whose moment has passed gets no reminder.
 */
export function occasionReminderAt(o: OccasionTiming, now: Date = new Date()): Date | null {
  if (!o.isEnabled) return null;
  const first = occasionNextDate(o, now);
  if (!first) return null;

  const remindFor = (day: Date) => atTime(addDays(day, -o.remindDaysBefore), OCCASION_REMINDER_HOUR);
  const remindAt = remindFor(first);
  if (remindAt.getTime() > now.getTime()) return remindAt;

  if (!(o.isRecurring && o.jalaliMonth && o.jalaliDay)) return null;
  const next = nextJalaliOccurrence(o.jalaliMonth, o.jalaliDay, addDays(first, 1));
  const nextRemindAt = remindFor(next);
  return nextRemindAt.getTime() > now.getTime() ? nextRemindAt : null;
}

/** A birthday from a profile's stored date, as the Jalali month/day it recurs on. */
export function birthdayJalaliMonthDay(birthDate: string | null | undefined): { month: number; day: number } | null {
  const date = fromIsoDate(birthDate);
  if (!date) return null;
  const { jm, jd } = toJalali(date);
  return { month: jm, day: jd };
}

/**
 * What an occasion reminder carries, so tapping it opens that doctor.
 *
 * Parsed rather than trusted: a notification scheduled by an older build, or
 * restored from another phone, can carry anything.
 */
const occasionReminderPayload = z.object({
  kind: z.literal('occasion'),
  doctorId: z.string(),
  occasionId: z.string().min(1),
});

export type OccasionReminderPayload = z.infer<typeof occasionReminderPayload>;

export function parseOccasionReminder(data: unknown): OccasionReminderPayload | null {
  const result = occasionReminderPayload.safeParse(data);
  return result.success ? result.data : null;
}

/** "۲ روز دیگر" / "فردا" / "امروز" — how a list says how long the wait is. */
export function daysUntilLabel(days: number): string {
  if (days <= 0) return 'امروز';
  if (days === 1) return 'فردا';
  return `${toPersianDigits(days)} روز دیگر`;
}

/* -------------------------------------------------------------------------- */
/*  Greetings                                                                   */
/* -------------------------------------------------------------------------- */

/** Placeholders a message template may use. Persian, because the user types them. */
export const GREETING_TOKENS = { name: '{نام}', occasion: '{مناسبت}' } as const;

export const DEFAULT_GREETING: Record<Occasion['kind'], string> = {
  birthday: 'تولدتان مبارک {نام} عزیز. سالی پر از سلامتی و موفقیت برایتان آرزو می‌کنم.',
  anniversary: '{نام} عزیز، سالگرد {مناسبت} را تبریک می‌گویم.',
  graduation: '{نام} عزیز، فارغ‌التحصیلی‌تان را تبریک می‌گویم.',
  holiday: '{نام} عزیز، {مناسبت} بر شما مبارک باشد.',
  religious: '{نام} عزیز، {مناسبت} را خدمت شما تبریک عرض می‌کنم.',
  custom: '{نام} عزیز، {مناسبت} را تبریک می‌گویم.',
};

/**
 * Fill a template with the doctor's name and the occasion's title.
 *
 * MedOS never sends anything by itself: this text is what gets handed to the
 * user's own messenger, with the send button still theirs to press.
 */
export function greetingText(template: string, vars: { name: string; occasion?: string | null }): string {
  return template
    .split(GREETING_TOKENS.name)
    .join(vars.name)
    .split(GREETING_TOKENS.occasion)
    .join(vars.occasion ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
