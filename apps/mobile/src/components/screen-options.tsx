import { Stack, useNavigation } from 'expo-router';
import { useLayoutEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';

type StackOptions = Exclude<NonNullable<ComponentProps<typeof Stack.Screen>['options']>, (...args: never[]) => unknown>;
type HeaderRight = NonNullable<StackOptions['headerRight']>;

/** The header options screens set for themselves. Everything else is fixed in app/_layout.tsx. */
export type ScreenHeader = {
  title?: string;
  headerShown?: boolean;
  animation?: StackOptions['animation'];
  headerRight?: HeaderRight;
};

/**
 * Header options for the screen this is rendered in. Use it instead of
 * `<Stack.Screen options>` inside a screen; the lint rule says so too.
 *
 * `<Stack.Screen>` calls `setOptions` on every render, and every call updates
 * the native header. A screen that renders once more while it is closing — a
 * save that clears its busy flag after `router.back()`, a query that refreshes
 * — then updates the header of a view Android has already taken off the stack,
 * and react-native-screens stops the app ("ScreenStackFragment added into a
 * non-stack container"). Checking whether the route is still in its navigator
 * is not enough: at that moment the navigator has not caught up yet.
 *
 * So the header is written only when something in it actually changes: the
 * title, or whether there is a header-right element at all. The element
 * itself follows the screen through a slot, which re-renders the button
 * without touching the header.
 */
export function ScreenOptions({ options }: { options: ScreenHeader }) {
  const navigation = useNavigation();
  const [slot] = useState(() => new HeaderRightSlot());
  const { title, headerShown, animation, headerRight } = options;
  const hasRight = headerRight != null;

  useLayoutEffect(() => {
    slot.set(headerRight);
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      ...(title !== undefined && { title }),
      ...(headerShown !== undefined && { headerShown }),
      ...(animation !== undefined && { animation }),
      headerRight: hasRight
        ? (props: Parameters<HeaderRight>[0]) => <HeaderRightView slot={slot} props={props} />
        : undefined,
    });
  }, [navigation, slot, title, headerShown, animation, hasRight]);

  return null;
}

/** The newest header-right renderer, for the header to follow without a `setOptions`. */
class HeaderRightSlot {
  private render: HeaderRight | undefined;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly get = () => this.render;

  set(render: HeaderRight | undefined) {
    if (render === this.render) return;
    this.render = render;
    this.listeners.forEach((listener) => listener());
  }
}

function HeaderRightView({ slot, props }: { slot: HeaderRightSlot; props: Parameters<HeaderRight>[0] }) {
  const render = useSyncExternalStore(slot.subscribe, slot.get);
  return render ? render(props) : null;
}
