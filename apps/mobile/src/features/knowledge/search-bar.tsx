import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { Row } from '@/components/ui';
import { MIN_TOUCH, useTheme } from '@/theme';

/** The search field the knowledge lists share. Persian folding happens in the query. */
export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
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
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
        returnKeyType="search"
        style={[typography.body, styles.input, { color: colors.text }]}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={12} accessibilityLabel="پاک کردن جستجو">
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, paddingVertical: 10 },
});
