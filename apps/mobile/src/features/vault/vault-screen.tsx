import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Card, ChipSelect, Column, EmptyState, Fab, Row, Screen, Text } from '@/components/ui';
import type { Credential } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { SearchBar } from '@/features/knowledge/search-bar';
import { formatJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { daysUntilExpiry } from './logic';
import { credentialsQuery } from './queries';

/**
 * Saved logins: the prescription portal, insurance, the hospital HIS.
 *
 * There is no passphrase and no unlock step, because the owner asked for a
 * tidy list rather than a vault — this replaces a note in Samsung Notes. What
 * guards it is the phone's own lock and, if it is turned on, the app lock.
 */
export function VaultScreen() {
  const router = useRouter();

  return (
    <View style={styles.flex}>
      <CredentialList />
      <Fab label="افزودن رمز" onPress={() => router.push('/vault/edit')} />
    </View>
  );
}

type CategoryFilter = 'all' | Credential['category'];

function CredentialList() {
  const router = useRouter();
  const { spacing } = useTheme();
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
    <Screen scroll contentStyle={{ paddingBottom: spacing.huge * 2 }}>
      <Column gap="sm" style={{ paddingTop: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="نام سامانه، یوزرنیم…" />
        <ChipSelect options={options} value={category} onChange={(v) => v && setCategory(v)} />
        <ErrorNotice error={error} what="رمزها" />

        {rows.length === 0 && data !== undefined ? (
          <EmptyState
            icon="lock-closed-outline"
            title={search || category !== 'all' ? 'چیزی پیدا نشد' : 'هنوز رمزی ثبت نشده'}
            description="یوزرنیم و پسورد سامانه‌هایی که هر روز با آن‌ها کار می‌کنید، یک‌جا و مرتب."
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
