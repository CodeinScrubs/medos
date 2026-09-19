import type { Doctor } from '@/db/schema';
import { buildSearchText, fullName, normalizePhone } from '@/lib/persian';

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
