import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Column, Divider, IconButton, Row, Text } from '@/components/ui';
import { normalizePersian, searchTerms } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string | null;
  /** Extra text that should match a search but not be shown. */
  keywords?: string | null;
};

/**
 * A full-screen searchable list with optional "add new".
 *
 * The inline create matters: picking the attending for an admission must never
 * dead-end because that doctor has not been entered yet. Typing the name and
 * tapping "add" creates a minimal record that can be filled in later from the
 * doctors tab.
 */
export function PickerModal({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  onCreate,
  createLabel = 'افزودن',
  emptyText = 'موردی پیدا نشد',
  placeholder = 'جستجو…',
}: {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedId?: string | null;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  /** Receives the typed text; resolves to the created item, which is then selected. */
  onCreate?: (text: string) => Promise<PickerItem>;
  createLabel?: string;
  emptyText?: string;
  placeholder?: string;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const terms = searchTerms(query);
    if (!terms.length) return items;
    return items.filter((item) => {
      const hay = normalizePersian(`${item.label} ${item.sublabel ?? ''} ${item.keywords ?? ''}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  const trimmed = query.trim();
  const exactExists = items.some((i) => normalizePersian(i.label) === normalizePersian(trimmed));
  const canCreate = Boolean(onCreate && trimmed && !exactExists);

  function close() {
    setQuery('');
    onClose();
  }

  async function create() {
    if (!onCreate || !trimmed) return;
    setCreating(true);
    try {
      const item = await onCreate(trimmed);
      setQuery('');
      onSelect(item);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
        <Row justify="space-between" style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
          <Text variant="heading" style={{ paddingHorizontal: spacing.sm }}>
            {title}
          </Text>
          <IconButton icon="close" label="بستن" onPress={close} />
        </Row>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
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
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.primary}
              autoFocus
              style={[typography.body, styles.input, { color: colors.text }]}
            />
          </Row>
        </View>

        {canCreate && (
          <Pressable
            accessibilityRole="button"
            disabled={creating}
            onPress={() => void create()}
            style={({ pressed }) => [
              {
                marginHorizontal: spacing.lg,
                marginBottom: spacing.sm,
                padding: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.primarySoft,
                opacity: pressed || creating ? 0.6 : 1,
              },
            ]}
          >
            <Row gap="sm">
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text variant="bodyStrong" color="primary" style={styles.flex}>
                {createLabel}: «{trimmed}»
              </Text>
            </Row>
          </Pressable>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <Divider inset={spacing.lg} />}
          ListEmptyComponent={
            <Text variant="caption" color="textFaint" align="center" style={{ padding: spacing.xl }}>
              {emptyText}
            </Text>
          }
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setQuery('');
                  onSelect(item);
                }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                  },
                ]}
              >
                <Row gap="sm" justify="space-between">
                  <Column gap="xxs" style={styles.flex}>
                    <Text variant="bodyStrong">{item.label}</Text>
                    {item.sublabel ? (
                      <Text variant="caption" color="textMuted">
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </Column>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Row>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: { flex: 1, paddingVertical: 10 },
});
