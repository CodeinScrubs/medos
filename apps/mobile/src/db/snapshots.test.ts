import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { snapshotDatabase } from './snapshots';

// Native files are stood in; assertions cover retention ordering and failure,
// not filesystem/power-loss durability. SQLite's VACUUM contract is separate.
const mockFiles = new Map<string, number>();
const mockDeleted: string[] = [];
let mockDeleteFailure: string | null = null;
const mockVacuum = jest.fn((statement: string) => {
  const path = statement.match(/INTO '([^']+)'/)![1]!;
  mockFiles.set(`file://${path}`, 128);
});
jest.mock('./client', () => ({ sqlite: { execSync: (sql: string) => mockVacuum(sql) } }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///private/' },
  Directory: class {
    uri: string;
    exists = true;
    constructor(base: string, name: string) {
      this.uri = `${base}${name}`;
    }
    create() {}
    list() {
      const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
      return [...mockFiles.keys()].map((path) => new File(path));
    }
  },
  File: class {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = name ? `${typeof base === 'string' ? base : base.uri}/${name}` : (base as string);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? null;
    }
    delete() {
      if (this.uri === mockDeleteFailure) throw new Error('synthetic delete failure');
      mockDeleted.push(this.uri);
      mockFiles.delete(this.uri);
    }
  },
}));

const old = (time: number, kind = 'pre-restore') => `file:///private/backups/${kind}-${time}.db`;
beforeEach(() => {
  mockFiles.clear();
  mockDeleted.length = 0;
  mockDeleteFailure = null;
  mockVacuum.mockClear();
  for (const time of [100, 200, 300]) mockFiles.set(old(time), 64);
});

describe('local safety snapshots', () => {
  it('keeps all existing copies when VACUUM fails after leaving a partial file', () => {
    mockVacuum.mockImplementationOnce((statement) => {
      mockFiles.set(`file://${statement.match(/INTO '([^']+)'/)![1]!}`, 16);
      throw new Error('synthetic disk full');
    });
    expect(() => snapshotDatabase('pre-restore')).toThrow('synthetic disk full');
    expect([...mockFiles.keys()].sort()).toEqual([old(100), old(200), old(300)]);
  });

  it('refuses a missing or empty new file before pruning anything', () => {
    for (const bytes of [null, 0]) {
      mockVacuum.mockImplementationOnce((statement) => {
        if (bytes != null) mockFiles.set(`file://${statement.match(/INTO '([^']+)'/)![1]!}`, bytes);
      });
      expect(() => snapshotDatabase('pre-restore')).toThrow();
      expect([...mockFiles.keys()].sort()).toEqual([old(100), old(200), old(300)]);
    }
  });

  it('prunes only after a nonempty snapshot exists, preserving the current copy after clock rollback', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(50);
    try {
      const snapshot = snapshotDatabase('pre-restore');
      expect(snapshot.size).toBe(128);
      expect(mockFiles.has(snapshot.uri)).toBe(true);
      expect(mockDeleted).toEqual([old(100)]);
      expect(mockFiles.has(old(200))).toBe(true);
      expect(mockFiles.has(old(300))).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('cannot collide when two snapshots share a millisecond and does not prune another kind', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(400);
    mockFiles.set(old(100, 'pre-migration'), 64);
    try {
      const first = snapshotDatabase('pre-restore');
      const second = snapshotDatabase('pre-restore');
      expect(first.uri).not.toBe(second.uri);
      expect(mockFiles.has(first.uri)).toBe(true);
      expect(mockFiles.has(second.uri)).toBe(true);
      expect(mockFiles.has(old(100, 'pre-migration'))).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not turn a completed safety copy into a failure when deleting an old copy fails', () => {
    mockDeleteFailure = old(100);
    expect(() => snapshotDatabase('pre-restore')).not.toThrow();
    expect(mockFiles.has(old(100))).toBe(true);
    expect(mockFiles.size).toBe(4);
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid retention %s without writing or deleting', (keep) => {
    expect(() => snapshotDatabase('pre-restore', keep)).toThrow();
    expect(mockVacuum).not.toHaveBeenCalled();
    expect(mockDeleted).toEqual([]);
  });
});
