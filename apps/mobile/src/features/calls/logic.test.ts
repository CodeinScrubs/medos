import { describe, expect, it } from '@jest/globals';

import { isRecordingFile, parseRecordingName, recordingKey, recordingMimeType, unfiledRecentCount } from './logic';

const MODIFIED = new Date(2026, 8, 30, 9, 0, 0);

describe('call recording names', () => {
  it('reads who and when from a Samsung dialer recording', () => {
    expect(parseRecordingName('Call recording Test Contact_260926_143012.m4a', MODIFIED)).toEqual({
      who: 'Test Contact',
      recordedAt: new Date(2026, 8, 26, 14, 30, 12),
    });
  });

  it('never reads the digits of a phone number as the date', () => {
    expect(parseRecordingName('Call recording 09120000001_260926_081500.m4a', MODIFIED)).toEqual({
      who: '09120000001',
      recordedAt: new Date(2026, 8, 26, 8, 15, 0),
    });
  });

  it('takes other recorders’ stamps, and falls back to the file time when there is none', () => {
    expect(parseRecordingName('CallRecording_2026-09-26_14-30-12_Clinic.mp3', MODIFIED).recordedAt).toEqual(
      new Date(2026, 8, 26, 14, 30, 12),
    );
    expect(parseRecordingName('20260926_1430 ward.amr', MODIFIED).recordedAt).toEqual(new Date(2026, 8, 26, 14, 30));
    expect(parseRecordingName('Call@Test Contact(09120000001)_20260926143012.amr', MODIFIED)).toEqual({
      who: 'Test Contact(09120000001)',
      recordedAt: new Date(2026, 8, 26, 14, 30, 12),
    });
    expect(parseRecordingName('Voice 001.m4a', MODIFIED)).toEqual({ who: 'Voice 001', recordedAt: MODIFIED });
  });

  it('does not accept a date that does not exist', () => {
    expect(parseRecordingName('Call recording X_260931_101010.m4a', MODIFIED).recordedAt).toBe(MODIFIED);
  });

  it('keeps no name when the file only has a time', () => {
    expect(parseRecordingName('Call recording_260926_143012.m4a', MODIFIED).who).toBeNull();
  });
});

describe('call recording files', () => {
  it('lists audio only, and knows its type', () => {
    expect(isRecordingFile('a.m4a')).toBe(true);
    expect(isRecordingFile('a.AMR')).toBe(true);
    expect(isRecordingFile('notes.txt')).toBe(false);
    expect(isRecordingFile('.nomedia')).toBe(false);
    expect(recordingMimeType('a.m4a')).toBe('audio/mp4');
    expect(recordingMimeType('a.xyz')).toBeNull();
  });

  it('counts the last two days’ recordings that are not in a record yet', () => {
    const now = new Date(2026, 8, 26, 18, 0, 0);
    const names = [
      'Call recording A_260926_143012.m4a', // today, not filed
      'Call recording B_260926_090000.m4a', // today, filed
      'Call recording C_260925_100000.m4a', // yesterday, not filed
      'Call recording D_260920_100000.m4a', // last week
      'Voice 001.m4a', // no time in the name
      'notes.txt',
    ];
    expect(unfiledRecentCount(names, new Set([recordingKey(names[1]!)]), now)).toBe(2);
  });
});
