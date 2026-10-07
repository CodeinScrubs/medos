import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { AutosaveField } from '@/components/autosave-field';
import { useAutosaveScope } from '@/components/autosave-scope';
import { Button, Card, Column, IconButton, Row, Text } from '@/components/ui';
import { MIN_TOUCH, useTheme } from '@/theme';

import type { ShiftDeckRow } from './deck';
import { ShiftPatientBrief } from './patient-brief';
import { removePatientFromShift, saveShiftPatientText, setShiftPatientReviewed } from './queries';

export function ShiftPatientRow({
  row,
  now,
  blocked,
  ordering,
  onUp,
  onDown,
  first,
  last,
}: {
  row: ShiftDeckRow;
  now: Date;
  blocked: boolean;
  ordering: boolean;
  onUp: () => void;
  onDown: () => void;
  first: boolean;
  last: boolean;
}) {
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { member, patient } = row;
  const seen = member.reviewedAt !== null;
  return (
    <Card>
      <Column gap="xs">
        <Row gap="sm" align="flex-start">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: seen, disabled: blocked }}
            disabled={blocked}
            accessibilityLabel={seen ? 'برگرداندن به دیده‌نشده' : 'دیدم'}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => void scope.perform(() => setShiftPatientReviewed(member.id, !seen))}
          >
            <Ionicons
              name={seen ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={seen ? colors.success : colors.textFaint}
            />
          </Pressable>
          <ShiftPatientBrief
            row={row}
            now={now}
            disabled={blocked}
            onOpen={() =>
              void scope.perform(() => router.push({ pathname: '/patient/[id]', params: { id: patient.id } }))
            }
            onTask={() =>
              void scope.perform(() => router.push({ pathname: '/task', params: { taskId: row.nextTask!.id } }))
            }
          />
        </Row>
        {!expanded && member.handoffNote ? (
          <Text variant="tiny" color="textMuted" numberOfLines={1}>
            تحویل: {member.handoffNote}
          </Text>
        ) : null}
        <Row gap="xs" justify="space-between" wrap>
          <Button
            label={expanded ? 'بستن تحویل' : 'تحویل شیفت'}
            variant="ghost"
            size="sm"
            disabled={blocked}
            onPress={() => void scope.perform(() => setExpanded((v) => !v))}
          />
          <IconButton
            icon="document-text-outline"
            label={`نوت برای ${patient.firstName} ${patient.lastName}`}
            disabled={blocked}
            onPress={() =>
              void scope.perform(() =>
                router.push({ pathname: '/patient/[id]/note', params: { id: patient.id, type: 'progress' } }),
              )
            }
          />
          {ordering ? (
            <Row gap="xxs">
              <IconButton icon="arrow-up" label="بالاتر در راند" disabled={blocked || first} onPress={onUp} />
              <IconButton icon="arrow-down" label="پایین‌تر در راند" disabled={blocked || last} onPress={onDown} />
            </Row>
          ) : null}
        </Row>
        {expanded ? (
          <>
            <AutosaveField
              label="یادداشت تحویل شیفت"
              initialValue={member.handoffNote}
              onSave={(value) => saveShiftPatientText(member, { handoffNote: value })}
              placeholder="چیزی که نفر بعد باید بداند"
              multiline
            />
            <Button
              label="برداشتن از شیفت"
              variant="ghost"
              size="sm"
              disabled={blocked}
              onPress={() => void scope.perform(() => removePatientFromShift(member.id))}
            />
          </>
        ) : null}
      </Column>
    </Card>
  );
}
