import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Card, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { SpecialtyProfile } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { SearchBar } from './search-bar';
import { specialtyProfilesQuery } from './specialty-profiles-queries';

/** Career research: one page per field, ordered by how well it fits. */
export function SpecialtyProfilesList() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');

  const { data, error } = useLive(specialtyProfilesQuery({ search }), [search]);
  const rows = data ?? [];

  return (
    <View style={styles.flex}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="رشته، بازار کار، نظر شخصی…" />
        <ErrorNotice error={error} what="فهرست رشته‌ها" />
      </Column>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="compass-outline"
          title={search ? 'چیزی پیدا نشد' : 'هنوز رشته‌ای بررسی نشده'}
          description="برای هر رشته: ماهیت کار، طول رزیدنتی، سبک زندگی، بازار کار، و اینکه چه کسی این‌ها را گفته است."
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.profile.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2 }}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/knowledge/specialty/[id]', params: { id: item.profile.id } })}
              style={{ marginTop: spacing.sm }}
            >
              <ProfileCard
                profile={item.profile}
                name={item.specialty?.nameFa ?? item.profile.nameText ?? 'بدون نام'}
              />
            </Pressable>
          )}
        />
      )}

      <Fab tabRoot label="رشته‌ی جدید" onPress={() => router.push('/knowledge/specialty/edit')} />
    </View>
  );
}

function ProfileCard({ profile, name }: { profile: SpecialtyProfile; name: string }) {
  return (
    <Card>
      <Column gap="xxs">
        <Row gap="sm" justify="space-between">
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {name}
          </Text>
          {profile.personalFit != null ? (
            <Badge label={`${toPersianDigits(profile.personalFit)} از ۵`} tone="accent" icon="heart-outline" />
          ) : null}
        </Row>
        {profile.overview ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {profile.overview}
          </Text>
        ) : null}
        <Row gap="xs" wrap>
          {profile.residencyYears ? <Badge label={`رزیدنتی ${profile.residencyYears}`} /> : null}
          {profile.lifestyle ? <Badge label="سبک زندگی" tone="info" /> : null}
          {profile.jobMarket ? <Badge label="بازار کار" tone="info" /> : null}
        </Row>
      </Column>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
