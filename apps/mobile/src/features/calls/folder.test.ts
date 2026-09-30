import { describe, expect, it, jest } from '@jest/globals';

import { describeShared } from './folder';

const mockFiles = new Map<string, { name: string; size: number | null }>();
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    name: string;
    size: number | null;
    constructor(uri: string) {
      const known = mockFiles.get(uri);
      if (!known) throw new Error('no such file');
      this.name = known.name;
      this.size = known.size;
    }
  },
}));

describe('a recording shared to MedOS', () => {
  it('keeps an unreadable zero-size provider hint unknown instead of requiring a zero-byte copy', () => {
    mockFiles.set('content://recorder/zero', { name: 'Example.m4a', size: 0 });
    expect(describeShared('content://recorder/zero', undefined).sizeBytes).toBeNull();
  });
  it('takes who and when from the name the sharing app gave', () => {
    mockFiles.set('content://recorder/1', { name: '1', size: 60_000 });
    expect(describeShared('content://recorder/1', 'Call@Test Contact_20260926193012.amr')).toMatchObject({
      uri: 'content://recorder/1',
      name: 'Call@Test Contact_20260926193012.amr',
      sizeBytes: 60_000,
      who: 'Test Contact',
      recordedAt: new Date(2026, 8, 26, 19, 30, 12),
      timeSource: 'filename',
    });
  });

  it('keeps unknown call time unknown and survives an unreadable file', () => {
    const shared = describeShared('content://recorder/missing', 'voice message.ogg');
    expect(shared.recordedAt).toBeNull();
    expect(shared.timeSource).toBe('unknown');
    expect(shared.sizeBytes).toBeNull();
    expect(shared.name).toBe('voice message.ogg');
  });
});
