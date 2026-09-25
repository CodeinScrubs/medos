import { useMemo } from 'react';

import { useLive } from '@/db/use-live';
import { patientConsultsQuery } from '@/features/consults/queries';
import { encounterHistoryQuery } from '@/features/encounters/queries';
import { patientImagingQuery } from '@/features/imaging/queries';
import { patientLabPanelsQuery } from '@/features/labs/queries';
import { NOTE_TYPE_LABELS } from '@/features/notes/labels';
import { notePreview } from '@/features/notes/logic';
import { patientNotesQuery } from '@/features/notes/queries';

/*
 * One patient's record in the order it happened.
 *
 * Deliberately a projection, not a table. Every row here already exists
 * somewhere with an owner that validates it — a note, a panel, a study, a
 * consult, an episode — and copying them into an events table would mean two
 * places to keep in step and one of them eventually wrong. The cost is that
 * the timeline is assembled in memory; for one patient's record that is a few
 * hundred rows.
 *
 * What is *not* here is as deliberate: no orders, because a kardex line is a
 * standing instruction rather than a moment, and no tasks, because a task is
 * about the future.
 */

export type TimelineKind = 'encounter' | 'note' | 'lab' | 'imaging' | 'consult';

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  at: Date;
  title: string;
  summary?: string | null;
  /** Which tab of the patient's record this came from, for the tap. */
  tab?: 'notes' | 'labs' | 'imaging' | 'overview';
};

export function useTimeline(patientId: string): {
  items: TimelineItem[];
  loading: boolean;
  error: Error | undefined;
  failedSources: string[];
  retry: () => void;
} {
  const notes = useLive(patientNotesQuery(patientId), [patientId]);
  const labs = useLive(patientLabPanelsQuery(patientId), [patientId]);
  const imaging = useLive(patientImagingQuery(patientId), [patientId]);
  const consults = useLive(patientConsultsQuery(patientId), [patientId]);
  const encounters = useLive(encounterHistoryQuery(patientId), [patientId]);

  const items = useMemo(() => {
    const out: TimelineItem[] = [];

    for (const note of notes.data ?? []) {
      out.push({
        id: `note:${note.id}`,
        kind: 'note',
        at: note.noteDate,
        title: note.title?.trim() || NOTE_TYPE_LABELS[note.type],
        summary: notePreview(note),
        tab: 'notes',
      });
    }

    for (const panel of labs.data ?? []) {
      out.push({
        id: `lab:${panel.id}`,
        kind: 'lab',
        at: panel.collectedAt,
        title: panel.name?.trim() || 'آزمایش',
        summary: panel.labName,
        tab: 'labs',
      });
    }

    for (const study of imaging.data ?? []) {
      // A study with no date has not happened yet as far as the record knows.
      if (!study.studyDate) continue;
      out.push({
        id: `imaging:${study.id}`,
        kind: 'imaging',
        at: study.studyDate,
        title: [study.modality.toUpperCase(), study.region].filter(Boolean).join(' — '),
        summary: study.impression ?? study.reportText,
        tab: 'imaging',
      });
    }

    for (const { consult } of consults.data ?? []) {
      const at = consult.respondedAt ?? consult.requestedAt ?? consult.createdAt;
      out.push({
        id: `consult:${consult.id}`,
        kind: 'consult',
        at,
        title: `کانسالت ${consult.specialty ?? ''}`.trim(),
        summary: consult.response ?? consult.reason,
        tab: 'overview',
      });
    }

    for (const row of encounters.data ?? []) {
      const encounter = 'encounter' in row ? row.encounter : row;
      if (encounter.admittedAt) {
        out.push({
          id: `encounter:${encounter.id}:in`,
          kind: 'encounter',
          at: encounter.admittedAt,
          title: 'پذیرش',
          summary: [encounter.ward, encounter.chiefComplaint].filter(Boolean).join(' — ') || null,
          tab: 'overview',
        });
      }
      if (encounter.dischargedAt) {
        out.push({
          id: `encounter:${encounter.id}:out`,
          kind: 'encounter',
          at: encounter.dischargedAt,
          title: 'ترخیص',
          summary: encounter.outcomeNotes,
          tab: 'overview',
        });
      }
    }

    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [notes.data, labs.data, imaging.data, consults.data, encounters.data]);

  const sources = [
    { label: 'نوت‌ها', query: notes },
    { label: 'آزمایش‌ها', query: labs },
    { label: 'تصویربرداری', query: imaging },
    { label: 'کانسالت‌ها', query: consults },
    { label: 'بستری‌ها', query: encounters },
  ];
  const failed = sources.filter(({ query }) => query.error);
  return {
    items,
    loading: sources.some(({ query }) => query.loading),
    error: failed[0]?.query.error,
    failedSources: failed.map(({ label }) => label),
    retry: () => failed.forEach(({ query }) => query.retry()),
  };
}
