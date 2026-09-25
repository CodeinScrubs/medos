import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alertError } from '@/components/feedback';
import { Card, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { Extension, Place } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { callExtension, copyExtension } from '@/features/places/actions';
import { deleteExtension, extensionsQuery, setExtensionStarred } from '@/features/places/queries';
import { toPersianDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

/**
 * Every hospital's internal extensions in one searchable list. Type "سونو" and
 * the ultrasound room of every hospital comes up; type "مرکزی سونو" for one.
 * Most-used extensions float to the top on their own.
 */
export function ExtensionsScreen() {
  const router = useRouter();
  const { colors, radii, spacing, typography } = useTheme();
  const [search, setSearch] = useState('');
  const { data } = useLive(extensionsQuery({ search }), [search]);
  const rows = data ?? [];

  return (
    <SafeAreaView edges={[]} style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Row
          gap="sm"
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            minHeight: MIN_TOUCH,
          }}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بخش، بیمارستان یا شماره…"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            style={[typography.body, styles.input, { color: colors.text }]}
          />
        </Row>
      </View>

      {rows.length === 0 && data !== undefined ? (
        <EmptyState
          icon="call-outline"
          title={search ? 'پیدا نشد' : 'هنوز داخلی‌ای ثبت نشده'}
          description={search ? undefined : 'مثلاً «اتاق سونو — بیمارستان مرکزی — ۲۳۴۵». با دکمه‌ی + اضافه کنید.'}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.extension.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge * 2, gap: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ExtensionRow extension={item.extension} place={item.place} />}
        />
      )}

      <Fab label="افزودن داخلی" onPress={() => router.push('/extensions/edit')} />
    </SafeAreaView>
  );
}

function ExtensionRow({ extension, place }: { extension: Extension; place: Place }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  function more() {
    Alert.alert(extension.department, place.name, [
      {
        text: extension.starred ? 'برداشتن ستاره' : 'ستاره‌دار',
        onPress: () =>
          void setExtensionStarred(extension.id, !extension.starred).catch((e) => alertError('تغییر ثبت نشد', e)),
      },
      {
        text: 'ویرایش',
        onPress: () => router.push({ pathname: '/extensions/edit', params: { extensionId: extension.id } }),
      },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => void deleteExtension(extension.id).catch((e) => alertError('حذف نشد', e)),
      },
    ]);
  }

  return (
    <Pressable onLongPress={more}>
      <Card>
        <Row gap="md">
          <Column gap="xxs" style={styles.flex}>
            <Row gap="xs">
              {extension.starred && <Ionicons name="star" size={13} color={colors.accent} />}
              <Text variant="subheading" style={styles.flex} numberOfLines={1}>
                {extension.department}
              </Text>
            </Row>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {place.name}
              {extension.floor ? ` • طبقه ${toPersianDigits(extension.floor)}` : ''}
              {extension.contactPerson ? ` • ${extension.contactPerson}` : ''}
            </Text>
            {extension.notes ? (
              <Text variant="tiny" color="textFaint" numberOfLines={2}>
                {extension.notes}
              </Text>
            ) : null}
          </Column>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`کپی داخلی ${extension.extension}`}
            onPress={() => void copyExtension(extension)}
            style={({ pressed }) => [
              {
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radii.md,
                backgroundColor: colors.primarySoft,
                opacity: pressed ? 0.6 : 1,
                alignItems: 'center',
              },
            ]}
          >
            <Text variant="title" color="primary">
              {toPersianDigits(extension.extension)}
            </Text>
            <Text variant="tiny" color="primary">
              کپی
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تماس"
            onPress={() => void callExtension(extension, place)}
            style={({ pressed }) => [
              styles.call,
              { borderRadius: radii.full, backgroundColor: colors.primary, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="call" size={18} color={colors.primaryText} />
          </Pressable>
        </Row>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: { flex: 1, paddingVertical: 10 },
  call: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
