import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { copyPhotoImportFile, renderPhotoDerivative, storeFile } from './media';

const mockBytes = new Map<string, Uint8Array>();
let mockTruncate = false;
let mockMissingCopy = false;
let mockUnknownSourceSize = false;
let mockSequence = 0;
let mockRenderFailure = false;
let mockAlteredCopy = false;
const mockContextRelease = jest.fn();
const mockImageRelease = jest.fn();
jest.mock('@/lib/ids', () => ({ newId: () => `synthetic-${++mockSequence}` }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize() {},
      release: mockContextRelease,
      async renderAsync() {
        if (mockRenderFailure) throw new Error('Synthetic render rejection');
        return {
          release: mockImageRelease,
          async saveAsync() {
            const uri = `file:///cache/photo-${++mockSequence}.jpg`;
            mockBytes.set(uri, new Uint8Array([7, 8, 9, 10]));
            return { uri, width: 640, height: 480 };
          },
        };
      },
    }),
  },
}));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  FileMode: { ReadOnly: 'read' },
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
    open() {
      const bytes = mockBytes.get(this.uri);
      if (!bytes) throw new Error('Synthetic unavailable file');
      let offset = 0;
      return {
        readBytes(length: number) {
          const chunk = bytes.slice(offset, offset + length);
          offset += chunk.length;
          return chunk;
        },
        close() {},
      };
    }
    async copy(destination: { uri: string }) {
      const bytes = mockBytes.get(this.uri);
      if (!bytes) throw new Error('Synthetic unavailable source');
      if (!mockMissingCopy)
        mockBytes.set(
          destination.uri,
          mockAlteredCopy ? new Uint8Array(bytes.length).fill(99) : bytes.slice(0, mockTruncate ? 1 : undefined),
        );
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
  mockRenderFailure = false;
  mockAlteredCopy = false;
  mockContextRelease.mockClear();
  mockImageRelease.mockClear();
});

describe('journal-owned photo files and native derivatives', () => {
  it('releases both native contexts after producing a working copy and thumbnail', async () => {
    const asset = { uri: source, width: 640, height: 480 };
    const full = await renderPhotoDerivative(asset, false);
    const thumb = await renderPhotoDerivative(asset, true);
    expect(full.uri).not.toBe(thumb.uri);
    expect(mockBytes.get(source)).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockContextRelease).toHaveBeenCalledTimes(2);
    expect(mockImageRelease).toHaveBeenCalledTimes(2);
  });
  it('copies into a reserved path and refuses overwriting an existing destination', async () => {
    const path =
      'media/imports/photo-00000000-0000-4000-8000-000000000001-0-source-00000000-0000-4000-8000-000000000002.png';
    await copyPhotoImportFile(source, path);
    expect(mockBytes.get(`file:///documents/${path}`)).toEqual(mockBytes.get(source));
    await expect(copyPhotoImportFile(source, path)).rejects.toThrow('قبلاً');
    expect(mockBytes.has(source)).toBe(true);
  });
  it('releases the native manipulation context even when renderAsync rejects', async () => {
    mockRenderFailure = true;
    await expect(renderPhotoDerivative({ uri: source, width: 640, height: 480 }, false)).rejects.toThrow();
    expect(mockContextRelease).toHaveBeenCalledTimes(1);
    expect(mockImageRelease).not.toHaveBeenCalled();
    expect(mockBytes.has(source)).toBe(true);
  });
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
