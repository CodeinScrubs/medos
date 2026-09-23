import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { toLatinDigits } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

import { Row } from './layout';
import { Text } from './text';

/* -------------------------------------------------------------------------- */
/*  Labelled field wrapper                                                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {label && (
        <Row gap="xxs">
          <Text variant="captionStrong" color="textMuted">
            {label}
          </Text>
          {required && (
            <Text variant="caption" color="danger">
              *
            </Text>
          )}
        </Row>
      )}
      {children}
      {(error || hint) && (
        <Text variant="tiny" color={error ? 'danger' : 'textFaint'}>
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Text input                                                                  */
/* -------------------------------------------------------------------------- */

export type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Latin layout for drug names, lab values, usernames, URLs. */
  ltr?: boolean;
  /**
   * Fold Persian and Arabic digits to Latin as the user types. Anything that
   * will be parsed as a number needs this, since a Persian keyboard emits ۰-۹.
   */
  numericFold?: boolean;
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, required, icon, ltr, numericFold, multiline, containerStyle, onChangeText, ...rest },
  ref,
) {
  const { colors, radii, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <Field label={label} hint={hint} error={error} required={required} style={containerStyle}>
      <Row
        gap="sm"
        align={multiline ? 'flex-start' : 'center'}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.md : 0,
          minHeight: multiline ? 108 : MIN_TOUCH,
        }}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.primary : colors.textFaint}
            style={multiline ? { marginTop: spacing.xs } : undefined}
          />
        )}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          onChangeText={(t) => onChangeText?.(numericFold ? toLatinDigits(t) : t)}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          style={[
            typography.body,
            styles.input,
            { color: colors.text },
            ltr && { writingDirection: 'ltr', textAlign: 'left' },
            multiline && { textAlignVertical: 'top', minHeight: 84 },
          ]}
        />
      </Row>
    </Field>
  );
});

/* -------------------------------------------------------------------------- */
/*  Select: a row that opens a picker                                           */
/* -------------------------------------------------------------------------- */

export function SelectField({
  label,
  value,
  placeholder = 'انتخاب کنید',
  onPress,
  onClear,
  icon,
  error,
  required,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
  onClear?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  required?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Field label={label} error={error} required={required}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? ''} ${value ?? placeholder}`.trim()}
        onPress={onPress}
        style={({ pressed }) => [
          {
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            paddingHorizontal: spacing.md,
            minHeight: MIN_TOUCH,
            justifyContent: 'center',
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Row gap="sm" justify="space-between">
          <Row gap="sm" style={styles.grow}>
            {icon && <Ionicons name={icon} size={18} color={colors.textFaint} />}
            <Text variant="body" color={value ? 'text' : 'textFaint'} numberOfLines={1} style={styles.grow}>
              {value || placeholder}
            </Text>
          </Row>
          {value && onClear ? (
            <Pressable onPress={onClear} hitSlop={12} accessibilityLabel="پاک کردن">
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
          )}
        </Row>
      </Pressable>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/*  Segmented control                                                           */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label?: string;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Field label={label}>
      <Row
        gap="xxs"
        style={{
          backgroundColor: colors.surfaceAlt,
          borderRadius: radii.md,
          padding: spacing.xxs,
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(o.value)}
              style={[
                styles.segment,
                {
                  borderRadius: radii.sm,
                  backgroundColor: active ? colors.surface : 'transparent',
                },
              ]}
            >
              <Text variant="captionStrong" color={active ? 'primary' : 'textMuted'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </Row>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toggle                                                                      */
/* -------------------------------------------------------------------------- */

export function Toggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ minHeight: MIN_TOUCH, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Row gap="md" justify="space-between">
        <View style={styles.grow}>
          <Text variant="bodyStrong">{label}</Text>
          {description ? (
            <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xxs }}>
              {description}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          thumbColor={colors.surface}
        />
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, paddingVertical: 10 },
  grow: { flex: 1 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 38 },
});
