import { useState, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Button, Column, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { datasetGeneration, subscribeDataset } from '@/lib/dataset-write';
import type { WorkspaceFormKind } from '@/lib/form-document';
import { formatRelative } from '@/lib/jalali';

import { workspaceDraftsQuery, type WorkspaceDraftCursor } from './queries';

type DraftLink = { id: string; recordId: string | null; updatedAt: Date; title: string | null };
type DraftPageQuery = (cursor: WorkspaceDraftCursor | null) => { then: Promise<DraftLink[]>['then'] };
type DraftNavigationProps = {
  kind: WorkspaceFormKind;
  onOpen: (recordId: string | null, draftId: string) => void;
  contextKey?: string;
  queryPage?: DraftPageQuery;
};

/** Three short links, inside the existing notebook; older input stays reachable. */
export function UnfinishedWorkspaceForms({ kind, onOpen, contextKey = '', queryPage }: DraftNavigationProps) {
  const current = useSyncExternalStore(subscribeDataset, datasetGeneration, datasetGeneration);
  return (
    <DraftNavigation
      key={JSON.stringify([kind, contextKey, current])}
      kind={kind}
      onOpen={onOpen}
      contextKey={contextKey}
      queryPage={queryPage}
    />
  );
}

/** Reset only this read-only pager when its patient/notebook or dataset changes. */
function DraftNavigation({ kind, onOpen, contextKey = '', queryPage }: DraftNavigationProps) {
  const [previous, setPrevious] = useState<(WorkspaceDraftCursor | null)[]>([]);
  const [cursor, setCursor] = useState<WorkspaceDraftCursor | null>(null);
  return (
    <DraftPage
      key={JSON.stringify([kind, contextKey, cursor])}
      kind={kind}
      cursor={cursor}
      hasPrevious={previous.length > 0}
      onOpen={onOpen}
      contextKey={contextKey}
      queryPage={queryPage}
      onOlder={(next) => {
        setPrevious([...previous, cursor]);
        setCursor(next);
      }}
      onNewer={() => {
        setCursor(previous.at(-1) ?? null);
        setPrevious(previous.slice(0, -1));
      }}
    />
  );
}
function DraftPage({
  kind,
  cursor,
  hasPrevious,
  onOpen,
  onOlder,
  onNewer,
  contextKey,
  queryPage,
}: {
  kind: WorkspaceFormKind;
  cursor: WorkspaceDraftCursor | null;
  hasPrevious: boolean;
  onOpen: (recordId: string | null, draftId: string) => void;
  onOlder: (cursor: WorkspaceDraftCursor) => void;
  onNewer: () => void;
  contextKey: string;
  queryPage?: DraftPageQuery;
}) {
  const { data, error, retry } = useLive(queryPage ? queryPage(cursor) : workspaceDraftsQuery(kind, cursor), [
    kind,
    contextKey,
    cursor,
  ]);
  const now = useNow();
  const rows = data?.slice(0, 3) ?? [];
  if (!error && !rows.length && !hasPrevious) return null;
  return (
    <Column gap="xs">
      <ErrorNotice error={error} what="نوشته‌های ناتمام" onRetry={retry} />
      <Row gap="xs" wrap>
        <Text variant="captionStrong">نوشته‌های ناتمام</Text>
        {hasPrevious ? <Button label="جدیدتر" size="sm" variant="ghost" onPress={onNewer} /> : null}
        {!error && data && data.length > 3 ? (
          <Button label="قدیمی‌تر" size="sm" variant="ghost" onPress={() => onOlder(rows.at(-1)!)} />
        ) : null}
      </Row>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          disabled={!!error}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}
          accessibilityLabel={`ادامهٔ ${row.title?.trim() || 'نوشتهٔ ناتمام'}`}
          onPress={() => onOpen(row.recordId, row.id)}
        >
          <Row justify="space-between" gap="sm">
            <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {row.title?.trim() || 'نوشتهٔ ناتمام'}
            </Text>
            <Text variant="tiny" color="textFaint">
              {formatRelative(row.updatedAt, new Date(now))}
            </Text>
          </Row>
        </Pressable>
      ))}
    </Column>
  );
}
