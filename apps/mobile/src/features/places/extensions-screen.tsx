import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Card, Column, EmptyState, Fab, Row, Text } from '@/components/ui';
import type { Extension, Place } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { callExtension, copyExtension, type PlaceDeviceOwner } from '@/features/places/actions';
import {
  assertExtensionDeviceChoice,
  deleteExtension,
  extensionsQuery,
  setExtensionStarred,
} from '@/features/places/queries';
import { UnfinishedWorkspaceForms } from '@/features/workspace-forms/unfinished-forms';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { joinLabels, toPersianDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

type ExtensionRowData = Awaited<ReturnType<typeof extensionsQuery>>[number];
const EMPTY_ROWS: ExtensionRowData[] = [];

/**
 * Every hospital's internal extensions in one searchable list. Type "سونو" and
 * the ultrasound room of every hospital comes up; type "مرکزی سونو" for one.
 * Most-used extensions float to the top on their own.
 */
export function ExtensionsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { generation, stale } = useDatasetIntent();
  const { colors, radii, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const { data, error, retry } = useLive(extensionsQuery({ search }), [search]);
  const rows = data ?? EMPTY_ROWS;
  const [busy, setBusy] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceActing = useRef(false);
  const readable = !stale && !error && data !== undefined;
  const ready = !busy && !deviceBusy && readable;
  const latest = useRef({ ready, readable, rows });
  useLayoutEffect(() => {
    latest.current = { ready, readable, rows };
  }, [ready, readable, rows]);
  const mounted = useRef(true);
  const attempt = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current = null;
    };
  }, []);

  function rowAction(row: ExtensionRowData, kind: 'copy' | 'call' | 'star' | 'edit') {
    const owns = () =>
      mounted.current &&
      generation === datasetGeneration() &&
      navigation.isFocused() &&
      latest.current.readable &&
      latest.current.rows.some((p) => p.extension.id === row.extension.id && p.expectedBasis === row.expectedBasis);
    if (!owns() || deviceActing.current || attempt.current || busy) return;
    deviceActing.current = true;
    setDeviceBusy(true);
    const owner: PlaceDeviceOwner = { generation, expectedBasis: row.expectedBasis, owns };
    const work =
      kind === 'edit'
        ? withDatasetWrite(generation, async () => {
            const current = assertExtensionDeviceChoice(row.extension.id, row.expectedBasis);
            if (owns()) router.push({ pathname: '/extensions/edit', params: { extensionId: current.extension.id } });
          })
        : kind === 'copy'
          ? copyExtension(row.extension, owner)
          : kind === 'call'
            ? callExtension(row.extension, row.place, owner)
            : withDatasetWrite(generation, () =>
                setExtensionStarred(row.extension.id, !row.extension.starred, row.expectedBasis, new Date()),
              );
    void work
      .catch((error: unknown) => {
        if (owns())
          alertError(
            kind === 'copy'
              ? 'کپی نشد'
              : kind === 'call'
                ? 'برنامهٔ تماس باز نشد'
                : kind === 'edit'
                  ? 'فرم ویرایش باز نشد'
                  : 'تغییر ثبت نشد',
            error,
          );
      })
      .finally(() => {
        deviceActing.current = false;
        if (mounted.current) {
          setDeviceBusy(false);
          retry();
        }
      });
  }

  function confirmDelete(row: ExtensionRowData) {
    const currentChoice = () =>
      latest.current.rows.some((p) => p.extension.id === row.extension.id && p.expectedBasis === row.expectedBasis);
    const ownsScreen = () => mounted.current && generation === datasetGeneration() && navigation.isFocused();
    if (!ownsScreen() || attempt.current || deviceActing.current || !latest.current.ready || !currentChoice()) return;
    const token = Symbol('extension delete');
    attempt.current = token;
    let used = false;
    const release = () => {
      if (attempt.current === token) attempt.current = null;
    };
    Alert.alert(
      'حذف داخلی؟',
      `${row.place.name} — ${row.extension.department} — ${row.extension.extension}\nاز سطل زباله می‌توانید آن را برگردانید.`,
      [
        { text: 'انصراف', style: 'cancel', onPress: release },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            if (used) return;
            used = true;
            if (
              !ownsScreen() ||
              attempt.current !== token ||
              deviceActing.current ||
              !latest.current.ready ||
              !currentChoice()
            ) {
              release();
              retry();
              return;
            }
            setBusy(true);
            void withDatasetWrite(generation, () => deleteExtension(row.extension.id, row.expectedBasis, new Date()))
              .catch((e: unknown) => {
                if (ownsScreen()) alertError('حذف نشد', e);
              })
              .finally(() => {
                release();
                if (mounted.current) {
                  setBusy(false);
                  retry();
                }
              });
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

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
        <ErrorNotice error={error} what="داخلی‌ها" onRetry={retry} />
        <UnfinishedWorkspaceForms
          kind="extension"
          onOpen={(extensionId, draftId) =>
            router.push({
              pathname: '/extensions/edit',
              params: { ...(extensionId === null ? {} : { extensionId }), draftId },
            })
          }
        />
      </View>

      {rows.length === 0 && data !== undefined && !error ? (
        <EmptyState
          icon="call-outline"
          title={search ? 'پیدا نشد' : 'هنوز داخلی‌ای ثبت نشده'}
          description={search ? undefined : 'مثلاً «اتاق سونو — بیمارستان مرکزی — ۲۳۴۵». با دکمه‌ی + اضافه کنید.'}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.extension.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.huge * 2 + insets.bottom,
            gap: spacing.sm,
          }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ExtensionRow
              extension={item.extension}
              place={item.place}
              onDelete={() => confirmDelete(item)}
              onCopy={() => rowAction(item, 'copy')}
              onCall={() => rowAction(item, 'call')}
              onStar={() => rowAction(item, 'star')}
              onEdit={() => rowAction(item, 'edit')}
              locked={!ready}
            />
          )}
        />
      )}

      <Fab label="افزودن داخلی" onPress={() => router.push('/extensions/edit')} />
    </SafeAreaView>
  );
}

function ExtensionRow({
  extension,
  place,
  onDelete,
  onCopy,
  onCall,
  onStar,
  onEdit,
  locked,
}: {
  extension: Extension;
  place: Place;
  onDelete: () => void;
  onCopy: () => void;
  onCall: () => void;
  onStar: () => void;
  onEdit: () => void;
  locked: boolean;
}) {
  const { colors, radii, spacing } = useTheme();

  function more() {
    Alert.alert(
      extension.department,
      place.name,
      [
        {
          text: extension.starred ? 'برداشتن ستاره' : 'ستاره‌دار',
          onPress: onStar,
        },
        {
          text: 'ویرایش',
          onPress: onEdit,
        },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            if (!locked) onDelete();
          },
        },
      ],
      { cancelable: true },
    );
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
              {joinLabels([
                place.name,
                extension.floor ? `طبقه ${toPersianDigits(extension.floor)}` : null,
                extension.contactPerson,
              ])}
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
            disabled={locked}
            onPress={onCopy}
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
            disabled={locked}
            onPress={onCall}
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
