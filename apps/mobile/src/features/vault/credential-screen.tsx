import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, DataRow, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { copyText } from '@/features/doctors/actions';
import { formatJalaliLong } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { forgetVaultKey } from './keys';
import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { daysUntilExpiry } from './logic';
import { credentialQuery, deleteCredential, revealSecret, setCredentialStarred } from './queries';

/**
 * One credential. The password is shown only after the phone's own check, and
 * only until the screen is left.
 *
 * Route param: `id`.
 */
export function CredentialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const { data, error } = useLive(credentialQuery(id ?? ''), [id]);
  const credential = data?.[0];
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!credential) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'رمز' }} />
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

  /**
   * The phone's own biometric or screen lock stands between the open vault and
   * a password on screen. On a phone with no lock at all there is nothing to
   * check against, so the vault passphrase — already entered — is the gate.
   */
  async function reveal() {
    setBusy(true);
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level !== LocalAuthentication.SecurityLevel.NONE) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'نمایش رمز',
          cancelLabel: 'انصراف',
          disableDeviceFallback: false,
        });
        if (!result.success) return;
      }
      setSecret(await revealSecret(credential!.id));
    } catch (e) {
      alertError('باز نشد', e);
    } finally {
      setBusy(false);
    }
  }

  const days = daysUntilExpiry(credential.expiresAt);

  return (
    <Screen scroll>
      <Stack.Screen
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
                <Text variant="bodyStrong" ltr selectable={Boolean(secret)}>
                  {secret ?? (credential.secretCipher ? '••••••••' : '—')}
                </Text>
              </Column>
              {credential.secretCipher ? (
                <Row gap="xs">
                  {secret ? (
                    <>
                      <IconButton icon="copy-outline" label="کپی رمز" onPress={() => void copyText(secret)} />
                      <IconButton icon="eye-off-outline" label="پنهان کردن" onPress={() => setSecret(null)} />
                    </>
                  ) : (
                    <Button label="نمایش" icon="eye-outline" size="sm" onPress={() => void reveal()} loading={busy} />
                  )}
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
          label="قفل کردن گاوصندوق"
          icon="lock-closed-outline"
          variant="secondary"
          full
          onPress={() => {
            void forgetVaultKey().then(() => {
              setSecret(null);
              router.back();
            });
          }}
        />

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
