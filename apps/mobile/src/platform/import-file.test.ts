import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { copyImportFile, fingerprintImportFile } from './import-file';

let mockBytes = new Uint8Array([1, 2, 3]);
let mockOffset = 0;
let mockReadLimit = 64 * 1024;
let mockReportedSize: number | null = null;
let mockExists = false;
const mockRead = jest.fn((length: number) => {
  const part = mockBytes.slice(mockOffset, mockOffset + Math.min(length, mockReadLimit));
  mockOffset += part.length;
  return part;
});
const mockClose = jest.fn();
const mockOpen = jest.fn((_mode: string) => ({ readBytes: mockRead, close: mockClose }));
const mockDelete = jest.fn(() => {
  mockExists = false;
});
const mockCopy = jest.fn(async (_dest: unknown) => {
  mockExists = true;
});
const mockLegacyCopy = jest.fn(async (_input: unknown) => {
  mockExists = true;
});
const mockCreate = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///private/' },
  FileMode: { ReadOnly: 'r' },
  File: class {
    copy = mockCopy;
  },
  Directory: class {
    exists = false;
    create = mockCreate;
  },
}));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: (input: unknown) => mockLegacyCopy(input) }));
jest.mock('./media', () => ({
  mediaFile: () => ({
    uri: 'file:///private/media/imports/request.m4a',
    get exists() {
      return mockExists;
    },
    get size() {
      return mockReportedSize;
    },
    open: mockOpen,
    delete: mockDelete,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockBytes = new Uint8Array([1, 2, 3]);
  mockOffset = 0;
  mockReadLimit = 64 * 1024;
  mockReportedSize = null;
  mockExists = false;
});

describe('streamed import integrity', () => {
  it('accepts readable nonempty bytes when the provider reported no usable size', async () => {
    expect((await copyImportFile('content://example/audio', 'media/imports/request.m4a', 0)).sizeBytes).toBe(3);
  });
  it('matches independent Node SHA-256 through short reads, bounded chunks and explicit EOF', async () => {
    mockBytes = new Uint8Array(2 * 1024 * 1024 + 123).map((_, i) => i % 251);
    mockReadLimit = 17011;
    mockReportedSize = mockBytes.length;
    const expected = createHash('sha256').update(mockBytes).digest('hex');
    expect(await fingerprintImportFile('media/imports/request.m4a')).toEqual({
      checksum: expected,
      sizeBytes: mockBytes.length,
    });
    expect(mockRead.mock.calls.every(([length]) => length === 64 * 1024)).toBe(true);
    expect(mockRead.mock.results.at(-1)!.value).toHaveLength(0);
    expect(mockOpen).toHaveBeenCalledWith('r');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it.each(['empty', 'short', 'read failure', 'close failure'])(
    'rejects %s without leaking private paths and closes its handle',
    async (mode) => {
      if (mode === 'empty') mockBytes = new Uint8Array();
      if (mode === 'short') mockReportedSize = 4;
      if (mode === 'read failure')
        mockRead.mockImplementationOnce(() => {
          throw new Error('content://patient/private-name');
        });
      if (mode === 'close failure')
        mockClose.mockImplementationOnce(() => {
          throw new Error('file:///private-name');
        });
      await expect(fingerprintImportFile('media/imports/request.m4a')).rejects.toThrow('فایل کامل خوانده نشد');
      expect(mockClose).toHaveBeenCalledTimes(1);
    },
  );

  it('copies using the original escaped content URI on native fallback and drops only the partial destination', async () => {
    mockCopy.mockImplementationOnce(async () => {
      mockExists = true;
      throw new Error('Source must be a file');
    });
    const uri = 'content://example/document/primary%3ARecordings%2Fvoice.m4a';
    const result = await copyImportFile(uri, 'media/imports/request.m4a', 3);
    expect(mockLegacyCopy).toHaveBeenCalledWith({ from: uri, to: 'file:///private/media/imports/request.m4a' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(result.sizeBytes).toBe(3);
    expect(mockCreate).toHaveBeenCalledWith({ intermediates: true });
  });

  it('rejects a mismatched expected size, retaining the owned copy for recovery', async () => {
    await expect(copyImportFile('file:///source.m4a', 'media/imports/request.m4a', 4)).rejects.toThrow('اندازهٔ فایل');
    expect(mockExists).toBe(true);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not move or delete the source when both native copy routes fail', async () => {
    mockCopy.mockRejectedValueOnce(new Error('content://private-name'));
    mockLegacyCopy.mockRejectedValueOnce(new Error('content://private-name'));
    await expect(copyImportFile('content://private-name', 'media/imports/request.m4a', null)).rejects.toThrow(
      'فایل کپی نشد؛ فایل اصلی حفظ شده است.',
    );
    expect(mockRead).not.toHaveBeenCalled();
  });
});
