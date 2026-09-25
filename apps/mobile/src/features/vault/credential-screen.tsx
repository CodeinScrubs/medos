import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, DataRow, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { copyText } from '@/features/doctors/actions';
import { formatJalaliLong } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { daysUntilExpiry } from './logic';
import {
  credentialQuery,
  credentialSecret,
  deleteCredential,
  markCredentialUsed,
  setCredentialStarred,
} from './queries';

/**
 * One saved login.
 *
 * The password is hidden until it is asked for — that is for shoulders in a
 * ward corridor, not for security; anyone holding the unlocked phone can press
 * the button. Turning on the app lock in settings is what puts a fingerprint
 * in front of all of this.
 *
 * Route param: `id`.
 */
export function CredentialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const { data, error } = useLive(credentialQuery(id ?? ''), [id]);
  const credential = data?.[0];
  const [shown, setShown] = useState(false);

  if (!credential) {
    return (
      <Screen>
        <ScreenOptions options={{ title: 'رمز' }} />
        <ErrorNotice error={error} what="رمز" />
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

  const secret = credentialSecret(credential);
  const days = daysUntilExpiry(credential.expiresAt);

  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: credential.systemName,
          headerRight: () => (
            <Row gap="xxs">
              <IconButton
                icon={credential.starred ? 'star' : 'star-outline'}
                label={credential.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
                onPress={() => void setCredentialStarred(credential.id, !credential.starred)}
              />
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() => router.push({ pathname: '/vault/edit', params: { credentialId: credential.id } })}
              />
            </Row>
          ),
        }}
      />

      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Row gap="xs" wrap>
          <Badge label={CREDENTIAL_CATEGORY_LABELS[credential.category]} />
          {credential.ownerKind !== 'self' ? (
            <Badge label={CREDENTIAL_OWNER_LABELS[credential.ownerKind]} tone="warning" />
          ) : null}
          {days != null ? (
            <Badge
              label={days < 0 ? 'منقضی شده' : `تا ${formatJalaliLong(credential.expiresAt)}`}
              tone={days < 0 ? 'danger' : days < 30 ? 'warning' : 'neutral'}
            />
          ) : null}
        </Row>

        {credential.ownerKind !== 'self' ? (
          <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
            <Column gap="xxs">
              <Text variant="captionStrong" color="warning">
                این رمز مال شما نیست
              </Text>
              <Text variant="tiny" color="textMuted">
                {credential.ownerName ? `${credential.ownerName} — ` : ''}
                {credential.ownerConsentNote ?? 'دلیل نگه داشتنش را بنویسید تا بعداً روشن باشد.'}
              </Text>
            </Column>
          </Card>
        ) : null}

        <Card>
          <Column gap="sm">
            <DataRow label="یوزرنیم" value={credential.username} ltr />
            <Row gap="sm" justify="space-between">
              <Column gap="xxs" style={styles.flex}>
                <Text variant="caption" color="textMuted">
                  رمز
                </Text>
                <Text variant="bodyStrong" ltr selectable={shown}>
                  {secret.sealed
                    ? 'با نسخه‌ی قبلی رمزگذاری شده — دوباره بنویسیدش'
                    : secret.text
                      ? shown
                        ? secret.text
                        : '••••••••'
                      : '—'}
                </Text>
              </Column>
              {secret.text ? (
                <Row gap="xs">
                  <IconButton
                    icon="copy-outline"
                    label="کپی رمز"
                    onPress={() => {
                      void copyText(secret.text!);
                      void markCredentialUsed(credential.id);
                    }}
                  />
                  <IconButton
                    icon={shown ? 'eye-off-outline' : 'eye-outline'}
                    label={shown ? 'پنهان کردن' : 'نمایش'}
                    onPress={() => {
                      setShown(!shown);
                      if (!shown) void markCredentialUsed(credential.id);
                    }}
                  />
                </Row>
              ) : null}
            </Row>
          </Column>
        </Card>

        {credential.url ? (
          <Button
            label="باز کردن سامانه"
            icon="open-outline"
            variant="secondary"
            full
            onPress={() => {
              Linking.openURL(credential.url!).catch(() => Alert.alert('باز نشد', 'آدرس را بررسی کنید.'));
            }}
          />
        ) : null}

        <Card>
          <Column gap="xs">
            <DataRow label="آدرس" value={credential.url} ltr />
            <DataRow label="ورود دو مرحله‌ای" value={credential.secondFactorNotes} />
            <DataRow label="یادداشت" value={credential.notes} />
            <DataRow
              label="آخرین استفاده"
              value={credential.lastUsedAt ? formatJalaliLong(credential.lastUsedAt) : null}
            />
          </Column>
        </Card>

        {(credential.tags ?? []).length > 0 ? (
          <Row gap="xs" wrap>
            {(credential.tags ?? []).map((tag) => (
              <Badge key={tag} label={tag} />
            ))}
          </Row>
        ) : null}

        <Button
          label="حذف این رمز"
          icon="trash-outline"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('حذف این رمز؟', credential.systemName, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  void deleteCredential(credential.id).then(() => router.back());
                },
              },
            ])
          }
        />

        <Row gap="xs">
          <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
          <Text variant="tiny" color="textFaint" style={styles.flex}>
            رمز فقط وقتی از دیتابیس باز می‌شود که همین‌جا «نمایش» را بزنید، و در لاگ خطاها هیچ‌وقت نوشته نمی‌شود.
          </Text>
        </Row>
      </Column>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
