import type { Idea, PrescriptionItem, PrescriptionTemplate, SpecialtyProfile, Topic } from '@/db/schema';
import { buildSearchText } from '@/lib/persian';

/*
 * Pure helpers for the knowledge module: what goes into each search index,
 * and how a prescription template is turned into text a person can read.
 *
 * MedOS stores what the physician wrote. Nothing here generates a regimen,
 * checks a dose or suggests a drug.
 */

export function topicSearchText(
  t: Partial<Pick<Topic, 'title' | 'summary' | 'body' | 'professorNotes' | 'pearls' | 'source' | 'context' | 'tags'>>,
  extra: string[] = [],
): string {
  return buildSearchText(
    t.title,
    t.summary,
    t.body,
    t.professorNotes,
    t.pearls,
    t.source,
    t.context,
    t.tags ?? undefined,
    extra,
  );
}

export function specialtyProfileSearchText(
  p: Partial<
    Pick<
      SpecialtyProfile,
      | 'nameText'
      | 'overview'
      | 'dailyWork'
      | 'lifestyle'
      | 'jobMarket'
      | 'subspecialtyPaths'
      | 'prosText'
      | 'consText'
      | 'myThoughts'
      | 'sourcesText'
      | 'tags'
    >
  >,
  extra: string[] = [],
): string {
  return buildSearchText(
    p.nameText,
    p.overview,
    p.dailyWork,
    p.lifestyle,
    p.jobMarket,
    p.subspecialtyPaths,
    p.prosText,
    p.consText,
    p.myThoughts,
    p.sourcesText,
    p.tags ?? undefined,
    extra,
  );
}

export function prescriptionSearchText(
  r: Partial<Pick<PrescriptionTemplate, 'title' | 'condition' | 'adviceText' | 'cautionsText' | 'tags'>>,
  items: PrescriptionItem[] = [],
  extra: string[] = [],
): string {
  return buildSearchText(
    r.title,
    r.condition,
    r.adviceText,
    r.cautionsText,
    r.tags ?? undefined,
    items.flatMap((i) => [i.drug, i.sig ?? '', i.notes ?? '']),
    extra,
  );
}

export function ideaSearchText(i: Partial<Pick<Idea, 'title' | 'body' | 'area' | 'tags'>>): string {
  return buildSearchText(i.title, i.body, i.area, i.tags ?? undefined);
}

/**
 * One prescription line the way it would be written out:
 * `Amoxicillin 500 mg cap PO TDS × 7 روز — #21`.
 *
 * Latin digits throughout, because these are doses (see CLINICAL_DIGITS_STAY_LATIN).
 * An explicit `sig` wins: if the user wrote the line themselves, it is
 * reproduced exactly rather than rebuilt from the parts.
 */
export function prescriptionLine(item: PrescriptionItem): string {
  if (item.sig?.trim()) return `${item.drug.trim()} ${item.sig.trim()}`.trim();
  const parts = [
    item.drug?.trim(),
    item.dose?.trim(),
    item.form?.trim(),
    item.route?.trim(),
    item.frequency?.trim(),
    item.duration?.trim() ? `× ${item.duration.trim()}` : '',
    item.quantity?.trim() ? `— #${item.quantity.trim()}` : '',
  ];
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The whole template as plain text, for the clipboard.
 *
 * What gets copied is exactly what was stored — a numbered list of the lines,
 * then the advice, the cautions and the follow-up plan under their own
 * headings. Empty sections are left out rather than printed empty.
 */
export function prescriptionText(
  template: Pick<PrescriptionTemplate, 'title' | 'condition' | 'adviceText' | 'cautionsText' | 'followUpText'>,
  items: PrescriptionItem[],
): string {
  const lines: string[] = [];
  const header = [template.title?.trim(), template.condition?.trim()].filter(Boolean).join(' — ');
  if (header) lines.push(header);

  items.forEach((item, i) => {
    const line = prescriptionLine(item);
    if (!line) return;
    lines.push(`${i + 1}. ${line}`);
    if (item.notes?.trim()) lines.push(`   ${item.notes.trim()}`);
  });

  const section = (title: string, body: string | null | undefined) => {
    if (!body?.trim()) return;
    lines.push('', `${title}:`, body.trim());
  };
  section('توصیه‌ها', template.adviceText);
  section('هشدارها', template.cautionsText);
  section('پیگیری', template.followUpText);

  return lines.join('\n').trim();
}

/** A template row's items, tolerating a row written before the column existed. */
export function itemsOf(template: Pick<PrescriptionTemplate, 'items'>): PrescriptionItem[] {
  return Array.isArray(template.items) ? template.items : [];
}

/** Drop the blank rows an editor leaves behind: a line with no drug is not a line. */
export function cleanItems(items: PrescriptionItem[]): PrescriptionItem[] {
  return items.map((i) => ({ ...i, drug: i.drug?.trim() ?? '' })).filter((i) => i.drug.length > 0);
}

/** Topics still marked for another pass before exams, hardest first is the user's job. */
export function needsReviewCount(topics: Pick<Topic, 'needsReview'>[]): number {
  return topics.filter((t) => t.needsReview).length;
}
