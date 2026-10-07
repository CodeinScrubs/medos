import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Pressable, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from './feedback';
import { PickerModal, type PickerItem } from './picker-modal';
import { IconButton } from './ui';

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => ({ __esModule: true, default: 'Pressable' }));
jest.mock('react-native/Libraries/Components/TextInput/TextInput', () => ({ __esModule: true, default: 'TextInput' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/components/ui', () => ({
  Column: 'Column',
  Divider: 'Divider',
  IconButton: 'IconButton',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/theme', () => ({
  MIN_TOUCH: 48,
  useTheme: () => ({ colors: {}, radii: {}, spacing: {}, typography: {} }),
}));

let tree: ReactTestRenderer | undefined;
async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.clearAllMocks();
});

describe('inline picker acknowledgment', () => {
  it('reports a rejected creation without clearing typed text or selecting a nonexistent item, then retries', async () => {
    const failure = new Error('synthetic refusal');
    const onCreate = jest
      .fn<(text: string) => Promise<PickerItem>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ id: 'synthetic-id', label: 'Synthetic' });
    const onSelect = jest.fn();
    await act(async () => {
      tree = create(
        <PickerModal visible title="Synthetic" items={[]} onCreate={onCreate} onSelect={onSelect} onClose={() => {}} />,
      );
    });
    await act(async () => tree!.root.findByType(TextInput).props.onChangeText('Synthetic'));
    const add = () => tree!.root.findAllByType(Pressable).find((node) => node.props.disabled !== undefined)!;
    await act(async () => {
      add().props.onPress();
      await settle();
    });
    expect(alertError).toHaveBeenCalledWith('افزوده نشد', failure);
    expect(tree!.root.findByType(TextInput).props.value).toBe('Synthetic');
    expect(add().props.disabled).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => {
      add().props.onPress();
      await settle();
    });
    expect(onSelect).toHaveBeenCalledWith({ id: 'synthetic-id', label: 'Synthetic' });
  });
  it('admits only one same-turn creation and keeps close/text locked until acknowledgment', async () => {
    const acknowledgments: ((value: PickerItem) => void)[] = [];
    const onCreate = jest.fn<(text: string) => Promise<PickerItem>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledgments.push(resolve);
        }),
    );
    const onClose = jest.fn();
    const onSelect = jest.fn();
    await act(async () => {
      tree = create(
        <PickerModal visible title="Synthetic" items={[]} onCreate={onCreate} onSelect={onSelect} onClose={onClose} />,
      );
    });
    await act(async () => tree!.root.findByType(TextInput).props.onChangeText('Synthetic'));
    await act(async () => {
      const add = tree!.root.findAllByType(Pressable).find((node) => node.props.disabled !== undefined)!;
      add.props.onPress();
      add.props.onPress();
      tree!.root.findByType(IconButton).props.onPress();
      tree!.root.findByType(TextInput).props.onChangeText('Ignored while pending');
      await settle();
    });
    const calls = onCreate.mock.calls.length;
    const raw = tree!.root.findByType(TextInput).props.value;
    const closes = onClose.mock.calls.length;
    await act(async () => {
      for (const acknowledge of acknowledgments) acknowledge({ id: 'synthetic-id', label: 'Synthetic' });
      await settle();
    });
    expect(calls).toBe(1);
    expect(raw).toBe('Synthetic');
    expect(closes).toBe(0);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
