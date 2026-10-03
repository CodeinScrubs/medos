import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { RecordingCompletion } from './recording-completion';

let completion: RecordingCompletion;
const success = { isFinished: true, hasError: false, url: 'file:///current.m4a' };
beforeEach(() => {
  jest.useFakeTimers();
  completion = new RecordingCompletion();
  completion.begin(success.url);
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('native recording completion', () => {
  it.each(['before waiting', 'after waiting'])('accepts a matching terminal URL %s', async (order) => {
    if (order === 'before waiting') completion.receive(success);
    const result = completion.waitForUri(5000);
    if (order === 'after waiting') completion.receive(success);
    await expect(result).resolves.toBe(success.url);
  });

  it.each([null, '', '   ', 'file:///previous.m4a'])('does not trust an absent or foreign URL: %s', async (url) => {
    completion.receive({ ...success, url });
    const result = completion.waitForUri(5000);
    const refused = expect(result).rejects.toThrow('هنوز تأیید نشده');
    await jest.advanceTimersByTimeAsync(5000);
    await refused;
  });

  it('does not treat an in-progress event as completion', async () => {
    completion.receive({ ...success, isFinished: false });
    const result = completion.waitForUri(5000);
    expect(jest.getTimerCount()).toBe(1);
    completion.receive(success);
    await expect(result).resolves.toBe(success.url);
  });

  it.each([null, success.url])('keeps a reported native error even if a cached URL exists: %s', async (url) => {
    completion.receive({ ...success, hasError: true, url });
    completion.receive(success);
    await expect(completion.waitForUri(5000)).rejects.toThrow('خطا');
    expect(completion.error).toBeInstanceOf(Error);
  });

  it('rejects a waiter on a native error, including a non-finished error event', async () => {
    const result = completion.waitForUri(5000);
    const refused = expect(result).rejects.toThrow('خطا');
    completion.receive({ isFinished: false, hasError: true, url: null });
    await refused;
  });

  it('keeps a timed-out recording available for a later terminal result and retry', async () => {
    const result = completion.waitForUri(5000);
    const refused = expect(result).rejects.toThrow('هنوز تأیید نشده');
    await jest.advanceTimersByTimeAsync(5000);
    await refused;
    completion.receive(success);
    await expect(completion.waitForUri(5000)).resolves.toBe(success.url);
  });

  it('only a new explicit capture resets a terminal error', async () => {
    completion.receive({ ...success, hasError: true });
    completion.begin('file:///next.m4a');
    completion.receive(success);
    const result = completion.waitForUri(5000);
    completion.receive({ ...success, url: 'file:///next.m4a' });
    await expect(result).resolves.toBe('file:///next.m4a');
    expect(completion.error).toBeNull();
  });

  it('refuses replacing a capture while its confirmation is pending', async () => {
    const result = completion.waitForUri(5000);
    expect(() => completion.begin('file:///next.m4a')).toThrow('قبلی');
    completion.receive(success);
    await expect(result).resolves.toBe(success.url);
  });
});
