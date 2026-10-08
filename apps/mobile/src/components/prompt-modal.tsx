import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

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
  busy = false,
  maxLength,
  value,
  onChangeText,
  onSubmit,
  onCancel,
  retainOnClose = false,
  footer,
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
  /** Retain text and prevent edits/dismissal until its caller acknowledges submission. */
  busy?: boolean;
  maxLength?: number;
  /** Optional paired controlled input for a caller-owned durable raw draft. */
  onSubmit: (text: string) => void;
  onCancel: () => void;
  /** A durable caller flushes on close instead of discarding its raw input. */
  retainOnClose?: boolean;
  footer?: ReactNode;
} & ({ value?: never; onChangeText?: never } | { value: string; onChangeText: (text: string) => void })) {
  const { colors, radii, spacing, shadows } = useTheme();
  const [localText, setText] = useState(initialValue);
  const text = value ?? localText;
  const latest = useRef(text);
  useLayoutEffect(() => {
    latest.current = text;
  }, [text]);

  // Reset on every open, and cleared on close so a typed passphrase does not
  // linger in memory. (State adjusted during render, React's pattern for state
  // that follows a prop.)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setText(visible ? initialValue : '');
  }

  // Back with the IME hidden and a backdrop tap retain the discard guard;
  // the explicit «انصراف» button still cancels straight away.
  function dismiss() {
    if (busy) return;
    if (retainOnClose) {
      onCancel();
      return;
    }
    if (!latest.current.trim() || latest.current === initialValue) {
      onCancel();
      return;
    }
    Alert.alert('نوشته دور ریخته شود؟', undefined, [
      { text: 'ادامه‌ی نوشتن', style: 'cancel' },
      { text: 'دور بریز', style: 'destructive', onPress: onCancel },
    ]);
  }

  function requestClose() {
    if (busy) return;
    // Android Modal intercepts Back in its own window. The existing controller
    // tracks that window's IME; first Back should only hide it, retaining text.
    if (KeyboardController.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    dismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose} statusBarTranslucent>
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
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
              <Column gap="md">
                <Text variant="heading">{title}</Text>
                {message ? (
                  <Text variant="caption" color="textMuted">
                    {message}
                  </Text>
                ) : null}
                <Input
                  maxLength={maxLength}
                  value={text}
                  editable={!busy}
                  onChangeText={(next) => {
                    if (busy) return;
                    latest.current = next;
                    if (onChangeText) onChangeText(next);
                    else setText(next);
                  }}
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
                      onPress={() => {
                        if (!busy) onSubmit(secret ? latest.current : latest.current.trim());
                      }}
                      disabled={busy || (!optional && !text.trim())}
                      loading={busy}
                      full
                    />
                  </View>
                  <Button
                    label={retainOnClose ? 'بستن' : 'انصراف'}
                    variant="ghost"
                    onPress={() => {
                      if (!busy) onCancel();
                    }}
                    disabled={busy}
                    haptic={false}
                  />
                </Row>
                {footer}
              </Column>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  scroll: { flexGrow: 0 },
  card: { width: '100%', maxWidth: 480, maxHeight: '100%', alignSelf: 'center' },
});
