import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Card, ChipSelect, Column, EmptyState, Row, Text } from '@/components/ui';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import {
  timelineCursor,
  type TimelineCursor,
  type TimelineFilter,
  type TimelineItem,
  type TimelineKind,
} from './logic';
import { useTimeline } from './use-timeline';

const ICON: Record<TimelineKind, keyof typeof Ionicons.glyphMap> = {
  encounter: 'bed-outline',
  note: 'document-text-outline',
  lab: 'flask-outline',
  imaging: 'scan-outline',
  consult: 'chatbubbles-outline',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  encounter: 'بستری',
  note: 'نوت',
  lab: 'آزمایش',
  imaging: 'تصویربرداری',
  consult: 'کانسالت',
};

/**
 * What happened to this patient, newest first.
 *
 * One bounded page of the owners' own rows. A tap opens the actual record.
 * Keep the patient's one scroll/native-header host mounted across page changes.
 */
export function TimelineTab(props: { patientId: string; onPageChange?: () => void }) {
  return <TimelineBrowser key={props.patientId} {...props} />;
}

function TimelineBrowser({ patientId, onPageChange }: { patientId: string; onPageChange?: () => void }) {
  const router = useRouter();
  const navigation = useNavigation();
  const scope = useAutosaveScope();
  const { generation, stale } = useDatasetIntent();
  const opening = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { spacing } = useTheme();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [history, setHistory] = useState<TimelineCursor[]>([]);
  const cursor = history.at(-1);
  const open = (item: TimelineItem) => {
    if (opening.current || stale) return;
    opening.current = true;
    const navigate = () => {
      if (!mounted.current || !navigation.isFocused()) return;
      switch (item.kind) {
        case 'note':
          router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId: item.sourceId } });
          break;
        case 'lab':
          router.push({ pathname: '/patient/[id]/lab', params: { id: patientId, panelId: item.sourceId } });
          break;
        case 'imaging':
          router.push({ pathname: '/patient/[id]/imaging', params: { id: patientId, studyId: item.sourceId } });
          break;
        case 'consult':
          router.push({ pathname: '/consult-answer', params: { consultId: item.sourceId } });
          break;
        case 'encounter':
          router.push({ pathname: '/patient/[id]/encounter', params: { id: patientId, encounterId: item.sourceId } });
          break;
      }
    };
    void (async () => {
      try {
        if (scope) await scope.perform(navigate);
        else await withDatasetWrite(generation, async () => navigate());
      } catch (e) {
        alertError('باز نشد', e);
      } finally {
        opening.current = false;
      }
    })();
  };
  return (
    <Column gap="sm" style={{ paddingTop: spacing.md }}>
      <ChipSelect<TimelineFilter>
        layout="wrap"
        options={[
          { value: 'all', label: 'همه' },
          ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value: value as TimelineKind, label })),
        ]}
        value={filter}
        onChange={(next) => {
          if (!next || next === filter) return;
          setFilter(next);
          setHistory([]);
          onPageChange?.();
        }}
      />
      <TimelinePage
        key={`${filter}:${cursor?.at ?? ''}:${cursor?.id ?? ''}`}
        patientId={patientId}
        filter={filter}
        cursor={cursor}
        stale={stale}
        onOpen={open}
        onOlder={(next) => {
          setHistory([...history, next]);
          onPageChange?.();
        }}
        onNewer={
          history.length
            ? () => {
                setHistory(history.slice(0, -1));
                onPageChange?.();
              }
            : undefined
        }
      />
    </Column>
  );
}

function TimelinePage({
  patientId,
  filter,
  cursor,
  stale,
  onOpen,
  onOlder,
  onNewer,
}: {
  patientId: string;
  filter: TimelineFilter;
  cursor?: TimelineCursor;
  stale: boolean;
  onOpen: (item: TimelineItem) => void;
  onOlder: (cursor: TimelineCursor) => void;
  onNewer?: () => void;
}) {
  const { colors } = useTheme();
  const { items, hasMore, loading, error, failedSources, retry } = useTimeline(patientId, filter, cursor);

  if (!loading && !error && items.length === 0) {
    return (
      <Column>
        {onNewer ? <Button label="جدیدتر" variant="secondary" onPress={onNewer} /> : null}
        <EmptyState
          icon="time-outline"
          title={filter === 'all' && !cursor ? 'هنوز چیزی ثبت نشده' : 'رویدادی در این بخش نیست'}
        />
      </Column>
    );
  }

  return (
    <Column gap="sm">
      <ErrorNotice
        error={error}
        what={failedSources.length ? `تایم‌لاین (${failedSources.join('، ')})` : 'تایم‌لاین'}
        onRetry={retry}
      />
      {loading ? (
        <Text variant="tiny" color="textFaint">
          در حال خواندن…
        </Text>
      ) : null}
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${item.title ?? KIND_LABEL[item.kind]}، ${formatJalaliDateTime(item.at)}`}
          disabled={stale}
          onPress={() => onOpen(item)}
        >
          <Card>
            <Row gap="sm" align="flex-start">
              <Ionicons name={ICON[item.kind]} size={18} color={colors.primary} style={styles.icon} />
              <Column gap="xxs" style={styles.grow}>
                <Row justify="space-between" gap="sm">
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
                    {item.title}
                  </Text>
                  <Text variant="tiny" color="textFaint">
                    {formatJalaliDateTime(item.at)}
                  </Text>
                </Row>
                {item.summary ? (
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
                <Text variant="tiny" color="textFaint">
                  {KIND_LABEL[item.kind]}
                  {item.results && item.results.total > item.results.shown
                    ? ` · ${toPersianDigits(item.results.shown)} از ${toPersianDigits(item.results.total)} نتیجه`
                    : ''}
                </Text>
              </Column>
            </Row>
          </Card>
        </Pressable>
      ))}

      {items.length > 0 ? (
        <Text variant="tiny" color="textFaint">
          {toPersianDigits(items.length)}{' '}
          {error || loading ? 'رویداد خوانده‌شده؛ فهرست کامل نیست' : 'رویداد در این صفحه'}
        </Text>
      ) : null}
      <Row wrap>
        {onNewer ? <Button label="جدیدتر" variant="secondary" onPress={onNewer} /> : null}
        {hasMore && items.length ? (
          <Button
            label="قدیمی‌تر"
            variant="secondary"
            disabled={loading || Boolean(error)}
            onPress={() => onOlder(timelineCursor(items.at(-1)!))}
          />
        ) : null}
      </Row>
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  icon: { marginTop: 2 },
});
