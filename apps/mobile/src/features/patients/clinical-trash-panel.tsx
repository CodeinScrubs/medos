import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, ChipSelect, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { datasetGeneration } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';

import {
  CLINICAL_TRASH_KINDS,
  deletedClinicalCountQuery,
  deletedClinicalQuery,
  restoreClinicalRecord,
  type ClinicalTrashCursor,
  type ClinicalTrashKind,
  type ClinicalRestoreNotice,
} from './clinical-trash-queries';
import { HISTORY_KIND_LABEL } from './history-labels';

type Owner = {
  generation: number;
  stale: boolean;
  locked: boolean;
  restore: (work: () => Promise<void | ClinicalRestoreNotice>) => Promise<void>;
};
type DeletedRow = Awaited<ReturnType<typeof deletedClinicalQuery>>[number];

export function ClinicalTrashPanel(props: Owner) {
  const [kind, setKind] = useState<ClinicalTrashKind | 'all'>('all');
  const [pages, setPages] = useState<ClinicalTrashCursor[]>([]);
  const cursor = pages.at(-1);
  return (
    <Column gap="sm">
      <SectionHeader title="سوابق بالینی" />
      <ChipSelect<ClinicalTrashKind | 'all'>
        layout="wrap"
        value={kind}
        options={[
          { value: 'all', label: 'همه' },
          ...CLINICAL_TRASH_KINDS.map((value) => ({ value, label: HISTORY_KIND_LABEL[value] })),
        ]}
        onChange={(next) => {
          if (next && next !== kind) {
            setKind(next);
            setPages([]);
          }
        }}
      />
      <ClinicalTrashPage
        key={`${kind}:${cursor?.deletedAt.getTime() ?? ''}:${cursor?.kind ?? ''}:${cursor?.id ?? ''}`}
        {...props}
        kind={kind}
        cursor={cursor}
        onOlder={(next) => setPages([...pages, next])}
        onNewer={pages.length ? () => setPages(pages.slice(0, -1)) : undefined}
      />
    </Column>
  );
}

function ClinicalTrashPage({
  generation,
  stale,
  locked,
  restore,
  kind,
  cursor,
  onOlder,
  onNewer,
}: Owner & {
  kind: ClinicalTrashKind | 'all';
  cursor?: ClinicalTrashCursor;
  onOlder: (cursor: ClinicalTrashCursor) => void;
  onNewer?: () => void;
}) {
  const navigation = useNavigation();
  const filter = kind === 'all' ? {} : { kind };
  const read = useLive(deletedClinicalQuery(filter, cursor), [
    kind,
    cursor?.deletedAt.getTime(),
    cursor?.kind,
    cursor?.id,
  ]);
  const count = useLive(deletedClinicalCountQuery(filter), [kind]);
  const rows = (read.data ?? []).slice(0, 20);
  const ready = !stale && !locked && !read.error && !count.error && read.data !== undefined && count.data !== undefined;
  const latest = useRef({ ready, rows });
  useLayoutEffect(() => {
    latest.current = { ready, rows };
  }, [ready, rows]);
  const mounted = useRef(true);
  const attempt = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current = null;
    };
  }, []);

  function confirm(row: DeletedRow) {
    if (!mounted.current || attempt.current || !latest.current.ready || !navigation.isFocused()) return;
    const token = Symbol('clinical restore');
    attempt.current = token;
    let used = false;
    const release = () => {
      if (attempt.current === token) attempt.current = null;
    };
    const owns = () =>
      mounted.current &&
      attempt.current === token &&
      latest.current.ready &&
      generation === datasetGeneration() &&
      navigation.isFocused();
    Alert.alert(
      'برگرداندن سابقه؟',
      [
        `${HISTORY_KIND_LABEL[row.kind]} — ${fullName(row.firstName ?? '', row.lastName ?? '') || 'بیمار در دسترس نیست'}`,
        row.title,
        row.kind === 'encounter'
          ? 'این نوبت فقط به صورت سابقهٔ غیرفعال برمی‌گردد. وضعیت فعلی بیمار و کاردکس تغییر نمی‌کند. سوابق زندهٔ همین نوبت دوباره دیده می‌شوند؛ موارد جداگانه حذف‌شده برنمی‌گردند.'
          : 'موارد جداگانه حذف‌شده همراه آن برنمی‌گردند.',
      ]
        .filter(Boolean)
        .join('\n'),
      [
        { text: 'انصراف', style: 'cancel', onPress: release },
        {
          text: 'برگردان',
          onPress: () => {
            if (used) return;
            used = true;
            if (
              !owns() ||
              !latest.current.rows.some(
                (current) =>
                  current.kind === row.kind && current.id === row.id && current.expectedBasis === row.expectedBasis,
              )
            ) {
              release();
              read.retry();
              count.retry();
              return;
            }
            void restore(() => restoreClinicalRecord(row.kind, row.id, row.expectedBasis, new Date()))
              .finally(() => {
                release();
                if (mounted.current) {
                  read.retry();
                  count.retry();
                }
              })
              .catch((e: unknown) => {
                if (mounted.current && navigation.isFocused()) alertError('برگردانده نشد', e);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

  return (
    <Column gap="sm">
      <ErrorNotice error={read.error} what="سوابق حذف‌شده" onRetry={read.retry} />
      <ErrorNotice error={count.error} what="تعداد سوابق حذف‌شده" onRetry={count.retry} />
      {read.loading || count.loading ? <Text color="textMuted">در حال خواندن…</Text> : null}
      {!stale && !read.error && !count.error && !read.loading && !count.loading && !rows.length ? (
        <Text variant="caption" color="textMuted">
          سابقه‌ای در این صفحه نیست.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Card key={`${row.kind}:${row.id}`}>
          <Column gap="xs">
            <Text variant="captionStrong">
              {HISTORY_KIND_LABEL[row.kind]} —{' '}
              {fullName(row.firstName ?? '', row.lastName ?? '') || 'پروندهٔ بیمار در دسترس نیست'}
            </Text>
            <Text numberOfLines={2}>{row.title}</Text>
            {row.at ? (
              <Text variant="tiny" color="textMuted">
                زمان سابقه: {formatJalaliDateTime(row.at)}
              </Text>
            ) : null}
            <Text variant="tiny" color="textFaint">
              حذف در {formatJalaliDateTime(row.deletedAt)}
            </Text>
            <Button
              label="برگرداندن سابقه"
              size="sm"
              variant="secondary"
              disabled={!ready}
              onPress={() => confirm(row)}
            />
          </Column>
        </Card>
      ))}
      <Row wrap>
        {onNewer ? <Button label="سوابق جدیدتر" variant="secondary" disabled={locked} onPress={onNewer} /> : null}
        {(read.data?.length ?? 0) > 20 && rows.length ? (
          <Button
            label="سوابق قدیمی‌تر"
            variant="secondary"
            disabled={!ready}
            onPress={() => {
              const row = rows.at(-1)!;
              onOlder({ deletedAt: row.deletedAt, kind: row.kind, id: row.id });
            }}
          />
        ) : null}
      </Row>
    </Column>
  );
}
