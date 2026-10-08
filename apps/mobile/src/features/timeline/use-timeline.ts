import { useMemo } from 'react';

import { useLive } from '@/db/use-live';
import { FLAG_LABEL } from '@/features/labs/flags';
import { isUnreadableNumber } from '@/features/labs/logic';
import { NOTE_TYPE_LABELS } from '@/features/notes/labels';

import { timelinePage, type TimelineCursor, type TimelineFilter } from './logic';
import {
  timelineConsultsQuery,
  timelineEncountersQuery,
  timelineImagingQuery,
  timelineLabPreviewQuery,
  timelineLabsQuery,
  timelineNotesQuery,
} from './queries';

export type { TimelineItem, TimelineKind } from './logic';

/** A projection of clinical owners, with bounded reads and honest partial failures. */
export function useTimeline(patientId: string, filter: TimelineFilter = 'all', cursor?: TimelineCursor) {
  const enabled = (kind: TimelineFilter) => filter === 'all' || filter === kind;
  const deps = [patientId, filter, cursor?.at, cursor?.id];
  const notes = useLive(timelineNotesQuery(patientId, enabled('note'), cursor), deps);
  const labs = useLive(timelineLabsQuery(patientId, enabled('lab'), cursor), deps);
  const imaging = useLive(timelineImagingQuery(patientId, enabled('imaging'), cursor), deps);
  const consults = useLive(timelineConsultsQuery(patientId, enabled('consult'), cursor), deps);
  const admissions = useLive(timelineEncountersQuery(patientId, 'in', enabled('encounter'), cursor), deps);
  const discharges = useLive(timelineEncountersQuery(patientId, 'out', enabled('encounter'), cursor), deps);
  const page = useMemo(
    () =>
      timelinePage([
        ...(notes.data ?? []),
        ...(labs.data ?? []),
        ...(imaging.data ?? []),
        ...(consults.data ?? []),
        ...(admissions.data ?? []),
        ...(discharges.data ?? []),
      ]),
    [notes.data, labs.data, imaging.data, consults.data, admissions.data, discharges.data],
  );
  const labIds = page.items.filter((item) => item.kind === 'lab').map((item) => item.sourceId);
  const values = useLive(timelineLabPreviewQuery(patientId, labIds), [patientId, JSON.stringify(labIds)]);
  const items = useMemo(
    () =>
      page.items.map((item) => {
        if (item.kind === 'note')
          return { ...item, title: item.title?.trim() || NOTE_TYPE_LABELS[item.noteType ?? 'general'] };
        if (item.kind !== 'lab') return item;
        const rows = (values.data ?? []).filter((value) => value.panelId === item.sourceId);
        const summary = rows
          .map((row) => {
            const mark =
              (row.flag ? FLAG_LABEL[row.flag] : '') ||
              (!row.truncated && row.valueNum == null && isUnreadableNumber(row.value ?? '', false) ? '?' : '');
            return [row.analyte, row.value, row.unit, mark].filter(Boolean).join(' ');
          })
          .join(' · ');
        return {
          ...item,
          title: item.title?.trim() || 'آزمایش',
          summary: summary || item.summary,
          results: rows.length ? { shown: rows.length, total: rows[0]!.total } : undefined,
        };
      }),
    [page.items, values.data],
  );
  const sources = [
    { label: 'نوت‌ها', active: enabled('note'), query: notes },
    { label: 'آزمایش‌ها', active: enabled('lab'), query: labs },
    { label: 'نتیجه‌ی آزمایش‌ها', active: enabled('lab') && labIds.length > 0, query: values },
    { label: 'تصویربرداری', active: enabled('imaging'), query: imaging },
    { label: 'کانسالت‌ها', active: enabled('consult'), query: consults },
    { label: 'پذیرش‌ها', active: enabled('encounter'), query: admissions },
    { label: 'ترخیص‌ها', active: enabled('encounter'), query: discharges },
  ].filter((source) => source.active);
  const failed = sources.filter(({ query }) => query.error);
  const invalidDateError = page.invalidDates
    ? new Error('تاریخ بعضی رویدادها قابل خواندن نیست؛ فهرست کامل نیست.')
    : undefined;
  return {
    items,
    hasMore: page.hasMore,
    loading: sources.some(({ query }) => query.loading),
    error: failed[0]?.query.error ?? invalidDateError,
    failedSources: failed.map(({ label }) => label),
    retry: () => (failed.length ? failed : invalidDateError ? sources : []).forEach(({ query }) => query.retry()),
  };
}
