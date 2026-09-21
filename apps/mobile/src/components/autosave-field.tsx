import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { Input, type InputProps } from '@/components/ui';
import { Autosave } from '@/lib/autosave';

/**
 * A field that writes itself, a second or two behind the keyboard.
 *
 * The alternative — writing on every keystroke — looks harmless and is not: a
 * controlled input whose value comes from a live query gets that value pushed
 * back at it after every write, and on a phone, where a write can land slower
 * than the next keypress, the field snaps back to an older string and the
 * cursor jumps.
 *
 * So the text lives here while it is being typed, seeded once from the row.
 * That is the same bargain the note editor makes: a field being edited is not
 * re-read from the database underneath the person editing it. What the row
 * does get is every change on a timer, plus a final write when the screen goes
 * away or the app leaves the foreground.
 *
 * Both the starting text and where it is written are taken on mount and never
 * again, so a field that can end up pointing at a different row must be given
 * a `key` — or live inside something that already is — or it would keep
 * writing one patient's words onto another's.
 */
export function AutosaveField({
  initialValue,
  onSave,
  ...input
}: Omit<InputProps, 'value' | 'onChangeText'> & {
  /** Read once, on mount. Later changes to the row do not reach the field. */
  initialValue: string | null | undefined;
  onSave: (value: string) => Promise<void>;
}) {
  const [text, setText] = useState(initialValue ?? '');

  // Built once, from the first `onSave`. It cannot depend on the prop: that is
  // usually an inline arrow, and rebuilding the scheduler every render would
  // throw away whatever it was waiting to write.
  const [saver] = useState(() => new Autosave<string>({ write: onSave }));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  return (
    <Input
      {...input}
      value={text}
      onChangeText={(value) => {
        setText(value);
        saver.change(value);
      }}
    />
  );
}
