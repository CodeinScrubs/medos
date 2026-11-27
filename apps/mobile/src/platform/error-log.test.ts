import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  clearErrorLog,
  decodeErrorEntry,
  ERROR_LOG_READ_BYTES,
  installGlobalErrorLogging,
  logError,
  prepareErrorLogShare,
  readErrorLog,
} from './error-log';

const mockFiles = new Map<string, string>();
let mockDeleteFailure = false;
let mockReadFailure = false;
let mockWriteFailure = false;
let mockCloseFailure = false;
let mockMarkerCreateFailure = false;
let mockTruncateWriteFailure = false;
const mockReadRequests: number[] = [];
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.11.61', android: { versionCode: 77 } } },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///synthetic', cache: 'file:///synthetic-cache' },
  FileMode: { ReadOnly: 'r' },
  Directory: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      const Type = jest.requireMock<typeof import('expo-file-system')>('expo-file-system').File;
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(this.uri + '/') && !uri.slice(this.uri.length + 1).includes('/'))
        .map((uri) => new Type(uri));
    }
  },
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get modificationTime() {
      return Date.now();
    }
    get size() {
      return new TextEncoder().encode(mockFiles.get(this.uri) ?? '').length;
    }
    create() {
      if (mockMarkerCreateFailure && this.uri.endsWith('/errors-writing')) throw new Error('synthetic marker failure');
      if (this.exists) throw new Error('synthetic existing destination');
      mockFiles.set(this.uri, '');
    }
    textSync() {
      return mockFiles.get(this.uri)!;
    }
    write(body: string) {
      if (mockTruncateWriteFailure && this.uri.endsWith('/errors.jsonl')) {
        mockFiles.set(this.uri, '');
        throw new Error('synthetic truncate failure');
      }
      if (mockWriteFailure) throw new Error('synthetic write failed');
      mockFiles.set(this.uri, body);
    }
    open() {
      if (mockReadFailure) throw new Error('synthetic read failed');
      const bytes = new TextEncoder().encode(mockFiles.get(this.uri)!);
      let offset = 0;
      return {
        size: bytes.length,
        get offset() {
          return offset;
        },
        set offset(value: number) {
          offset = value;
        },
        readBytes(length: number) {
          mockReadRequests.push(length);
          const result = bytes.slice(offset, offset + length);
          offset += result.length;
          return result;
        },
        close() {
          if (mockCloseFailure) throw new Error('synthetic close failed');
        },
      };
    }
    delete() {
      if (mockDeleteFailure) throw new Error('synthetic deletion failed');
      mockFiles.delete(this.uri);
    }
  },
}));

beforeEach(() => {
  mockFiles.clear();
  mockDeleteFailure = false;
  mockReadFailure = false;
  mockWriteFailure = false;
  mockCloseFailure = false;
  mockMarkerCreateFailure = false;
  mockTruncateWriteFailure = false;
  mockReadRequests.length = 0;
  clearErrorLog();
});
afterEach(() => {
  jest.restoreAllMocks();
});
describe('default technical diagnostic boundary', () => {
  it('retains an incomplete-write signal through a fresh module after truncation', () => {
    const uri = 'file:///synthetic/logs/errors.jsonl';
    mockFiles.set(
      uri,
      JSON.stringify({ at: '2026-01-01T00:00:00.000Z', source: 'handled', message: 'SYNTHETIC_LEGACY_CANARY' }) + '\n',
    );
    mockTruncateWriteFailure = true;
    const read = readErrorLog();
    expect(read.status === 'ok' && read.snapshot.incomplete).toBe(true);
    expect(mockFiles.get(uri)).toBe('');
    mockTruncateWriteFailure = false;
    let fresh!: typeof import('./error-log');
    jest.isolateModules(() => {
      fresh = jest.requireActual<typeof import('./error-log')>('./error-log');
    });
    const restarted = fresh.readErrorLog();
    expect(restarted.status === 'ok' && restarted.snapshot.incomplete).toBe(true);
    logError(new Error('synthetic after restart'), { source: 'handled' });
    let again!: typeof import('./error-log');
    jest.isolateModules(() => {
      again = jest.requireActual<typeof import('./error-log')>('./error-log');
    });
    const persisted = again.readErrorLog();
    expect(persisted.status === 'ok' && persisted.snapshot.incomplete).toBe(true);
  });
  it('leaves old bytes intact when the persistent marker cannot be created', () => {
    const uri = 'file:///synthetic/logs/errors.jsonl';
    const original =
      JSON.stringify({ at: '2026-01-01T00:00:00.000Z', source: 'handled', message: 'SYNTHETIC_LEGACY_CANARY' }) + '\n';
    mockFiles.set(uri, original);
    mockMarkerCreateFailure = true;
    const read = readErrorLog();
    expect(read.status === 'ok' && read.snapshot.incomplete).toBe(true);
    expect(mockFiles.get(uri)).toBe(original);
  });
  it('does not falsely complete clearing a missing log whose marker deletion fails', () => {
    mockFiles.set('file:///synthetic/logs/errors-writing', '1');
    mockDeleteFailure = true;
    expect(() => clearErrorLog()).toThrow('synthetic deletion failed');
    const read = readErrorLog();
    expect(read.status === 'ok' && read.snapshot.incomplete).toBe(true);
  });
  it('does not persist arbitrary message, stack or context content', () => {
    const canary = 'SYNTHETIC_PRIVATE_CANARY_619';
    const error = new Error(`Failed query: literal ${canary} before params: hidden suffix`);
    error.stack = `Error: ${canary}\n    at ${canary} (address at index.android.bundle:1:619)`;
    logError(error, { source: 'handled', context: canary });
    expect([...mockFiles.values()].join('\n')).not.toContain(canary);
    expect([...mockFiles.values()].join('\n')).toContain('619');
  });
  it('does not falsely acknowledge a failed explicit clear', () => {
    mockFiles.set('file:///synthetic/logs/errors.jsonl', '{}\n');
    mockDeleteFailure = true;
    expect(() => clearErrorLog()).toThrow('synthetic deletion failed');
    expect(mockFiles.size).toBe(1);
  });
  it('projects legacy records, removes their raw disk bodies and exports immutable safe snapshots', () => {
    const canary = 'SYNTHETIC_LEGACY_CANARY';
    mockFiles.set(
      'file:///synthetic/logs/errors.jsonl',
      JSON.stringify({
        at: '2026-01-01T00:00:00.000Z',
        source: 'handled',
        message: canary,
        context: canary,
        stack: `Error: ${canary}\n    at ${canary} (address at index.android.bundle:1:791)`,
      }) + '\n',
    );
    const read = readErrorLog();
    if (read.status !== 'ok') throw read.error;
    expect(read.snapshot.entries).toHaveLength(1);
    expect(read.snapshot.entries[0]).toMatchObject({
      version: 2,
      legacy: true,
      diagnostic: { frames: [{ offset: 791 }] },
    });
    expect(read.snapshot.entries[0]?.recordedAppVersion).toBeUndefined();
    const uri = prepareErrorLogShare(read.snapshot);
    const shared = mockFiles.get(uri)!;
    expect(uri).not.toBe('file:///synthetic/logs/errors.jsonl');
    expect([...mockFiles.values()].join('\n')).not.toContain(canary);
    clearErrorLog();
    logError(new Error('later synthetic event'), { source: 'handled' });
    expect(mockFiles.get(uri)).toBe(shared);
    expect(prepareErrorLogShare(read.snapshot)).not.toBe(uri);
  });
  it.each([
    null,
    42,
    [],
    { at: 'invalid', source: 'handled', message: 'x' },
    { at: '2026-01-01T00:00:00.000Z', source: 'unknown', message: 'x' },
    { at: '2026-01-01T00:00:00.000Z', source: 'handled', message: {} },
    { at: '2026-01-01T00:00:00.000Z', source: 'handled', message: 'x', fatal: 'true' },
    { at: '9999-01-01T00:00:00.000Z', source: 'handled', message: 'x' },
    { at: '2026-01-01T00:00:00.000Z', source: 'handled', message: 'x', extra: 'SYNTHETIC_CANARY' },
  ])('refuses malformed legacy shape %j before rendering', (value) => expect(decodeErrorEntry(value)).toBeUndefined());
  it('caps native reads, lines and retained entries while making omission visible', () => {
    const entry = JSON.stringify({ at: '2026-01-01T00:00:00.000Z', source: 'handled', message: 'synthetic' });
    mockFiles.set(
      'file:///synthetic/logs/errors.jsonl',
      'X'.repeat(ERROR_LOG_READ_BYTES + 17) + '\n' + (entry + '\n').repeat(450),
    );
    const read = readErrorLog();
    if (read.status !== 'ok') throw read.error;
    expect(Math.max(...mockReadRequests)).toBeLessThanOrEqual(ERROR_LOG_READ_BYTES);
    expect(read.snapshot.entries).toHaveLength(100);
    expect(read.snapshot.incomplete).toBe(true);
    expect(read.snapshot.earlierBytesOmitted).toBe(true);
    const again = readErrorLog();
    expect(again.status === 'ok' && again.snapshot.incomplete).toBe(true);
  });
  it('distinguishes read/close failure from empty and does not overwrite previous evidence', () => {
    const previous = '{}\n';
    mockFiles.set('file:///synthetic/logs/errors.jsonl', previous);
    mockReadFailure = true;
    expect(readErrorLog().status).toBe('error');
    logError(new Error('synthetic'), { source: 'handled' });
    expect(mockFiles.get('file:///synthetic/logs/errors.jsonl')).toBe(previous);
    mockReadFailure = false;
    mockCloseFailure = true;
    expect(readErrorLog().status).toBe('error');
  });
  it('does not share unvalidated objects or acknowledge failed snapshot writes', () => {
    logError(new Error('synthetic'), { source: 'handled' });
    const read = readErrorLog();
    if (read.status !== 'ok') throw read.error;
    const entry = read.snapshot.entries[0]!;
    expect(() =>
      prepareErrorLogShare({ ...read.snapshot, entries: [{ ...entry, extra: 'SYNTHETIC' } as typeof entry] }),
    ).toThrow();
    mockWriteFailure = true;
    expect(() => prepareErrorLogShare(read.snapshot)).toThrow('synthetic write failed');
    expect(() => logError(new Error('synthetic'), { source: 'global', fatal: true })).not.toThrow();
  });
  it('hands a fresh content-free error and original fatal flag to the previous handler once', () => {
    const previous = jest.fn();
    let handler: ((error: unknown, fatal?: boolean) => void) | undefined;
    const state = globalThis as typeof globalThis & { ErrorUtils?: unknown };
    const original = state.ErrorUtils;
    state.ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (next: typeof handler) => {
        handler = next;
      },
    };
    try {
      installGlobalErrorLogging();
      const error = new Error('SYNTHETIC_GLOBAL_CANARY');
      error.stack = 'Error: SYNTHETIC_GLOBAL_CANARY\n    at private (address at index.android.bundle:1:123)';
      mockWriteFailure = true;
      handler!(error, true);
      expect(previous).toHaveBeenCalledTimes(1);
      const [safe, fatal] = previous.mock.calls[0]!;
      expect(safe).not.toBe(error);
      expect(JSON.stringify({ message: (safe as Error).message, stack: (safe as Error).stack })).not.toContain(
        'SYNTHETIC_GLOBAL_CANARY',
      );
      expect((safe as Error).stack).toContain('index.android.bundle:1:123');
      expect(fatal).toBe(true);
    } finally {
      state.ErrorUtils = original;
    }
  });
});
