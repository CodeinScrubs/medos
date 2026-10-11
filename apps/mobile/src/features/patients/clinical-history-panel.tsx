import { useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Column, EmptyState, Row, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { decodeClinicalSnapshot, type HistoryRow } from '@/lib/clinical-history';
import { formatJalaliDateTime } from '@/lib/jalali';
import { hasPersianLetters, toPersianDigits } from '@/lib/persian';

import { HISTORY_KIND_LABEL, HISTORY_REASON_LABEL, historyFields, historyValue } from './history-labels';
import { clinicalHistoryQuery, clinicalVersionQuery, type ClinicalHistoryCursor } from './history-queries';

/** Existing patient timeline owns this view; no new navigation/header/editor. */
export function ClinicalHistoryPanel({ patientId, stale }: { patientId: string; stale: boolean }) {
  const [pages, setPages] = useState<ClinicalHistoryCursor[]>([]);
  const cursor = pages.at(-1);
  if (stale) return <Text color="textMuted">اطلاعات جایگزین شده؛ پرونده را دوباره باز کنید.</Text>;
  return (
    <HistoryPage
      key={`${cursor?.recordedAt.getTime() ?? ''}:${cursor?.sequence ?? ''}:${cursor?.id ?? ''}`}
      patientId={patientId}
      cursor={cursor}
      onOlder={(next) => setPages([...pages, next])}
      onNewer={pages.length ? () => setPages(pages.slice(0, -1)) : undefined}
    />
  );
}

function HistoryPage({
  patientId,
  cursor,
  onOlder,
  onNewer,
}: {
  patientId: string;
  cursor?: ClinicalHistoryCursor;
  onOlder: (cursor: ClinicalHistoryCursor) => void;
  onNewer?: () => void;
}) {
  const read = useLive(clinicalHistoryQuery(patientId, cursor), [
    patientId,
    cursor?.id,
    cursor?.sequence,
    cursor?.recordedAt.getTime(),
  ]);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = (read.data ?? []).slice(0, 20);
  return (
    <Column gap="sm">
      <Text variant="caption" color="textMuted">
        تاریخچهٔ نوت در خود نوت است. تغییرات پیش از شروع این تاریخچه قابل بازسازی نیست.
      </Text>
      <ErrorNotice error={read.error} what="تاریخچهٔ اصلاحات" onRetry={read.retry} />
      {read.loading ? <Text color="textMuted">در حال خواندن…</Text> : null}
      {!read.error && !read.loading && !rows.length ? (
        <EmptyState icon="time-outline" title="اصلاحی در این صفحه نیست" />
      ) : null}
      {rows.map((version) => (
        <Card key={version.id}>
          <Column gap="xs">
            <Text variant="captionStrong">
              {HISTORY_KIND_LABEL[version.kind] ?? 'سابقه'} · {HISTORY_REASON_LABEL[version.reason] ?? 'تغییر'} · نسخهٔ{' '}
              {toPersianDigits(version.sequence)}
            </Text>
            {version.title ? <Text numberOfLines={2}>{version.title}</Text> : null}
            <Text variant="tiny" color="textFaint">
              {formatJalaliDateTime(version.recordedAt)}
            </Text>
            <Button
              label={selected === version.id ? 'بستن جزئیات' : 'دیدن تغییرات'}
              variant="ghost"
              size="sm"
              disabled={Boolean(read.error)}
              onPress={() => setSelected(selected === version.id ? null : version.id)}
            />
            {selected === version.id ? (
              <HistoryDetail key={version.id} patientId={patientId} versionId={version.id} />
            ) : null}
          </Column>
        </Card>
      ))}
      <Row wrap>
        {onNewer ? <Button label="جدیدتر" variant="secondary" onPress={onNewer} /> : null}
        {(read.data?.length ?? 0) > 20 && rows.length ? (
          <Button
            label="قدیمی‌تر"
            variant="secondary"
            disabled={Boolean(read.error)}
            onPress={() => onOlder(rows.at(-1)!)}
          />
        ) : null}
      </Row>
    </Column>
  );
}

function HistoryDetail({ patientId, versionId }: { patientId: string; versionId: string }) {
  const read = useLive(clinicalVersionQuery(patientId, versionId), [patientId, versionId]);
  const [raw, setRaw] = useState(false);
  const detail = read.data?.[0];
  const current = detail ? decodeClinicalSnapshot(detail.version.body, detail.version) : null;
  const previous = detail?.previousBody ? decodeClinicalSnapshot(detail.previousBody, detail.version) : null;
  return (
    <Column gap="sm">
      <ErrorNotice error={read.error} what="متن نسخه" onRetry={read.retry} />
      {read.loading ? <Text color="textMuted">در حال خواندن…</Text> : null}
      {!read.error && !read.loading && !detail ? <Text color="textMuted">نسخه در این پرونده پیدا نشد.</Text> : null}
      {current ? (
        <>
          {detail?.version.reason === 'baseline' ? (
            <Text variant="caption" color="textMuted">
              زمان بالا، زمان نگه‌داشتن این وضعیت پیش از اصلاح است؛ زمان ایجاد اولیهٔ اطلاعات نیست.
            </Text>
          ) : null}
          <HistoryFields
            current={current.record}
            previous={previous?.kind === current.kind ? previous.record : undefined}
          />
          {previous?.kind === current.kind && previous.values ? (
            <LabHistoryValues label="نتایج قبل" values={previous.values} />
          ) : null}
          {current.values ? <LabHistoryValues label="نتایج همین نسخه" values={current.values} /> : null}
        </>
      ) : detail ? (
        <Text color="textMuted">قالب یا مالکیت این نسخه قابل تأیید نیست؛ متن اصلی آن حفظ شده است.</Text>
      ) : null}
      {detail ? (
        <>
          <Button
            label={raw ? 'بستن متن کامل' : 'متن کامل نسخه'}
            variant="ghost"
            size="sm"
            onPress={() => setRaw(!raw)}
          />
          {raw ? (
            <Text numeric selectable variant="caption">
              {detail.version.body}
            </Text>
          ) : null}
        </>
      ) : null}
    </Column>
  );
}

function HistoryFields({ current, previous }: { current: HistoryRow; previous?: HistoryRow }) {
  const fields = historyFields(current, previous);
  return (
    <Column gap="xs">
      {!fields.length ? (
        <Text variant="caption" color="textMuted">
          فیلدهای این بخش تغییر نکرده‌اند.
        </Text>
      ) : null}
      {fields.map(({ key, label }) => (
        <Column key={key} gap="xxs">
          <Text variant="captionStrong">{label}</Text>
          {previous ? (
            <>
              <Text variant="tiny" color="textFaint">
                قبل
              </Text>
              <HistoryValue row={previous} field={key} />
              <Text variant="tiny" color="textFaint">
                بعد
              </Text>
            </>
          ) : null}
          <HistoryValue row={current} field={key} />
        </Column>
      ))}
    </Column>
  );
}

function LabHistoryValues({ label, values }: { label: string; values: HistoryRow[] }) {
  const [page, setPage] = useState(0);
  return (
    <Column gap="sm">
      <Text variant="captionStrong">{label}</Text>
      {values.length ? (
        values.slice(page * 20, (page + 1) * 20).map((value, index) => <HistoryFields key={index} current={value} />)
      ) : (
        <Text color="textMuted">نتیجهٔ عددی ندارد.</Text>
      )}
      <Row wrap>
        {page > 0 ? <Button label="نتایج قبلی" variant="ghost" onPress={() => setPage(page - 1)} /> : null}
        {values.length > (page + 1) * 20 ? (
          <Button label="نتایج بعدی" variant="ghost" onPress={() => setPage(page + 1)} />
        ) : null}
      </Row>
    </Column>
  );
}

function HistoryValue({ row, field }: { row: HistoryRow; field: string }) {
  const value = historyValue(row, field);
  return (
    <Text selectable numeric={!hasPersianLetters(value)}>
      {value}
    </Text>
  );
}
