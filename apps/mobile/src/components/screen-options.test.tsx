import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScreenOptions, type ScreenHeader } from './screen-options';

type Applied = { title?: string; headerRight?: (props: object) => ReactNode };

const mockNavigation = { setOptions: jest.fn<(options: Applied) => void>() };

jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));

beforeEach(() => {
  mockNavigation.setOptions.mockClear();
});

let tree: ReactTestRenderer;

async function render(options: ScreenHeader) {
  await act(async () => {
    if (tree) tree.update(<ScreenOptions options={options} />);
    else tree = create(<ScreenOptions options={options} />);
  });
}

/** What the native header would show on the right, rendered from the last options it was given. */
function headerRight(): ReactTestRenderer {
  const applied = mockNavigation.setOptions.mock.calls.at(-1)![0];
  let header!: ReactTestRenderer;
  act(() => {
    header = create(<>{applied.headerRight?.({})}</>);
  });
  return header;
}

describe('ScreenOptions', () => {
  beforeEach(async () => {
    await act(async () => tree?.unmount());
    tree = undefined as unknown as ReactTestRenderer;
  });

  /*
   * A save calls router.back() and then clears its busy flag. That render used
   * to rewrite the header of a screen Android had already taken off the stack,
   * and the app stopped. A render that changes nothing in the header must not
   * touch it.
   */
  it('does not rewrite the header when a render changes nothing in it', async () => {
    await render({ title: 'ویرایش نوت', headerRight: () => 'history' });
    await render({ title: 'ویرایش نوت', headerRight: () => 'history' });
    await render({ title: 'ویرایش نوت', headerRight: () => 'history' });

    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
  });

  it('rewrites it when the title changes', async () => {
    await render({ title: 'بیمار' });
    await render({ title: 'Example Patient' });

    expect(mockNavigation.setOptions.mock.calls.map(([o]) => o.title)).toEqual(['بیمار', 'Example Patient']);
  });

  it('keeps the header-right button current without rewriting the header', async () => {
    await render({ title: 'پزشک', headerRight: () => 'star-outline' });
    const header = headerRight();
    expect(header.toJSON()).toBe('star-outline');

    await render({ title: 'پزشک', headerRight: () => 'star' });

    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    expect(header.toJSON()).toBe('star');
  });

  it('adds and removes the header-right slot when it appears or goes', async () => {
    await render({ title: 'نوت جدید' });
    await render({ title: 'نوت جدید', headerRight: () => 'history' });
    await render({ title: 'نوت جدید' });

    expect(mockNavigation.setOptions.mock.calls.map(([o]) => o.headerRight != null)).toEqual([false, true, false]);
  });
});
