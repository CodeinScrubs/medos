import { describe, expect, it } from '@jest/globals';

import {
  assertImportMediaPath,
  decodeCallSource,
  encodeCallSource,
  importMediaPath,
  type CallRecording,
} from './import-logic';

const id = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
const source: CallRecording = {
  uri: 'content://example/%3Aa.m4a',
  name: 'Example.m4a',
  sizeBytes: null,
  recordedAt: null,
  timeSource: 'unknown',
  who: null,
  key: 'Example.m4a',
};

describe('versioned private import metadata', () => {
  it('round trips exact escaped URI/date/provenance but keeps the operation id separate', () => {
    const captured = {
      ...source,
      recordedAt: new Date('2026-10-01T12:00:00Z'),
      timeSource: 'file' as const,
      importId: id,
    };
    expect(decodeCallSource(encodeCallSource(captured))).toMatchObject({
      ...source,
      recordedAt: captured.recordedAt,
      timeSource: 'file',
    });
    expect(encodeCallSource(captured)).not.toContain(id);
  });
  it.each([
    'not json',
    '{"version":99,"uri":"content://private-name"}',
    JSON.stringify({ ...JSON.parse(encodeCallSource(source)), sizeBytes: -1 }),
    JSON.stringify({ ...JSON.parse(encodeCallSource(source)), recordedAt: 1e100 }),
  ])('rejects unknown or corrupt metadata without repeating its contents', (body) => {
    expect(() => decodeCallSource(body)).toThrow('اطلاعات ورود فایل خوانده نشد؛ نسخهٔ اصلی حفظ شده است.');
  });
  it.each(['../outside.m4a', `media/${id}.m4a`, `media/imports/${id}.m4a/../other`, `media/imports/other.m4a`])(
    'refuses paths outside this operation (%s)',
    (path) => expect(() => assertImportMediaPath(id, path)).toThrow(),
  );
  it('allows only an owned UUID destination and a short safe extension', () => {
    expect(importMediaPath(id, 'm4a')).toBe(`media/imports/${id}.m4a`);
    expect(() => assertImportMediaPath(id, importMediaPath(id, 'wav'))).not.toThrow();
    expect(() => importMediaPath('invalid', 'wav')).toThrow();
    expect(() => importMediaPath(id, '../../other')).toThrow();
  });
});
