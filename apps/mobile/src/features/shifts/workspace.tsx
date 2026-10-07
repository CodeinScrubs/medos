import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { Button, Column, Text } from '@/components/ui';
import type { Encounter, Patient, Shift, ShiftPatient, Task } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { DatasetChangedError } from '@/lib/dataset-write';

import { activeShiftWorkspaceQuery, type ActiveShiftWorkspaceRow } from './queries';

type Workspace = {
  shift: Shift | null;
  rows: { member: ShiftPatient; patient: Patient; encounter: Encounter | null; nextTask: Task | null }[];
};

function workspace(rows: ActiveShiftWorkspaceRow[]): Workspace {
  return {
    shift: rows[0]?.shift ?? null,
    rows: rows.flatMap(({ member, patient, encounter, nextTask }) =>
      member && patient ? [{ member, patient, encounter, nextTask }] : [],
    ),
  };
}

/** These changes can unmount an editor or move the round's default cursor. */
function identity(view: Workspace): string {
  return JSON.stringify([
    view.shift?.id ?? null,
    view.rows.map(({ member, patient }) => [member.id, patient.id, member.reviewedAt !== null]),
  ]);
}

/**
 * A live read may replace the shift, remove a member or finish the round.
 * Keep the previous view's keyed editors mounted until all registered fields
 * reach storage. This caches a read snapshot; it never reseeds an input.
 * useLive itself keeps its list-refresh contract for the rest of the app.
 */
export function useShiftWorkspace() {
  const { group } = useAutosaveScope()!;
  const { stale } = useDatasetIntent();
  const { data, error: readError, retry } = useLive(activeShiftWorkspaceQuery());
  const error = useMemo(() => readError ?? (stale ? new DatasetChangedError() : undefined), [readError, stale]);
  const incoming = useMemo(() => (data === undefined ? undefined : workspace(data)), [data]);
  const key = incoming === undefined ? undefined : identity(incoming);
  const [displayed, setDisplayed] = useState<{
    key: string;
    source: ActiveShiftWorkspaceRow[];
    view: Workspace;
  }>();
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<{ key: string; attempt: number }>();
  const changing = key !== undefined && displayed !== undefined && key !== displayed.key;
  const saving = changing && !(failedAttempt?.key === key && failedAttempt.attempt === attempt);

  // Keep the latest displayed labels, not merely the initial load. Never cache
  // a failed read or expose the incoming identity beneath an old input.
  if (incoming && data && key !== undefined && !error && !changing && data !== displayed?.source) {
    setDisplayed({ key, source: data, view: incoming });
  }
  const view = displayed?.view;

  useEffect(() => {
    if (error || !data || !incoming || key === undefined || !changing) return;
    let alive = true;
    void group.flush().then((saved) => {
      if (!alive) return;
      if (saved) setDisplayed({ key, source: data, view: incoming });
      else setFailedAttempt({ key, attempt });
    });
    // A second shift change or failed read cancels adoption, not the writes.
    return () => {
      alive = false;
    };
  }, [group, key, changing, error, attempt, data, incoming]);

  function retryReads() {
    retry();
    setAttempt((value) => value + 1);
  }

  return {
    shift: view?.shift ?? null,
    rows: view?.rows ?? [],
    error,
    loading: view === undefined && error === undefined,
    blocked: error !== undefined || view === undefined || changing,
    changing,
    shiftChanging: changing && incoming?.shift?.id !== view?.shift?.id,
    saving,
    retry: retryReads,
  };
}

export function ShiftWorkspaceNotice({
  changing,
  saving,
  onRetry,
}: {
  changing: boolean;
  saving: boolean;
  onRetry: () => void;
}) {
  const { stale } = useDatasetIntent();
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const pending = useRef<symbol | null>(null);
  useEffect(
    () => () => {
      pending.current = null;
    },
    [],
  );
  if (stale)
    return (
      <Button
        label="بستن شیفت قدیمی"
        variant="secondary"
        onPress={() => {
          if (pending.current) return;
          const token = Symbol();
          pending.current = token;
          const consume = (accept: boolean) => {
            if (pending.current !== token) return;
            pending.current = null;
            if (accept) {
              scope.abandonStale();
              router.back();
            }
          };
          Alert.alert(
            'بستن صفحهٔ قدیمی؟',
            'پیش از بستن، نوشته‌های روی صفحه را مرور یا کپی کنید.',
            [
              { text: 'ماندن', style: 'cancel', onPress: () => consume(false) },
              { text: 'بستن', onPress: () => consume(true) },
            ],
            { cancelable: true, onDismiss: () => consume(false) },
          );
        }}
      />
    );
  return changing ? (
    <Column gap="xs">
      <Text variant="caption" color="textMuted">
        لیست شیفت تغییر کرده؛ نوشته‌ها تا ذخیره‌شدن روی همین بیمار می‌مانند.
      </Text>
      <Button label="ذخیره و ادامه" variant="secondary" loading={saving} onPress={onRetry} />
    </Column>
  ) : null;
}
