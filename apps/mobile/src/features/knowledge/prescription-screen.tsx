import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { copyText } from '@/features/doctors/actions';
import { formatJalali } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { AGE_GROUP_LABELS } from './labels';
import { itemsOf, prescriptionLine, prescriptionText } from './logic';
import {
  deletePrescription,
  duplicatePrescription,
  markPrescriptionUsed,
  prescriptionQuery,
  setPrescriptionStarred,
} from './prescriptions-queries';

/**
 * One saved prescription, ready to be copied out.
 *
 * "استفاده کردم" copies the text and counts the use, which is what pushes the
 * templates written every clinic to the top of the list. MedOS does not write
 * a prescription into a patient's record from here: that is a clinical act,
 * and it stays a deliberate one.
 *
 * Route param: `id`.
 */
export function PrescriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data, error } = useLive(prescriptionQuery(id ?? ''), [id]);
  const template = data?.[0];

  if (!template) {
    return (
      <Screen>
        <ScreenOptions options={{ title: 'نسخه' }} />
        <ErrorNotice error={error} what="نسخه" />
        {data && !error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="پیدا نشد"
            description="ممکن است حذف شده باشد."
            action={<Button label="بازگشت" variant="ghost" onPress={() => router.back()} />}
          />
        ) : null}
      </Screen>
    );
  }

  const items = itemsOf(template);
  const text = prescriptionText(template, items);

  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: template.title,
          headerRight: () => (
            <Row gap="xxs">
              <IconButton
                icon={template.starred ? 'star' : 'star-outline'}
                label={template.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
                onPress={() =>
                  void setPrescriptionStarred(template.id, !template.starred).catch((e) =>
                    alertError('تغییر ثبت نشد', e),
                  )
                }
              />
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() => router.push({ pathname: '/knowledge/rx/edit', params: { templateId: template.id } })}
              />
            </Row>
          ),
        }}
      />

      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Row gap="xs" wrap>
          {template.condition ? <Badge label={template.condition} /> : null}
          {template.ageGroup !== 'any' ? <Badge label={AGE_GROUP_LABELS[template.ageGroup]} tone="info" /> : null}
          {template.usageCount > 0 ? (
            <Badge label={`${toPersianDigits(template.usageCount)} بار استفاده`} tone="neutral" />
          ) : null}
          {template.lastUsedAt ? (
            <Text variant="tiny" color="textFaint">
              آخرین بار: {formatJalali(template.lastUsedAt)}
            </Text>
          ) : null}
        </Row>

        <Card>
          <Column gap="sm">
            {items.map((item, index) => (
              <Column key={index} gap="xxs">
                <Row gap="xs">
                  <Text variant="caption" color="textMuted">
                    {toPersianDigits(index + 1)}.
                  </Text>
                  <Text variant="body" ltr numeric style={styles.grow}>
                    {prescriptionLine(item)}
                  </Text>
                </Row>
                {item.notes ? (
                  <Text variant="tiny" color="textFaint">
                    {item.notes}
                  </Text>
                ) : null}
              </Column>
            ))}
          </Column>
        </Card>

        <Section title="توصیه‌ها" body={template.adviceText} />
        <Section title="هشدارها" body={template.cautionsText} tone="danger" />
        <Section title="پیگیری" body={template.followUpText} />

        {(template.tags ?? []).length > 0 ? (
          <Row gap="xs" wrap>
            {(template.tags ?? []).map((tag) => (
              <Badge key={tag} label={tag} />
            ))}
          </Row>
        ) : null}

        <Button
          label="کپی متن و ثبت استفاده"
          icon="copy-outline"
          full
          onPress={() => {
            void (async () => {
              await copyText(text);
              await markPrescriptionUsed(template.id);
            })();
          }}
        />
        <Button
          label="ساخت نسخه‌ی مشابه"
          icon="duplicate-outline"
          variant="secondary"
          full
          onPress={() => {
            void duplicatePrescription(template.id).then((newId) =>
              router.replace({ pathname: '/knowledge/rx/edit', params: { templateId: newId } }),
            );
          }}
        />
        <Text variant="tiny" color="textFaint">
          این متن همانی است که خودتان نوشته‌اید. MedOS دارو یا دوز پیشنهاد نمی‌دهد و تداخل بررسی نمی‌کند.
        </Text>

        <Button
          label="حذف نسخه"
          icon="trash-outline"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('حذف این نسخه؟', template.title, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  void deletePrescription(template.id).then(() => router.back());
                },
              },
            ])
          }
        />
      </Column>
    </Screen>
  );
}

function Section({ title, body, tone }: { title: string; body: string | null; tone?: 'danger' }) {
  const { colors } = useTheme();
  if (!body?.trim()) return null;
  return (
    <Card style={tone === 'danger' ? { borderColor: colors.danger, borderWidth: 1 } : undefined}>
      <Column gap="xxs">
        <Text variant="captionStrong" color={tone === 'danger' ? 'danger' : 'textMuted'}>
          {title}
        </Text>
        <Text variant="body">{body}</Text>
      </Column>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
