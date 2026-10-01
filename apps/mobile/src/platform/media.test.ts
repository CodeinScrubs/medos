import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { storeFile } from './media';

const mockBytes = new Map<string, Uint8Array>();
let mockTruncate = false;
let mockMissingCopy = false;
let mockUnknownSourceSize = false;
let mockSequence = 0;
jest.mock('@/lib/ids', () => ({ newId: () => `synthetic-${++mockSequence}` }));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {
    exists = true;
    create() {}
  },
  File: class {
    uri: string;
    constructor(...segments: string[]) {
      this.uri = segments.join('/');
    }
    get exists() {
      return mockBytes.has(this.uri);
    }
    get size() {
      if (mockUnknownSourceSize && this.uri === 'file:///cache/rec.m4a') return null;
      return mockBytes.get(this.uri)?.length ?? null;
    }
    async copy(destination: { uri: string }) {
      const bytes = mockBytes.get(this.uri);
      if (!bytes) throw new Error('Synthetic unavailable source');
      if (!mockMissingCopy) mockBytes.set(destination.uri, bytes.slice(0, mockTruncate ? 1 : undefined));
    }
    async move(destination: { uri: string }) {
      await this.copy(destination);
      mockBytes.delete(this.uri);
    }
  },
}));

const source = 'file:///cache/rec.m4a';
beforeEach(() => {
  mockBytes.clear();
  mockBytes.set(source, new Uint8Array([1, 2, 3]));
  mockTruncate = false;
  mockMissingCopy = false;
  mockUnknownSourceSize = false;
  mockSequence = 0;
});

describe('verified stopped-recording copy', () => {
  it('acknowledges a complete copy without moving the cache source', async () => {
    const stored = await storeFile(source, 'm4a', { verifySize: true });
    expect(stored.sizeBytes).toBe(3);
    expect(mockBytes.get(`file:///documents/${stored.relativePath}`)).toEqual(mockBytes.get(source));
    expect(mockBytes.has(source)).toBe(true);
  });

  it('rejects a positive but truncated destination and retains the source for retry', async () => {
    mockTruncate = true;
    await expect(storeFile(source, 'm4a', { verifySize: true })).rejects.toThrow();
    expect(mockBytes.get(source)?.length).toBe(3);
    mockTruncate = false;
    await expect(storeFile(source, 'm4a', { verifySize: true })).resolves.toMatchObject({ sizeBytes: 3 });
  });

  it('rejects a missing destination after a nominally successful native copy', async () => {
    mockMissingCopy = true;
    await expect(storeFile(source, 'm4a', { verifySize: true })).rejects.toThrow();
    expect(mockBytes.has(source)).toBe(true);
  });

  it('refuses unknown, missing or empty source length before copying', async () => {
    mockUnknownSourceSize = true;
    await expect(storeFile(source, 'm4a', { verifySize: true })).rejects.toThrow();
    expect(mockBytes.size).toBe(1);
    mockUnknownSourceSize = false;
    mockBytes.set(source, new Uint8Array());
    await expect(storeFile(source, 'm4a', { verifySize: true })).rejects.toThrow();
    mockBytes.delete(source);
    await expect(storeFile(source, 'm4a', { verifySize: true })).rejects.toThrow();
  });
});
