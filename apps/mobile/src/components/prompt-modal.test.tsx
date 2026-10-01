import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Keyboard, Modal } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PromptModal } from './prompt-modal';
import { Button, Input } from './ui';

// Native IME visibility is exercised on Android separately. Here the real
// dialog must retain its text and discard guard across both keyboard states.
jest.mock('react-native-keyboard-controller', () => ({ KeyboardController: { isVisible: jest.fn() } }));
jest.mock('./ui', () => ({ Button: 'Button', Column: 'Column', Input: 'Input', Row: 'Row', Text: 'Text' }));

let tree: ReactTestRenderer | undefined;
const cancel = jest.fn();
const submit = jest.fn();
const visible = jest.mocked(KeyboardController.isVisible);
const input = () => tree!.root.findByType(Input);
const back = () => act(() => tree!.root.findByType(Modal).props.onRequestClose());
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
function render(secret = false, open = true, initialValue = '') {
  const dialog = (
    <PromptModal
      visible={open}
      title="Test"
      initialValue={initialValue}
      secret={secret}
      onCancel={cancel}
      onSubmit={submit}
    />
  );
  act(() => {
    if (tree) tree.update(dialog);
    else tree = create(dialog);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  visible.mockReturnValue(false);
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('prompt text survives Android Back', () => {
  it.each([false, true])('hides the IME first, then offers the existing discard choice (secret=%s)', (secret) => {
    render(secret);
    act(() => input().props.onChangeText('  Text to preserve  '));
    visible.mockReturnValue(true);
    back();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(input().props.value).toBe('  Text to preserve  ');

    visible.mockReturnValue(false);
    back();
    const choices = jest.mocked(Alert.alert).mock.calls[0]![2]!;
    expect(choices.map((choice) => choice.text)).toEqual(['ادامه‌ی نوشتن', 'دور بریز']);
    act(() => choices[0]!.onPress?.());
    expect(cancel).not.toHaveBeenCalled();
    expect(input().props.value).toBe('  Text to preserve  ');
    act(() => choices[1]!.onPress?.());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['', 'Unchanged'])('keeps an untouched prompt open until Back with the IME hidden (%s)', (initialValue) => {
    render(false, true, initialValue);
    visible.mockReturnValue(true);
    back();
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    visible.mockReturnValue(false);
    back();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('keeps backdrop discard protection and allows explicit Cancel while the IME is visible', () => {
    render();
    act(() => input().props.onChangeText('Do not discard silently'));
    visible.mockReturnValue(true);
    // The dialog's outer press target is the backdrop; do not pin its styling.
    const backdrop = tree!.root.findByType(Modal).findAll((node) => typeof node.props.onPress === 'function')[0]!;
    act(() => backdrop.props.onPress());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    act(() => button('انصراف').props.onPress());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'clears the previous entry on reopen and preserves submission semantics (secret=%s)',
    (secret) => {
      render(secret);
      act(() => input().props.onChangeText('  Exact value  '));
      act(() => button('ثبت').props.onPress());
      expect(submit).toHaveBeenCalledWith(secret ? '  Exact value  ' : 'Exact value');
      render(secret, false);
      render(secret);
      expect(input().props.value).toBe('');
    },
  );
});
