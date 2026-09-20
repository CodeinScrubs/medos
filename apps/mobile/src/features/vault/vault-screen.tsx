import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, ChipSelect, Column, EmptyState, Fab, Input, Row, Screen, Text } from '@/components/ui';
import type { Credential } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { SearchBar } from '@/features/knowledge/search-bar';
import { formatJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { createVault, isVaultConfigured, loadVaultKey, unlockVault } from './keys';
import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { daysUntilExpiry } from './logic';
import { credentialsQuery } from './queries';

type Gate = 'loading' | 'new' | 'locked' | 'open';

async function gateState(): Promise<Gate> {
  if (!(await isVaultConfigured())) return 'new';
  return (await loadVaultKey()) ? 'open' : 'locked';
}

/**
 * The credential vault.
 *
 * Three states, in the order the owner meets them: no vault yet, a vault that
 * needs its passphrase on this phone, and an open one. Deriving the key takes
 * a few seconds on purpose — it is scrypt, the same as backups.
 */
export function VaultScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [gate, setGate] = useState<Gate>('loading');
  // Which state applies cannot be read from a query: half of it is the key in
  // the Android Keystore. It is re-read whenever a child says it changed.
  const [reload, setReload] = useState(0);
  const again = () => setReload((n) => n + 1);

  useEffect(() => {
    void gateState().then(setGate);
  }, [reload]);

  if (gate === 'loading') {
    return (
      <Screen>
        <View />
      </Screen>
    );
  }
  if (gate === 'new') return <CreateVault onDone={again} />;
  if (gate === 'locked') return <UnlockVault onDone={again} />;

  return (
    <View style={styles.flex}>
      <CredentialList />
      <Fab label="افزودن رمز" onPress={() => router.push('/vault/edit')} />
      <View style={{ height: spacing.md }} />
    </View>
  );
}

function CreateVault({ onDone }: { onDone: () => void }) {
  const { spacing } = useTheme();
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (passphrase.length < 8) {
      Alert.alert('رمز کوتاه است', 'حداقل ۸ نویسه بنویسید.');
      return;
    }
    if (passphrase !== repeat) {
      Alert.alert('دو رمز یکی نیستند');
      return;
    }
    setBusy(true);
    try {
      await createVault(passphrase);
      onDone();
    } catch (e) {
      alertError('ساخته نشد', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="title">گاوصندوق رمزها</Text>
        <Text variant="body" color="textMuted">
          یوزرنیم و پسورد سامانه‌هایی که هر روز با آن‌ها کار می‌کنید — سامانه‌ی نسخه، بیمه، HIS بیمارستان.
        </Text>
        <Card tone="alt">
          <Column gap="xs">
            <Text variant="captionStrong">رمز گاوصندوق جدا از رمز بکاپ است</Text>
            <Text variant="tiny" color="textMuted">
              پسوردها با این رمز قفل می‌شوند و حتی داخل فایل بکاپ هم رمزگذاری‌شده می‌مانند. اگر این رمز را فراموش کنید،
              هیچ راهی برای باز کردنشان نیست — جایی بیرون از گوشی بنویسیدش.
            </Text>
          </Column>
        </Card>

        <Input label="رمز گاوصندوق" value={passphrase} onChangeText={setPassphrase} secureTextEntry />
        <Input label="تکرار رمز" value={repeat} onChangeText={setRepeat} secureTextEntry />
        <Button label="ساخت گاوصندوق" icon="lock-closed" onPress={() => void create()} loading={busy} full />
        <Text variant="tiny" color="textFaint">
          ساخت کلید چند ثانیه طول می‌کشد؛ همین کندی است که حدس زدن رمز را گران می‌کند.
        </Text>
      </Column>
    </Screen>
  );
}

function UnlockVault({ onDone }: { onDone: () => void }) {
  const { spacing } = useTheme();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    try {
      if (await unlockVault(passphrase)) onDone();
      else Alert.alert('رمز درست نیست');
    } catch (e) {
      alertError('باز نشد', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md, alignItems: 'stretch' }}>
        <Text variant="title">گاوصندوق قفل است</Text>
        <Text variant="body" color="textMuted">
          رمز گاوصندوق را بنویسید. بعد از این، تا وقتی خودتان قفلش نکنید باز می‌ماند.
        </Text>
        <Input label="رمز گاوصندوق" value={passphrase} onChangeText={setPassphrase} secureTextEntry />
        <Button label="باز کردن" icon="lock-open" onPress={() => void unlock()} loading={busy} full />
      </Column>
    </Screen>
  );
}

type CategoryFilter = 'all' | Credential['category'];

function CredentialList() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const { data, error } = useLive(credentialsQuery({ search, category: category === 'all' ? null : category }), [
    search,
    category,
  ]);
  const rows = data ?? [];

  const options = [
    { value: 'all' as CategoryFilter, label: 'همه' },
    ...(Object.keys(CREDENTIAL_CATEGORY_LABELS) as Credential['category'][]).map((c) => ({
      value: c as CategoryFilter,
      label: CREDENTIAL_CATEGORY_LABELS[c],
    })),
  ];

  return (
    <Screen scroll>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <Row justify="space-between">
          <Text variant="display">گاوصندوق</Text>
          <Ionicons name="lock-open-outline" size={18} color={colors.success} />
        </Row>
        <SearchBar value={search} onChange={setSearch} placeholder="نام سامانه، یوزرنیم…" />
        <ChipSelect options={options} value={category} onChange={(v) => v && setCategory(v)} />
        <ErrorNotice error={error} what="گاوصندوق" />

        {rows.length === 0 && data !== undefined ? (
          <EmptyState
            icon="lock-closed-outline"
            title={search || category !== 'all' ? 'چیزی پیدا نشد' : 'هنوز رمزی ثبت نشده'}
            description="پسوردها رمزگذاری‌شده ذخیره می‌شوند؛ بقیه‌ی فیلدها معمولی‌اند تا بشود پیدایشان کرد."
          />
        ) : (
          rows.map((credential) => (
            <Pressable
              key={credential.id}
              onPress={() => router.push({ pathname: '/vault/[id]', params: { id: credential.id } })}
            >
              <CredentialCard credential={credential} />
            </Pressable>
          ))
        )}
      </Column>
    </Screen>
  );
}

function CredentialCard({ credential }: { credential: Credential }) {
  const { colors } = useTheme();
  const days = daysUntilExpiry(credential.expiresAt);

  return (
    <Card>
      <Row gap="sm" justify="space-between">
        <Column gap="xxs" style={styles.flex}>
          <Row gap="xs">
            <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {credential.systemName}
            </Text>
            {credential.starred && <Ionicons name="star" size={14} color={colors.warning} />}
          </Row>
          {credential.username ? (
            <Text variant="caption" color="textMuted" ltr numberOfLines={1}>
              {credential.username}
            </Text>
          ) : null}
          <Row gap="xs" wrap>
            <Badge label={CREDENTIAL_CATEGORY_LABELS[credential.category]} />
            {credential.ownerKind !== 'self' ? (
              <Badge label={CREDENTIAL_OWNER_LABELS[credential.ownerKind]} tone="warning" />
            ) : null}
            {days != null ? (
              <Badge
                label={days < 0 ? 'منقضی شده' : `${formatJalali(credential.expiresAt)} منقضی می‌شود`}
                tone={days < 0 ? 'danger' : days < 30 ? 'warning' : 'neutral'}
              />
            ) : null}
          </Row>
        </Column>
        <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
