import { describe, expect, it, jest } from '@jest/globals';

import { Autosave } from './autosave';
import { SaveGroup, saveBeforeLeave } from './save-before-leave';

describe('leaving an autosaved screen', () => {
  it('waits for storage and does not leave on a false flush result', async () => {
    let finish!: (saved: boolean) => void;
    const leave = jest.fn<() => void>();
    const pending = saveBeforeLeave(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      leave,
    );
    expect(leave).not.toHaveBeenCalled();
    finish(false);
    expect(await pending).toBe(false);
    expect(leave).not.toHaveBeenCalled();
    expect(await saveBeforeLeave(async () => true, leave)).toBe(true);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('never leaves if the flush rejects', async () => {
    const leave = jest.fn<() => void>();
    await expect(
      saveBeforeLeave(async () => {
        throw new Error('storage failure');
      }, leave),
    ).rejects.toThrow();
    expect(leave).not.toHaveBeenCalled();
  });

  it('retains failed text and leaves only after a successful retry of the newest value', async () => {
    let failing = true;
    const stored: string[] = [];
    const saver = new Autosave<string>({
      write: async (text) => {
        if (failing) throw new Error('disk full');
        stored.push(text);
      },
    });
    const leave = jest.fn<() => void>();
    try {
      saver.change('first');
      expect(await saveBeforeLeave(() => saver.flush(), leave)).toBe(false);
      expect(leave).not.toHaveBeenCalled();
      saver.change('latest');
      failing = false;
      expect(await saveBeforeLeave(() => saver.flush(), leave)).toBe(true);
      expect(stored).toEqual(['latest']);
      expect(leave).toHaveBeenCalledTimes(1);
    } finally {
      saver.cancel();
    }
  });

  it('stays when more text arrives during the write being awaited', async () => {
    let finish!: () => void;
    const saver = new Autosave<string>({
      write: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const leave = jest.fn<() => void>();
    try {
      saver.change('first');
      const pending = saveBeforeLeave(() => saver.flush(), leave);
      await Promise.resolve();
      saver.change('newer');
      finish();
      expect(await pending).toBe(false);
      expect(leave).not.toHaveBeenCalled();
      expect(saver.unsaved).toBe(true);
    } finally {
      saver.cancel();
    }
  });
});

describe('all fields before changing a round or shift', () => {
  it('keeps the screen if any field fails and lets the action run after retry', async () => {
    const group = new SaveGroup();
    const one = { unsaved: false, flush: async () => true };
    const two = { unsaved: true, flush: async () => false };
    group.register(one);
    group.register(two);
    const action = jest.fn<() => void>();
    expect(await group.perform(action)).toBe('unsaved');
    expect(action).not.toHaveBeenCalled();
    two.unsaved = false;
    two.flush = async () => true;
    expect(await group.perform(action)).toBe('done');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not run two navigation/status actions while saving is in flight', async () => {
    const group = new SaveGroup();
    let finish!: (saved: boolean) => void;
    const unregister = group.register({
      unsaved: false,
      flush: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const action = jest.fn<() => void>();
    const first = group.perform(action);
    expect(await group.perform(action)).toBe('busy');
    finish(true);
    expect(await first).toBe('done');
    expect(action).toHaveBeenCalledTimes(1);
    unregister();
    expect(await group.flush()).toBe(true);
  });

  it('rechecks earlier fields after waiting for a slower field', async () => {
    const group = new SaveGroup();
    const first = { unsaved: false, flush: async () => true };
    let finish!: (saved: boolean) => void;
    group.register(first);
    group.register({
      unsaved: false,
      flush: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const action = jest.fn<() => void>();
    const pending = group.perform(action);
    first.unsaved = true;
    finish(true);
    expect(await pending).toBe('unsaved');
    expect(action).not.toHaveBeenCalled();
  });
});
