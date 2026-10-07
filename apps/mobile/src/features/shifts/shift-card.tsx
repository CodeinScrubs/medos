import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Column, Input, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { joinLabels, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { matchesShiftDeck, type ShiftDeckRow } from './deck';
import { ShiftPatientBrief } from './patient-brief';
import { activeShiftWorkspaceQuery, shiftProgress } from './queries';

/** The active patient deck is visible immediately; search reaches every member. */
export function ShiftCard({ onShiftPresence }: { onShiftPresence?: (active: boolean | undefined) => void }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const now = new Date(useNow());
  const { data, error, retry } = useLive(activeShiftWorkspaceQuery());
  const shift = data?.[0]?.shift ?? null;
  const rows = useMemo(
    () =>
      (data ?? []).flatMap(({ member, patient, encounter, nextTask }) =>
        member && patient ? [{ member, patient, encounter, nextTask }] : [],
      ),
    [data],
  );
  const reliable = data !== undefined && !error;
  const active = shift !== null;
  useEffect(() => onShiftPresence?.(reliable ? active : undefined), [onShiftPresence, reliable, active]);
  return (
    <Card style={{ marginTop: spacing.lg, borderColor: shift ? colors.primary : colors.border, borderWidth: 1 }}>
      <Column gap="sm">
        <Row justify="space-between" gap="xs">
          <Column gap="xxs" style={{ flex: 1 }}>
            <Text variant="subheading">{shift ? 'بیماران این شیفت' : reliable ? 'شیفتی باز نیست' : 'شیفت'}</Text>
            <Text variant="caption" color="textMuted">
              {shift
                ? joinLabels([shift.ward, `از ${formatJalaliDateTime(shift.startAt)}`])
                : error
                  ? 'خواندن کامل نشد'
                  : reliable
                    ? 'برای جمع‌کردن بیماران، شیفت را شروع کنید.'
                    : 'در حال خواندن…'}
            </Text>
          </Column>
          <Button
            label={shift ? 'مدیریت شیفت' : 'شیفت'}
            variant="ghost"
            size="sm"
            onPress={() => router.push('/shift')}
          />
        </Row>
        <ErrorNotice error={error} what="بیماران شیفت" onRetry={retry} />
        {shift ? <ActiveDeck key={shift.id} rows={rows} now={now} reliable={reliable} /> : null}
      </Column>
    </Card>
  );
}

function ActiveDeck({ rows, now, reliable }: { rows: ShiftDeckRow[]; now: Date; reliable: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const progress = reliable ? shiftProgress(rows) : null;
  const filtered = rows.filter((row) => matchesShiftDeck(row, search));
  const visible = expanded || search.trim() ? filtered : filtered.slice(0, 4);
  return (
    <Column gap="sm">
      <Row justify="space-between" gap="sm">
        <Badge
          label={
            progress
              ? `${toPersianDigits(progress.seen)} از ${toPersianDigits(progress.total)} دیده‌شده`
              : 'وضعیت نامشخص'
          }
          tone={progress && progress.total > 0 && progress.seen === progress.total ? 'success' : 'neutral'}
        />
        <Button
          label="راند"
          icon="walk-outline"
          size="sm"
          variant="secondary"
          disabled={!progress || progress.total === 0}
          onPress={() => router.push('/round')}
        />
      </Row>
      {rows.length > 4 ? (
        <Input
          label="جستجو در شیفت"
          value={search}
          onChangeText={setSearch}
          icon="search-outline"
          placeholder="نام، تخت یا کار بعدی…"
        />
      ) : null}
      {visible.map((row) => (
        <Card key={row.member.id} tone="alt">
          <ShiftPatientBrief
            row={row}
            now={now}
            disabled={!reliable}
            onOpen={() => router.push({ pathname: '/patient/[id]', params: { id: row.patient.id } })}
            onTask={() => router.push({ pathname: '/task', params: { taskId: row.nextTask!.id } })}
          />
        </Card>
      ))}
      {filtered.length === 0 && reliable ? (
        <Text variant="caption" color="textMuted">
          {search.trim() ? 'در این شیفت پیدا نشد.' : 'بیماران را از مدیریت شیفت اضافه کنید.'}
        </Text>
      ) : null}
      {!search.trim() && rows.length > 4 ? (
        <Button
          label={expanded ? 'نمایش کوتاه' : `همهٔ ${toPersianDigits(rows.length)} بیمار همین‌جا`}
          variant="ghost"
          size="sm"
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </Column>
  );
}
