import { describe, expect, it, jest } from '@jest/globals';

import { checkBackupCopy, type CopyFile } from './copy-check';

function file(bytes: number[], size: number | null = bytes.length) {
  const close = jest.fn();
  return {
    size,
    close,
    open() {
      let offset = 0;
      return {
        close,
        readBytes: (length: number) => {
          const result = Uint8Array.from(bytes.slice(offset, offset + length));
          offset += result.length;
          return result;
        },
      };
    },
  };
}

describe('backup copy verification and retention', () => {
  const bytes = [1, 2, 3, 4];
  it('prunes only after exact bytes and EOF match; both handles close', () => {
    const source = file(bytes);
    const destination = file(bytes);
    const prune = jest.fn();
    expect(checkBackupCopy(source, () => destination, prune)).toBe('bytes');
    expect(prune).toHaveBeenCalledTimes(1);
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(destination.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', () => undefined],
    [
      'listing throws',
      () => {
        throw new Error('provider offline');
      },
    ],
    [
      'metadata throws',
      () => ({
        ...file(bytes),
        get size(): number {
          throw new Error('metadata');
        },
      }),
    ],
    ['wrong reported size', () => file(bytes, 3)],
    ['short despite matching size', () => file([1, 2, 3], 4)],
    ['changed same-size bytes', () => file([1, 2, 9, 4])],
    ['extra bytes', () => file([...bytes, 5], 4)],
    [
      'unknown size, unreadable',
      () => ({
        size: null,
        open() {
          throw new Error('no handle');
        },
      }),
    ],
    [
      'read interrupted',
      () => ({
        size: 4,
        open: () => ({
          readBytes() {
            throw new Error('disconnected');
          },
          close() {},
        }),
      }),
    ],
  ] as [string, () => CopyFile | undefined][])('retains old backups when %s', (_name, find) => {
    const prune = jest.fn();
    expect(checkBackupCopy(file(bytes), find, prune)).toBe('failed');
    expect(prune).not.toHaveBeenCalled();
  });

  it('keeps a size-only copy without pruning when the provider cannot open it', () => {
    const source = file(bytes);
    const prune = jest.fn();
    const destination = {
      size: 4,
      open() {
        throw new Error('no handle');
      },
    };
    expect(checkBackupCopy(source, () => destination, prune)).toBe('size');
    expect(prune).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it('can prove bytes even when destination length is unknown', () => {
    const prune = jest.fn();
    expect(checkBackupCopy(file(bytes), () => file(bytes, null), prune)).toBe('bytes');
    expect(prune).toHaveBeenCalledTimes(1);
  });

  it.each([null, 0, -1, NaN, Infinity, 1.5])('rejects unusable source length %s', (size) => {
    const prune = jest.fn();
    expect(checkBackupCopy(file(bytes, size), () => file(bytes), prune)).toBe('failed');
    expect(prune).not.toHaveBeenCalled();
  });

  it('does not downgrade a source-open failure to size verification', () => {
    const prune = jest.fn();
    expect(
      checkBackupCopy(
        {
          size: 4,
          open() {
            throw new Error('source lost');
          },
        },
        () => file(bytes),
        prune,
      ),
    ).toBe('failed');
    expect(prune).not.toHaveBeenCalled();
  });

  it('closes the other reader even if closing the first throws', () => {
    const source = file(bytes);
    source.close.mockImplementation(() => {
      throw new Error('close failed');
    });
    const destination = file(bytes);
    expect(
      checkBackupCopy(
        source,
        () => destination,
        () => {},
      ),
    ).toBe('bytes');
    expect(destination.close).toHaveBeenCalledTimes(1);
  });

  it('retention failure does not reclassify an already verified copy as failed', () => {
    expect(
      checkBackupCopy(
        file(bytes),
        () => file(bytes),
        () => {
          throw new Error('cannot delete');
        },
      ),
    ).toBe('bytes');
  });
});
