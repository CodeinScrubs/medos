import { describe, expect, it, jest } from '@jest/globals';

import { describeShared, pickRecordingFile } from './folder';

const mockFiles = new Map<string, { name: string; size: number | null }>();
const mockPickedUri = 'content://com.android.providers.downloads.documents/document/msf%3A17';
const mockPickDocument =
  jest.fn<
    (
      options: import('expo-document-picker').DocumentPickerOptions,
    ) => Promise<import('expo-document-picker').DocumentPickerResult>
  >();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (options: import('expo-document-picker').DocumentPickerOptions) => mockPickDocument(options),
}));
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    uri: string;
    name: string;
    size: number | null;
    constructor(uri: string) {
      const known = mockFiles.get(uri);
      if (!known) throw new Error('no such file');
      this.uri = uri;
      this.name = known.name;
      this.size = known.size;
    }
    info() {
      return { modificationTime: null };
    }
  },
}));

describe('picked provider audio metadata', () => {
  it('uses the original display name instead of a Downloads document id', async () => {
    mockFiles.set(mockPickedUri, { name: 'msf:17', size: 60_000 });
    mockPickDocument.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: mockPickedUri, name: 'Call@Test Contact_20260926193012.amr', size: 60_000, lastModified: Date.now() },
      ],
    });
    expect(await pickRecordingFile()).toMatchObject({
      uri: mockPickedUri,
      name: 'Call@Test Contact_20260926193012.amr',
      key: 'Call@Test Contact_20260926193012.amr',
      who: 'Test Contact',
      recordedAt: new Date(2026, 8, 26, 19, 30, 12),
      timeSource: 'filename',
      sizeBytes: 60_000,
    });
    expect(mockPickDocument).toHaveBeenLastCalledWith({
      type: 'audio/*',
      multiple: false,
      copyToCacheDirectory: false,
    });
  });
  it('does not treat the picker fallback clock as the actual file or call time', async () => {
    mockFiles.set(mockPickedUri, { name: 'msf:17', size: 0 });
    mockPickDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: mockPickedUri, name: 'voice.wav', size: 0, lastModified: Date.now() }],
    });
    expect(await pickRecordingFile()).toMatchObject({
      name: 'voice.wav',
      recordedAt: null,
      timeSource: 'unknown',
      sizeBytes: null,
    });
  });
  it('does not create a source when selection is cancelled', async () => {
    mockPickDocument.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickRecordingFile()).toBeNull();
  });
});

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
