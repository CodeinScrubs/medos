import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Column, EmptyState, Row, Screen, Text } from '@/components/ui';
import type { Shift } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { useTheme } from '@/theme';

import { shiftHistoryPatientsQuery, shiftQuery, shiftsQuery } from './queries';

/** Historical shifts stay separate from the current shift and cannot restart it by being opened. */
export function ShiftHistoryScreen() {
  const { shiftId } = useLocalSearchParams<{ shiftId?: string }>();
  return shiftId ? <ShiftDetailGate key={shiftId} id={shiftId} /> : <ShiftHistoryList />;
}

function ShiftHistoryList() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [limit, setLimit] = useState(30);
  const { data, error } = useLive(shiftsQuery(limit + 1), [limit]);
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'شیفت‌های قبلی' }} />
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error} what="شیفت‌ها" />
        {data?.slice(0, limit).map((shift) => (
          <Card key={shift.id}>
            <Column gap="xs">
              <Row justify="space-between">
                <Text variant="bodyStrong">{formatJalaliDateTime(shift.startAt)}</Text>
                <Badge label={shift.isActive ? 'باز' : 'پایان‌یافته'} tone={shift.isActive ? 'info' : 'neutral'} />
              </Row>
              {shift.ward ? <Text variant="caption">{shift.ward}</Text> : null}
              <Button
                label="دیدن شیفت"
                variant="ghost"
                size="sm"
                onPress={() => router.push({ pathname: '/shift-history', params: { shiftId: shift.id } })}
              />
            </Column>
          </Card>
        ))}
        {!error && data?.length === 0 ? <EmptyState icon="time-outline" title="هنوز شیفتی ثبت نشده" /> : null}
        {(data?.length ?? 0) > limit ? (
          <Button label="بیشتر" variant="ghost" onPress={() => setLimit((n) => n + 30)} />
        ) : null}
      </Column>
    </Screen>
  );
}

function ShiftDetailGate({ id }: { id: string }) {
  const { data, error } = useLive(shiftQuery(id), [id]);
  if (error)
    return (
      <Screen>
        <ErrorNotice error={error} what="شیفت" />
      </Screen>
    );
  return (
    <EditGate editing rows={data}>
      {(shift) => (shift ? <ShiftDetail key={shift.id} shift={shift} /> : null)}
    </EditGate>
  );
}

function ShiftDetail({ shift }: { shift: Shift }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const { data, error } = useLive(shiftHistoryPatientsQuery(shift.id), [shift.id]);
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'گزارش شیفت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="heading">{formatJalaliDateTime(shift.startAt)}</Text>
        {shift.ward ? <Text>{shift.ward}</Text> : null}
        {shift.endAt ? <Text variant="caption">پایان: {formatJalaliDateTime(shift.endAt)}</Text> : null}
        {shift.notes ? <Text>{shift.notes}</Text> : null}
        <ErrorNotice error={error} what="بیماران شیفت" />
        {data?.map(({ member, patient }) => (
          <Card key={member.id}>
            <Column gap="xs">
              <Text variant="bodyStrong">
                {patient ? fullName(patient.firstName, patient.lastName) : 'بیمار حذف‌شده'}
              </Text>
              {member.deletedAt ? <Badge label="از فهرست شیفت برداشته شده" /> : null}
              {member.reviewedAt ? (
                <Text variant="tiny">دیده شد: {formatJalaliDateTime(member.reviewedAt)}</Text>
              ) : null}
              {member.shiftSummary ? <Text selectable>{member.shiftSummary}</Text> : null}
              {member.handoffNote ? (
                <>
                  <Text variant="captionStrong">یادداشت تحویل</Text>
                  <Text selectable>{member.handoffNote}</Text>
                </>
              ) : null}
              {patient ? (
                <Button
                  label="پرونده"
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } })}
                />
              ) : null}
            </Column>
          </Card>
        ))}
        {!error && data?.length === 0 ? <Text color="textMuted">بیماری در این شیفت ثبت نشده.</Text> : null}
      </Column>
    </Screen>
  );
}
