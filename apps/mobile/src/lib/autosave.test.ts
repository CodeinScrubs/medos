import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { Autosave, type AutosaveState } from './autosave';

/*
 * Time is faked so the ceiling can be tested at all: the case that matters is
 * someone typing without pausing, which a debounce alone never writes.
 */

let clock = 0;
const now = () => clock;

function tick(ms: number) {
  clock += ms;
  jest.advanceTimersByTime(ms);
}

beforeEach(() => {
  clock = 0;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function build(write: (v: string) => Promise<void>) {
  const states: AutosaveState[] = [];
  const saver = new Autosave<string>({
    write,
    delayMs: 800,
    maxWaitMs: 3000,
    now,
    onState: (s) => states.push(s),
  });
  return { saver, states };
}

describe('Autosave', () => {
  it('remains unsaved while a write is in flight, even with no pending value', async () => {
    let finish!: () => void;
    const { saver } = build(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    saver.change('pending');
    const flushed = saver.flush();
    await Promise.resolve();
    expect(saver.unsaved).toBe(true);
    finish();
    expect(await flushed).toBe(true);
    expect(saver.unsaved).toBe(false);
  });

  it('writes once, after the typing stops', async () => {
    const written: string[] = [];
    const { saver, states } = build(async (v) => void written.push(v));

    saver.change('a');
    tick(300);
    saver.change('ab');
    tick(300);
    saver.change('abc');
    expect(written).toEqual([]);

    tick(800);
    await saver.flush();
    expect(written).toEqual(['abc']);
    expect(states.at(-1)).toEqual({ status: 'saved', at: clock });
  });

  // The case a plain debounce never handles: the keyboard never goes quiet.
  it('writes anyway when the typing does not stop', async () => {
    const written: string[] = [];
    const { saver } = build(async (v) => void written.push(v));

    for (let i = 0; i < 20; i += 1) {
      saver.change(`line ${i}`);
      tick(200);
      // A keystroke is its own event on the phone, so pending work between
      // them runs; a synchronous loop would hold every write until the end.
      await Promise.resolve();
    }

    expect(written.length).toBeGreaterThanOrEqual(1);
    // The ceiling is 3s and 4s of typing elapsed: it cannot have waited longer.
    expect(written[0]).toBe('line 14');
  });

  it('never runs two writes at once', async () => {
    let inFlight = 0;
    let overlapped = false;
    const order: string[] = [];
    const { saver } = build(async (v) => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await Promise.resolve();
      order.push(v);
      inFlight -= 1;
    });

    saver.change('first');
    await saver.flush();
    saver.change('second');
    saver.change('third');
    await saver.flush();

    expect(overlapped).toBe(false);
    expect(order).toEqual(['first', 'third']);
  });

  it('keeps the value when a write fails, and says so until one succeeds', async () => {
    let fail = true;
    const written: string[] = [];
    const { saver, states } = build(async (v) => {
      if (fail) throw new Error('disk full');
      written.push(v);
    });

    saver.change('important');
    await saver.flush();
    expect(written).toEqual([]);
    expect(states.at(-1)?.status).toBe('failed');
    expect(saver.unsaved).toBe(true);

    fail = false;
    await saver.flush();
    expect(written).toEqual(['important']);
    expect(states.at(-1)?.status).toBe('saved');
    expect(saver.unsaved).toBe(false);
  });

  it('does not overwrite a newer value with a failed older one', async () => {
    const written: string[] = [];
    let fail = true;
    const { saver } = build(async (v) => {
      if (fail) throw new Error('nope');
      written.push(v);
    });

    saver.change('old');
    await saver.flush();
    fail = false;
    saver.change('new');
    await saver.flush();

    expect(written).toEqual(['new']);
  });

  it('stops writing once cancelled', async () => {
    const written: string[] = [];
    const { saver } = build(async (v) => void written.push(v));

    saver.change('gone');
    saver.cancel();
    tick(5000);
    await saver.flush();

    saver.change('also gone');
    tick(5000);
    await saver.flush();

    expect(written).toEqual([]);
  });
});

describe('what Autosave promises', () => {
  it('does not report saved while a newer revision is waiting', async () => {
    let release: (() => void) | null = null;
    const { saver, states } = build(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    saver.change('first');
    const flushed = saver.flush();
    await Promise.resolve();
    // Typed while the write is in flight.
    saver.change('second');
    release!();
    await flushed;

    expect(states.at(-1)?.status).toBe('pending');
    expect(saver.unsaved).toBe(true);
  });

  it('tells the caller whether the flush actually landed', async () => {
    let fail = true;
    const { saver } = build(async () => {
      if (fail) throw new Error('disk full');
    });

    saver.change('important');
    expect(await saver.flush()).toBe(false);

    fail = false;
    expect(await saver.flush()).toBe(true);
  });
});
