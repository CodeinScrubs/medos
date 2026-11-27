import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as log from './error-log';

const mockFiles = new Map<string, { body: string; modified: number }>();
let mockId: string | undefined;
let mockPartialWrite = false;
let mockDeleteFailure = false;
const mockNow = new Date('2026-01-01T12:00:00.000Z');
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('@/lib/ids', () => ({
  newId: () => mockId ?? jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));
jest.mock('expo-file-system', () => {
  class MemoryFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .reduce(
          (uri, part, index) => (index === 0 ? part : uri.replace(/\/+$/, '') + '/' + part.replace(/^\/+/, '')),
          '',
        );
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return new TextEncoder().encode(mockFiles.get(this.uri)?.body ?? '').length;
    }
    get modificationTime() {
      return mockFiles.get(this.uri)?.modified ?? null;
    }
    create() {
      if (this.exists) throw new Error('synthetic existing destination');
      mockFiles.set(this.uri, { body: '', modified: mockNow.getTime() });
    }
    write(body: string) {
      mockFiles.set(this.uri, { body: mockPartialWrite ? 'partial' : body, modified: mockNow.getTime() });
      if (mockPartialWrite) throw new Error('synthetic partial write');
    }
    delete() {
      if (mockDeleteFailure) throw new Error('synthetic cleanup failure');
      mockFiles.delete(this.uri);
    }
  }
  class MemoryDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .reduce(
          (uri, part, index) => (index === 0 ? part : uri.replace(/\/+$/, '') + '/' + part.replace(/^\/+/, '')),
          '',
        );
      // Installed Android FileSystemDirectory.asString always ends in '/'.
      this.uri += '/';
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes('/'))
        .map((uri) => new MemoryFile(uri));
    }
  }
  return {
    Paths: { document: 'file:///synthetic', cache: 'file:///synthetic-cache' },
    FileMode: { ReadOnly: 'r' },
    File: MemoryFile,
    Directory: MemoryDirectory,
  };
});
const snapshot: log.ErrorLogSnapshot = {
  entries: [],
  incomplete: true,
  legacyConverted: 0,
  skippedInWindow: 1,
  earlierBytesOmitted: false,
  writeFailureObserved: false,
};
type NextLog = typeof log & {
  ERROR_SHARE_MAX_FILES: number;
  ERROR_SHARE_MAX_BYTES: number;
  ERROR_SHARE_GRACE_MS: number;
  prepareErrorLogShare: (snapshot: log.ErrorLogSnapshot, mockNow?: Date) => string;
  retainErrorLogShare: (uri: string) => () => void;
};
const api = log as NextLog;
beforeEach(() => {
  mockFiles.clear();
  mockId = undefined;
  mockPartialWrite = false;
  mockDeleteFailure = false;
});
describe('bounded immutable diagnostic share cache', () => {
  it('retains a native Android directory URI ending in slash and rejects unrelated targets', () => {
    const offered = api.prepareErrorLogShare(snapshot, mockNow);
    expect(offered.startsWith('file:///synthetic-cache/diagnostics/medos-errors-')).toBe(true);
    const release = api.retainErrorLogShare(offered);
    const name = offered.split('/').at(-1)!;
    for (const unrelated of [
      'file:///synthetic-cache/sibling/' + name,
      'file:///synthetic-cache/diagnostics/nested/' + name,
    ]) {
      mockFiles.set(unrelated, { body: 'SYNTHETIC_UNRELATED', modified: 0 });
      expect(() => api.retainErrorLogShare(unrelated)).toThrow();
    }
    release();
    release();
  });
  it('refuses allocation after the count cap while preserving every recent snapshot', () => {
    const first = api.prepareErrorLogShare(snapshot, mockNow);
    const bytes = mockFiles.get(first)!.body;
    for (let i = 1; i < 20; i++) api.prepareErrorLogShare(snapshot, mockNow);
    expect(() => api.prepareErrorLogShare(snapshot, mockNow)).toThrow();
    expect(mockFiles.size).toBe(20);
    expect(mockFiles.get(first)?.body).toBe(bytes);
  });
  it('retires only old unpinned owned files; a pending offered URI survives cleanup', () => {
    const pinned = api.prepareErrorLogShare(snapshot, mockNow);
    const release = api.retainErrorLogShare(pinned);
    for (let i = 1; i < 20; i++) api.prepareErrorLogShare(snapshot, mockNow);
    const foreign = 'file:///synthetic-cache/diagnostics/user-notes.txt';
    const nested = 'file:///synthetic-cache/diagnostics/nested/medos-errors-12345678-1234-1234-1234-123456789abc.json';
    mockFiles.set(foreign, { body: 'SYNTHETIC_UNRELATED', modified: 0 });
    mockFiles.set(nested, { body: 'SYNTHETIC_UNRELATED', modified: 0 });
    const later = new Date(mockNow.getTime() + 24 * 60 * 60 * 1000 + 1);
    api.prepareErrorLogShare(snapshot, later);
    expect(mockFiles.has(pinned)).toBe(true);
    expect(mockFiles.has(foreign)).toBe(true);
    expect(mockFiles.has(nested)).toBe(true);
    expect(mockFiles.size).toBe(22);
    release();
    release();
  });
  it('refuses new allocation when every old snapshot is still offered', () => {
    const release: (() => void)[] = [];
    for (let i = 0; i < 20; i++) release.push(api.retainErrorLogShare(api.prepareErrorLogShare(snapshot, mockNow)));
    const before = new Map(mockFiles);
    expect(() => api.prepareErrorLogShare(snapshot, new Date(mockNow.getTime() + 24 * 60 * 60 * 1000 + 1))).toThrow();
    expect(mockFiles).toEqual(before);
    release.forEach((done) => done());
  });
  it('refuses allocation over the byte cap without changing recent files', () => {
    for (let i = 0; i < 11; i++)
      mockFiles.set(`file:///synthetic-cache/diagnostics/medos-errors-${randomUUID()}.json`, {
        body: 'x'.repeat(1024 * 1024),
        modified: mockNow.getTime(),
      });
    const before = new Map(mockFiles);
    expect(() => api.prepareErrorLogShare(snapshot, mockNow)).toThrow();
    expect(mockFiles).toEqual(before);
  });
  it('removes only a newly created never-offered partial snapshot after preparation fails', () => {
    mockPartialWrite = true;
    expect(() => api.prepareErrorLogShare(snapshot, mockNow)).toThrow('synthetic partial write');
    expect(mockFiles.size).toBe(0);
  });
  it('never deletes or rewrites a colliding pre-existing filename', () => {
    mockId = '12345678-1234-1234-1234-123456789abc';
    const file = `file:///synthetic-cache/diagnostics/medos-errors-${mockId}.json`;
    mockFiles.set(file, { body: 'SYNTHETIC_PRIOR_SNAPSHOT', modified: mockNow.getTime() });
    expect(() => api.prepareErrorLogShare(snapshot, mockNow)).toThrow('گزارش موقت با این نام وجود دارد');
    expect(mockFiles.get(file)?.body).toBe('SYNTHETIC_PRIOR_SNAPSHOT');
  });
  it('does not allocate another file when an eligible cleanup fails', () => {
    for (let i = 0; i < 20; i++) api.prepareErrorLogShare(snapshot, mockNow);
    mockDeleteFailure = true;
    const before = new Map(mockFiles);
    expect(() => api.prepareErrorLogShare(snapshot, new Date(mockNow.getTime() + 24 * 60 * 60 * 1000 + 1))).toThrow(
      'synthetic cleanup failure',
    );
    expect(mockFiles).toEqual(before);
  });
});
