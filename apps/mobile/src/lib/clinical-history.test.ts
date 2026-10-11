import { describe, expect, it } from '@jest/globals';

import {
  clinicalSnapshot,
  clinicalSnapshotContent,
  decodeClinicalSnapshot,
  encodeClinicalSnapshot,
} from './clinical-history';

describe('permanent clinical document codec', () => {
  it('keeps exact whitespace, null/empty/zero/false and date precision through roundtrip', () => {
    const at = new Date('2026-10-11T10:11:12.345Z');
    const snapshot = clinicalSnapshot('patient', {
      id: 'p',
      allergies: '  Penicillin\n',
      summary: '',
      phone: null,
      ageYears: 0,
      starred: false,
      createdAt: at,
    });
    expect(decodeClinicalSnapshot(encodeClinicalSnapshot(snapshot))).toEqual(snapshot);
    expect(snapshot.record.fields).toMatchObject({
      allergies: '  Penicillin\n',
      summary: '',
      phone: null,
      ageYears: 0,
      starred: false,
      createdAt: at.getTime(),
    });
    expect(snapshot.record.dates).toEqual(['createdAt']);
  });
  it('retains bounded lab value text and unknown units without inferring numbers', () => {
    const snapshot = clinicalSnapshot('lab', { id: 'l' }, [
      { id: 'v', value: '<5', valueNum: 5, unit: null, refLow: 3, refHigh: 100 },
    ]);
    expect(decodeClinicalSnapshot(encodeClinicalSnapshot(snapshot))?.values?.[0]?.fields).toEqual({
      id: 'v',
      value: '<5',
      valueNum: 5,
      unit: null,
      refLow: 3,
      refHigh: 100,
    });
  });
  it.each([
    '{"version":2}',
    '{bad',
    '{"version":1,"kind":"patient","record":{"fields":{"id":"p","when":null},"dates":["when"]}}',
    '{"version":1,"kind":"patient","record":{"fields":{"id":"p","when":8640000000000001},"dates":["when"]}}',
    '{"version":1,"kind":"patient","record":{"fields":{"id":"p","when":1760000000000.5},"dates":["when"]}}',
  ])('leaves unsupported documents unreadable instead of repairing them: %s', (body) => {
    expect(decodeClinicalSnapshot(body)).toBeNull();
  });
  it('refuses a valid document belonging to another record, kind or patient, including lab children', () => {
    const owner = { kind: 'lab', recordId: 'panel-A', patientId: 'A' };
    const correct = clinicalSnapshot('lab', { id: 'panel-A', patientId: 'A' }, [
      { id: 'v', panelId: 'panel-A', patientId: 'A', value: '10' },
    ]);
    expect(decodeClinicalSnapshot(encodeClinicalSnapshot(correct), owner)).toEqual(correct);
    expect(decodeClinicalSnapshot(encodeClinicalSnapshot({ ...correct, kind: 'patient' }), owner)).toBeNull();
    expect(
      decodeClinicalSnapshot(encodeClinicalSnapshot(clinicalSnapshot('lab', { id: 'panel-B', patientId: 'B' })), owner),
    ).toBeNull();
    expect(
      decodeClinicalSnapshot(
        encodeClinicalSnapshot(
          clinicalSnapshot('lab', { id: 'panel-A', patientId: 'A' }, [{ id: 'v', panelId: 'panel-A', patientId: 'B' }]),
        ),
        owner,
      ),
    ).toBeNull();
  });
  it('rejects non-finite dates and numbers rather than saving their null JSON substitute', () => {
    expect(() => clinicalSnapshot('vital', { id: 'v', temperature: Number.NaN })).toThrow();
    expect(() => clinicalSnapshot('encounter', { id: 'e', admittedAt: new Date('invalid') })).toThrow();
  });
  it('does not version reminder receipts, raw typing or search/touch metadata as clinical changes', () => {
    const old = clinicalSnapshot('consult', {
      id: 'c',
      response: 'answer',
      draftResponse: 'a',
      draftRevision: 1,
      searchText: 'a',
      updatedAt: new Date(1),
    });
    const next = clinicalSnapshot('consult', {
      id: 'c',
      response: 'answer',
      draftResponse: 'abcdef',
      draftRevision: 2,
      searchText: 'b',
      updatedAt: new Date(2),
    });
    expect(clinicalSnapshotContent(old)).toBe(clinicalSnapshotContent(next));
    expect(old.record.fields).not.toHaveProperty('draftResponse');
    expect(clinicalSnapshotContent(clinicalSnapshot('consult', { id: 'c', response: 'other' }))).not.toBe(
      clinicalSnapshotContent(old),
    );
  });
  it('distinguishes an absent field, an empty value and a clear', () => {
    const absent = clinicalSnapshot('patient', { id: 'p' });
    const empty = clinicalSnapshot('patient', { id: 'p', allergies: '' });
    const cleared = clinicalSnapshot('patient', { id: 'p', allergies: null });
    expect(new Set([absent, empty, cleared].map(clinicalSnapshotContent)).size).toBe(3);
  });
});
