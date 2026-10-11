import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, ChipSelect, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { datasetGeneration } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';

import {
  deletedPlacesCountQuery,
  deletedPlacesQuery,
  restoreExtension,
  restorePlace,
  type PlaceTrashCursor,
  type PlaceTrashKind,
} from './trash-queries';

type Owner = {
  generation: number;
  stale: boolean;
  locked: boolean;
  restore: (work: () => Promise<void>) => Promise<void>;
};
type DeletedRow = Awaited<ReturnType<typeof deletedPlacesQuery>>[number];
const labels = { place: 'مکان', extension: 'داخلی' } as const;

/** One more section in the existing trash, with the same bounded original-intent contract. */
export function PlaceTrashPanel(props: Owner) {
  const [kind, setKind] = useState<PlaceTrashKind | 'all'>('all');
  const [pages, setPages] = useState<PlaceTrashCursor[]>([]);
  const cursor = pages.at(-1);
  return (
    <Column gap="sm">
      <SectionHeader title="مکان‌ها و داخلی‌ها" />
      <ChipSelect<PlaceTrashKind | 'all'>
        layout="wrap"
        value={kind}
        options={[
          { value: 'all', label: 'همه' },
          { value: 'place', label: 'مکان‌ها' },
          { value: 'extension', label: 'داخلی‌ها' },
        ]}
        onChange={(next) => {
          if (next && next !== kind) {
            setKind(next);
            setPages([]);
          }
        }}
      />
      <PlaceTrashPage
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

function PlaceTrashPage({
  generation,
  stale,
  locked,
  restore,
  kind,
  cursor,
  onOlder,
  onNewer,
}: Owner & {
  kind: PlaceTrashKind | 'all';
  cursor?: PlaceTrashCursor;
  onOlder: (cursor: PlaceTrashCursor) => void;
  onNewer?: () => void;
}) {
  const navigation = useNavigation();
  const filter = kind === 'all' ? undefined : kind;
  const read = useLive(deletedPlacesQuery(filter, cursor), [
    kind,
    cursor?.deletedAt.getTime(),
    cursor?.kind,
    cursor?.id,
  ]);
  const count = useLive(deletedPlacesCountQuery(filter), [kind]);
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
    const currentChoice = () =>
      latest.current.rows.some((r) => r.kind === row.kind && r.id === row.id && r.expectedBasis === row.expectedBasis);
    const ownsScreen = () => mounted.current && generation === datasetGeneration() && navigation.isFocused();
    if (!ownsScreen() || attempt.current || !latest.current.ready || !currentChoice()) return;
    const token = Symbol('place restore');
    attempt.current = token;
    let used = false;
    const release = () => {
      if (attempt.current === token) attempt.current = null;
    };
    Alert.alert(
      'برگرداندن مورد؟',
      [
        `${labels[row.kind]} — ${row.title}`,
        row.kind === 'extension' ? `مکان اصلی: ${row.parentName ?? 'در دسترس نیست'}` : null,
        row.kind === 'place'
          ? 'داخلی‌های زندهٔ این مکان دوباره دیده می‌شوند. موارد جداگانه حذف‌شده برنمی‌گردند.'
          : 'داخلی فقط به مکان اصلی برمی‌گردد؛ اگر مکان حذف شده، ابتدا آن را بازیابی کنید.',
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
            if (!ownsScreen() || attempt.current !== token || !latest.current.ready || !currentChoice()) {
              release();
              read.retry();
              count.retry();
              return;
            }
            void restore(() =>
              row.kind === 'place'
                ? restorePlace(row.id, row.expectedBasis, new Date())
                : restoreExtension(row.id, row.expectedBasis, new Date()),
            )
              .finally(() => {
                release();
                if (mounted.current) {
                  read.retry();
                  count.retry();
                }
              })
              .catch((e: unknown) => {
                if (ownsScreen()) alertError('برگردانده نشد', e);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

  return (
    <Column gap="sm">
      <ErrorNotice error={read.error} what="مکان‌ها و داخلی‌های حذف‌شده" onRetry={read.retry} />
      <ErrorNotice error={count.error} what="تعداد مکان‌ها و داخلی‌های حذف‌شده" onRetry={count.retry} />
      {read.loading || count.loading ? <Text color="textMuted">در حال خواندن…</Text> : null}
      {!stale && !read.error && !count.error && !read.loading && !count.loading && !rows.length ? (
        <Text variant="caption" color="textMuted">
          موردی در این صفحه نیست.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Card key={`${row.kind}:${row.id}`}>
          <Column gap="xs">
            <Text variant="captionStrong">
              {labels[row.kind]} — {row.title}
            </Text>
            {row.kind === 'extension' ? (
              <Text variant="caption" color="textMuted">
                {row.parentName ?? 'مکان اصلی در دسترس نیست'}
              </Text>
            ) : null}
            <Text variant="tiny" color="textFaint">
              حذف در {formatJalaliDateTime(row.deletedAt)}
            </Text>
            <Button
              label="برگرداندن مکان یا داخلی"
              size="sm"
              variant="secondary"
              disabled={!ready}
              onPress={() => confirm(row)}
            />
          </Column>
        </Card>
      ))}
      <Row wrap>
        {onNewer ? <Button label="موارد جدیدتر" variant="secondary" disabled={locked} onPress={onNewer} /> : null}
        {(read.data?.length ?? 0) > 20 && rows.length ? (
          <Button
            label="موارد قدیمی‌تر"
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
