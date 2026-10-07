import { Pressable } from 'react-native';

import { Badge, Column, Row, Text } from '@/components/ui';
import { MIN_TOUCH } from '@/theme';

import { shiftPatientBrief, type ShiftDeckRow } from './deck';

/** The same compact, sourced overview in Today and the complete shift. */
export function ShiftPatientBrief({
  row,
  now,
  onOpen,
  onTask,
  disabled = false,
}: {
  row: ShiftDeckRow;
  now: Date;
  onOpen: () => void;
  onTask: () => void;
  disabled?: boolean;
}) {
  const brief = shiftPatientBrief(row, now);
  return (
    <Column gap="xxs" style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`پروندهٔ ${brief.name}`}
        disabled={disabled}
        onPress={onOpen}
        style={{ minHeight: MIN_TOUCH }}
      >
        <Column gap="xxs">
          <Row gap="xs" justify="space-between">
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {brief.name}
            </Text>
            {brief.ageSex ? (
              <Text variant="caption" numeric>
                {brief.ageSex}
              </Text>
            ) : null}
          </Row>
          {brief.location ? (
            <Text variant="caption" color="textMuted">
              {brief.location}
            </Text>
          ) : null}
          {brief.admission ? (
            <Text variant="tiny" color="textFaint">
              {brief.admission}
            </Text>
          ) : null}
          {brief.summary ? (
            <Text variant="caption" numberOfLines={2}>
              {brief.summary}
            </Text>
          ) : null}
          {row.encounter?.dischargedAt ? <Badge label="دورهٔ این شیفت ترخیص شده" /> : null}
          {row.encounter && !row.encounter.isActive && !row.encounter.dischargedAt ? (
            <Badge label="دورهٔ قبلی؛ پرونده را مرور کنید" />
          ) : null}
        </Column>
      </Pressable>
      {brief.task ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`اقدام بعدی: ${brief.task}`}
          disabled={disabled}
          onPress={onTask}
          style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}
        >
          <Text variant="caption" color="primary" numberOfLines={2}>
            بعدی: {brief.task}
          </Text>
        </Pressable>
      ) : null}
    </Column>
  );
}
