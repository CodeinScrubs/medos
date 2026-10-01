import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createElement, useState } from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { JalaliDateField } from './jalali-date-field';
import { QuickDateField } from './quick-date-field';
import { Input, ChipSelect, Button, Text } from './ui';
import { useDateValidation } from './use-date-validation';

// Exercise the real field/event/parent guard wiring, without styling or native keyboard rendering.
jest.mock('./ui', () => ({
  Input: 'Input',
  ChipSelect: 'ChipSelect',
  Button: 'Button',
  Column: 'Column',
  Row: 'Row',
  Field: 'Field',
  Text: 'Text',
}));
jest.mock('./use-now', () => ({ useNow: () => new Date('2026-09-23T12:00:00Z').getTime() }));

let tree: ReactTestRenderer;
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

describe('date fields block stale-value saves', () => {
  it('restores controlled incomplete day/clock without rewriting them from a parsed fallback', () => {
    const validity = jest.fn<(valid: boolean) => void>();
    const changed = jest.fn<(next: Date) => void>();
    const props = {
      label: 'date',
      value: new Date(2026, 8, 23, 10),
      withTime: true,
      onChange: changed,
      onValidityChange: validity,
      onRawInputChange: jest.fn(),
    };
    act(() => {
      tree = create(
        <QuickDateField {...props} rawInput={{ dateText: '1405/07/', clockText: '2:', customOpen: true }} />,
      );
    });
    const clock = () => tree.root.findAllByType(Input).find((node) => node.props.icon === 'time-outline')!;
    const day = () => tree.root.findAllByType(Input).find((node) => node.props.icon === 'calendar-outline')!;
    expect(day().props.value).toBe('1405/07/');
    expect(clock().props.value).toBe('2:');
    expect(clock().props.error).toBeDefined();
    expect(validity).toHaveBeenLastCalledWith(false);
    expect(changed).not.toHaveBeenCalled();
    act(() =>
      tree.update(
        <QuickDateField {...props} rawInput={{ dateText: '1405/07/01', clockText: '10:00', customOpen: true }} />,
      ),
    );
    expect(clock().props.value).toBe('10:00');
    expect(clock().props.error).toBeUndefined();
    expect(validity).toHaveBeenLastCalledWith(true);
  });

  it('updates only the day when a controlled preset is selected, retaining invalid clock text', () => {
    const validity = jest.fn<(valid: boolean) => void>();
    function Form() {
      const [raw, setRaw] = useState({ dateText: '1405/07/', clockText: '25:', customOpen: true });
      return (
        <QuickDateField
          label="date"
          value={new Date(2026, 8, 23, 10)}
          onChange={() => {}}
          rawInput={raw}
          onRawInputChange={(patch) => setRaw((current) => ({ ...current, ...patch }))}
          onValidityChange={validity}
          withTime
        />
      );
    }
    act(() => {
      tree = create(<Form />);
    });
    act(() => tree.root.findByType(ChipSelect).props.onChange('d1'));
    expect(tree.root.findAllByType(Input)).toHaveLength(1);
    expect(tree.root.findByType(Input).props.value).toBe('25:');
    expect(validity).toHaveBeenLastCalledWith(false);
    act(() => tree.root.findByType(ChipSelect).props.onChange('custom'));
    expect(tree.root.findAllByType(Input).find((node) => node.props.icon === 'calendar-outline')!.props.value).toBe(
      '۱۴۰۵/۰۷/۰۲',
    );
  });

  it('restores invalid controlled raw text and reports invalidity without falling back to the last ISO value', () => {
    const changed = jest.fn<(iso: string | null) => void>();
    const validity = jest.fn<(valid: boolean) => void>();
    const rawChanged = jest.fn<(text: string) => void>();
    act(() => {
      tree = create(
        <JalaliDateField
          label="date"
          value="2026-09-16"
          rawText="1405/07/"
          onRawTextChange={rawChanged}
          onChange={changed}
          onValidityChange={validity}
        />,
      );
    });
    expect(tree.root.findByType(Input).props.value).toBe('1405/07/');
    expect(validity).toHaveBeenLastCalledWith(false);
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
    act(() => tree.root.findByType(Input).props.onChangeText('1405/06/25'));
    expect(rawChanged).toHaveBeenLastCalledWith('1405/06/25');
    expect(changed).toHaveBeenLastCalledWith('2026-09-16');
  });
  it('blocks invalid date immediately, hides the old preview, and allows a corrected or optional empty value', () => {
    const saved = jest.fn<(value: string | null) => void>();
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    function Form() {
      const [value, setValue] = useState<string | null>('2026-09-23');
      const validation = useDateValidation();
      return (
        <>
          <JalaliDateField label="date" value={value} onChange={setValue} onValidityChange={validation.setValid} />
          <Button
            label="Save"
            onPress={() => {
              if (validation.check()) saved(value);
            }}
          />
        </>
      );
    }
    act(() => {
      tree = create(<Form />);
    });
    expect(tree.root.findAllByType(Text)).toHaveLength(1);
    const input = () => tree.root.findByType(Input);
    act(() => {
      input().props.onChangeText('1405/07/');
      tree.root.findByType(Button).props.onPress();
    });
    expect(saved).not.toHaveBeenCalled();
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
    act(() => input().props.onChangeText('۱۴۰۵/۰۶/۲۵'));
    act(() => tree.root.findByType(Button).props.onPress());
    expect(saved).toHaveBeenLastCalledWith('2026-09-16');
    act(() => input().props.onChangeText(''));
    act(() => tree.root.findByType(Button).props.onPress());
    expect(saved).toHaveBeenLastCalledWith(null);
  });

  it('keeps day and clock failures independent; presets do not repair an invalid clock', () => {
    const saved = jest.fn<(value: Date) => void>();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    function Form({ withTime = true }: { withTime?: boolean }) {
      const [value, setValue] = useState(new Date(2026, 8, 23, 9, 30));
      const validation = useDateValidation();
      return (
        <>
          <QuickDateField
            label="date"
            value={value}
            onChange={setValue}
            onValidityChange={validation.setValid}
            withTime={withTime}
          />
          <Button
            label="Save"
            onPress={() => {
              if (validation.check()) saved(value);
            }}
          />
        </>
      );
    }
    act(() => {
      tree = create(<Form />);
    });
    const clock = () => tree.root.findAllByType(Input).find((node) => node.props.icon === 'time-outline')!;
    const save = () => tree.root.findByType(Button).props.onPress();
    act(() => {
      clock().props.onChangeText('25:00');
      save();
    });
    expect(saved).not.toHaveBeenCalled();
    act(() => tree.root.findByType(ChipSelect).props.onChange('d1'));
    act(save);
    expect(saved).not.toHaveBeenCalled();
    act(() => clock().props.onChangeText('18:15'));
    act(save);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].getHours()).toBe(18);
    act(() => tree.root.findByType(ChipSelect).props.onChange('custom'));
    const day = () => tree.root.findAllByType(Input).find((node) => node.props.icon === 'calendar-outline')!;
    act(() => {
      day().props.onChangeText('');
      clock().props.onChangeText('19:00');
      save();
    });
    expect(saved).toHaveBeenCalledTimes(1);
    act(() => tree.root.findByType(ChipSelect).props.onChange('d0'));
    act(() => clock().props.onChangeText(''));
    act(save);
    expect(saved).toHaveBeenCalledTimes(1);
    act(() => tree.update(createElement(Form, { withTime: false })));
    act(save);
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('refreshes visible clock and validation when the parent loads another observation', () => {
    const changed = jest.fn<(next: Date) => void>();
    const validity = jest.fn<(valid: boolean) => void>();
    const props = { label: 'date', onChange: changed, onValidityChange: validity, withTime: true };
    act(() => {
      tree = create(<QuickDateField {...props} value={new Date(2026, 8, 23, 9, 30)} />);
    });
    const clock = () => tree.root.findAllByType(Input).find((node) => node.props.icon === 'time-outline')!;
    act(() => clock().props.onChangeText('25:00'));
    expect(validity).toHaveBeenLastCalledWith(false);
    act(() => tree.update(<QuickDateField {...props} value={new Date(2026, 8, 23, 16, 45)} />));
    expect(clock().props.value).toBe('۱۶:۴۵');
    expect(clock().props.error).toBeUndefined();
    expect(validity).toHaveBeenLastCalledWith(true);
  });
});
