import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { alertError } from './feedback';
import { Row, Text } from './ui';

type Offer = { message: string; undo: () => Promise<unknown> | void };
type Shown = Offer & { id: number };

const Context = createContext<(offer: Offer) => void>(() => {});

/** How long "برگرداندن" stays on screen. Long enough to notice a slip, short enough not to linger. */
const VISIBLE_MS = 8000;

/**
 * A quick one-tap action stays one tap, and a slip stays reversible.
 *
 * Ticking a task off removed it from the list at once, with no way back but
 * three screens of history. The tick still happens immediately; this offers
 * «برگرداندن» at the bottom of the screen for a few seconds afterwards.
 */
export function UndoProvider({ children }: PropsWithChildren) {
  const [shown, setShown] = useState<Shown | null>(null);
  const offer = useCallback((next: Offer) => setShown({ ...next, id: Date.now() }), []);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown((current) => (current?.id === shown.id ? null : current)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <Context.Provider value={offer}>
      <View style={styles.flex}>
        {children}
        {shown ? <UndoBar offer={shown} onDone={() => setShown(null)} /> : null}
      </View>
    </Context.Provider>
  );
}

/** Offer to take back what was just done. A no-op outside UndoProvider (tests, isolated screens). */
export function useUndo(): (offer: Offer) => void {
  return useContext(Context);
}

function UndoBar({ offer, onDone }: { offer: Shown; onDone: () => void }) {
  const { colors, radii, spacing, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  return (
    <View
      pointerEvents="box-none"
      // Above a tab bar where there is one, and never under the system bar.
      style={[styles.wrap, { bottom: insets.bottom + 72, paddingHorizontal: spacing.lg }]}
    >
      <Row
        gap="md"
        justify="space-between"
        style={[
          shadows.lg,
          {
            backgroundColor: colors.text,
            borderRadius: radii.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <Text variant="caption" numberOfLines={2} style={[styles.grow, { color: colors.background }]}>
          {offer.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="برگرداندن"
          disabled={busy}
          hitSlop={12}
          onPress={() => {
            setBusy(true);
            void Promise.resolve(offer.undo())
              .catch((e: unknown) => alertError('برگردانده نشد', e))
              .finally(onDone);
          }}
        >
          <Text variant="captionStrong" style={{ color: colors.primarySoft }}>
            برگرداندن
          </Text>
        </Pressable>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1 },
  wrap: { position: 'absolute', left: 0, right: 0 },
});
