import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Column, Input, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * A one-field dialog. Android has no `Alert.prompt`, and "mark done — what
 * happened?" needs exactly one line of text, so this fills the gap.
 */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  initialValue = '',
  submitLabel = 'ثبت',
  multiline = false,
  optional = true,
  secret = false,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  multiline?: boolean;
  /** When false, submit stays disabled until something is typed. */
  optional?: boolean;
  /**
   * A passphrase: hidden while typed, kept out of the keyboard's learned
   * words, and submitted exactly as typed.
   */
  secret?: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const { colors, radii, spacing, shadows } = useTheme();
  const [text, setText] = useState(initialValue);

  // Reset on every open, and cleared on close so a typed passphrase does not
  // linger in memory. (State adjusted during render, React's pattern for state
  // that follows a prop.)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setText(visible ? initialValue : '');
  }

  // Back and a tap outside the card are how a keyboard gets put away, too. With
  // something typed, neither may throw the text away without asking; the
  // «انصراف» button still cancels straight away.
  function dismiss() {
    if (!text.trim() || text === initialValue) {
      onCancel();
      return;
    }
    Alert.alert('نوشته دور ریخته شود؟', undefined, [
      { text: 'ادامه‌ی نوشتن', style: 'cancel' },
      { text: 'دور بریز', style: 'destructive', onPress: onCancel },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={dismiss}>
          <Pressable
            // Swallow taps on the card so they do not dismiss the dialog.
            onPress={() => {}}
            style={[
              styles.card,
              shadows.lg,
              { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xl },
            ]}
          >
            <Column gap="md">
              <Text variant="heading">{title}</Text>
              {message ? (
                <Text variant="caption" color="textMuted">
                  {message}
                </Text>
              ) : null}
              <Input
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                multiline={multiline && !secret}
                autoFocus
                secureTextEntry={secret}
                autoCapitalize={secret ? 'none' : undefined}
                autoCorrect={!secret}
                ltr={secret}
              />
              <Row gap="sm">
                <View style={styles.flex}>
                  <Button
                    label={submitLabel}
                    onPress={() => onSubmit(secret ? text : text.trim())}
                    disabled={!optional && !text.trim()}
                    full
                  />
                </View>
                <Button label="انصراف" variant="ghost" onPress={onCancel} haptic={false} />
              </Row>
            </Column>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});
