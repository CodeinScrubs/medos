import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  MediaRestoreError,
  placeRestoredMedia,
  putBackDisplacedMedia,
  type MediaFileSystem,
  type MediaPaths,
} from './media-swap';

/*
 * The file system as a map, so the failure that matters can actually be
 * provoked: a move that throws with the file it was replacing already put
 * aside. On the phone that is a permission, a full disk or a provider that
 * went away mid-restore.
 */
class FakeFs implements MediaFileSystem {
  files = new Map<string, string>();
  failMoveTo = new Set<string>();
  failMoveFrom = new Set<string>();

  exists(path: string): boolean {
    return this.files.has(path);
  }

  ensureParent(): void {
    // Folders are implicit in a map.
  }

  move(from: string, to: string, options?: { overwrite?: boolean }): void {
    if (this.failMoveFrom.has(from) || this.failMoveTo.has(to)) throw new Error(`refused: ${from} -> ${to}`);
    const content = this.files.get(from);
    if (content === undefined) throw new Error(`missing: ${from}`);
    if (this.files.has(to) && !options?.overwrite) throw new Error(`exists: ${to}`);
    this.files.set(to, content);
    this.files.delete(from);
  }
}

const paths: MediaPaths = {
  target: (path) => `/doc/${path}`,
  displaced: (path) => `/kept/${path}`,
};

const staged = [
  { stagedPath: '/work/a.jpg', path: 'a.jpg' },
  { stagedPath: '/work/b.jpg', path: 'b.jpg' },
];

let fs: FakeFs;

beforeEach(() => {
  fs = new FakeFs();
  fs.files.set('/work/a.jpg', 'new-a');
  fs.files.set('/work/b.jpg', 'new-b');
  // Only a.jpg is already on the phone; b.jpg is new to it.
  fs.files.set('/doc/a.jpg', 'old-a');
});

describe('placing a backup’s media', () => {
  it('puts the new files in place and keeps what they replaced', () => {
    const displaced = placeRestoredMedia(fs, paths, staged);

    expect(fs.files.get('/doc/a.jpg')).toBe('new-a');
    expect(fs.files.get('/doc/b.jpg')).toBe('new-b');
    expect(fs.files.get('/kept/a.jpg')).toBe('old-a');
    expect(displaced).toEqual([{ savedPath: '/kept/a.jpg', path: 'a.jpg' }]);
  });

  // The bug this replaces: the file being replaced was put in the scratch
  // folder, and the scratch folder is deleted on the way out of a failed
  // restore. A move that threw here took the original with it.
  it('puts the originals back when a later file cannot be moved into place', () => {
    fs.failMoveTo.add('/doc/b.jpg');

    expect(() => placeRestoredMedia(fs, paths, staged)).toThrow(MediaRestoreError);

    expect(fs.files.get('/doc/a.jpg')).toBe('old-a');
    expect(fs.files.has('/kept/a.jpg')).toBe(false);
  });

  it('keeps a file it could not put back, and names it', () => {
    fs.failMoveTo.add('/doc/b.jpg');
    fs.failMoveFrom.add('/kept/a.jpg');

    let error: MediaRestoreError | null = null;
    try {
      placeRestoredMedia(fs, paths, staged);
    } catch (e) {
      error = e as MediaRestoreError;
    }

    expect(error?.notPutBack).toEqual([{ savedPath: '/kept/a.jpg', path: 'a.jpg' }]);
    // Nowhere else does this file exist: the caller must not delete the folder.
    expect(fs.files.get('/kept/a.jpg')).toBe('old-a');
  });
});

describe('rolling back after a failed database import', () => {
  it('returns every displaced file to where the database expects it', () => {
    const displaced = placeRestoredMedia(fs, paths, staged);
    expect(putBackDisplacedMedia(fs, paths, displaced)).toEqual([]);
    expect(fs.files.get('/doc/a.jpg')).toBe('old-a');
  });

  it('reports the ones it could not return instead of swallowing them', () => {
    const displaced = placeRestoredMedia(fs, paths, staged);
    fs.failMoveFrom.add('/kept/a.jpg');
    expect(putBackDisplacedMedia(fs, paths, displaced)).toHaveLength(1);
    expect(fs.files.get('/kept/a.jpg')).toBe('old-a');
  });
});
