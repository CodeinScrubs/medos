import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { fromBase64, toBase64 } from '@/lib/crypto';

import { writeImageExport } from './image-export';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
const mockFiles = new Map<string, Uint8Array>();
let mockFailure: 'none' | 'missing' | 'truncated' | 'altered';
jest.mock('@/lib/ids', () => ({ newId: () => 'synthetic-export' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? null;
    }
    write(bytes: Uint8Array) {
      if (mockFailure === 'missing') return;
      const result = bytes.slice(0, mockFailure === 'truncated' ? 1 : undefined);
      if (mockFailure === 'altered') result[40] = result[40]! ^ 1;
      mockFiles.set(this.uri, result);
    }
    bytesSync() {
      return mockFiles.get(this.uri)!;
    }
  },
}));
beforeEach(() => {
  mockFiles.clear();
  mockFailure = 'none';
});
describe('complete, verified PNG share derivative', () => {
  it('writes exact encoder bytes to cache only', () => {
    const uri = writeImageExport(png, 1, 1);
    expect(uri).toBe('file:///cache/medos-image-synthetic-export.png');
    expect(mockFiles.get(uri)).toEqual(fromBase64(png));
  });
  it('refuses a header-only/truncated response and mismatched output dimensions', () => {
    expect(() => writeImageExport(toBase64(fromBase64(png).slice(0, 33)), 1, 1)).toThrow('ناقص');
    expect(() => writeImageExport(toBase64(fromBase64(png).slice(0, -1)), 1, 1)).toThrow('ناقص');
    expect(() => writeImageExport(png, 2, 1)).toThrow('ابعاد');
    expect(mockFiles.size).toBe(0);
  });
  it.each(['missing', 'truncated', 'altered'] as const)('rejects a %s cache write', (failure) => {
    mockFailure = failure;
    expect(() => writeImageExport(png, 1, 1)).toThrow();
  });
});
