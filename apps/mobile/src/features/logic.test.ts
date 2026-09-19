import { describe, expect, it } from '@jest/globals';

import { doctorDisplayName, doctorSearchText, parseDoctorName } from './doctors/logic';
import { hospitalDay, isInpatient, statusAfterDischarge, statusForEncounterKind } from './encounters/logic';
import { defaultDueDate, parseReminderPayload, postponedDueDate, urgencyOf } from './followups/logic';
import { endAtForStatus, isRunning, orderSig, therapyDay } from './kardex/logic';
import { isHighlighted, notePreview } from './notes/logic';
import { patientSearchText } from './patients/logic';
import { dialDigits, extensionDialUri, mapsUri, parseCoordinates } from './places/logic';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe('kardex', () => {
  it('counts the start day as day 1 and freezes the count when stopped', () => {
    expect(therapyDay({ startAt: d(2024, 6, 1, 20), endAt: null }, d(2024, 6, 5, 8))).toBe(5);
    expect(therapyDay({ startAt: d(2024, 6, 1), endAt: d(2024, 6, 3) }, d(2024, 6, 20))).toBe(3);
    expect(therapyDay({ startAt: null, endAt: null })).toBeNull();
  });

  it('writes the sig the way a kardex line reads', () => {
    expect(
      orderSig({ dose: '1 g', route: 'IV', frequency: 'Q12H', rate: null, isPrn: false, prnCondition: null }),
    ).toBe('1 g IV Q12H');
    expect(
      orderSig({ dose: '1 g', route: 'PO', frequency: null, rate: null, isPrn: true, prnCondition: 'fever' }),
    ).toBe('1 g PO PRN (fever)');
  });

  it('stamps an end only for orders that stopped', () => {
    const now = d(2024, 6, 1);
    expect(endAtForStatus('discontinued', now)).toBe(now);
    expect(endAtForStatus('completed', now)).toBe(now);
    expect(endAtForStatus('active', now)).toBeNull();
    expect(endAtForStatus('held', now)).toBeNull();
    expect(isRunning({ status: 'held' })).toBe(true);
    expect(isRunning({ status: 'discontinued' })).toBe(false);
  });
});

describe('encounters', () => {
  it('counts hospital days from the admission day', () => {
    expect(hospitalDay(d(2024, 6, 1, 23, 30), d(2024, 6, 2, 8))).toBe(2);
    expect(hospitalDay(null)).toBeNull();
  });

  it('derives the patient status', () => {
    expect(statusForEncounterKind('admission')).toBe('admitted');
    expect(statusForEncounterKind('emergency')).toBe('admitted');
    expect(statusForEncounterKind('outpatient')).toBe('outpatient');
    expect(statusAfterDischarge('improved', 'followup')).toBe('followup');
    expect(statusAfterDischarge('death', 'followup')).toBe('deceased');
    expect(isInpatient('emergency')).toBe(true);
    expect(isInpatient('consult_only')).toBe(false);
  });
});

describe('follow-ups', () => {
  const now = d(2024, 6, 10, 15);

  it('postpones from today when already overdue, keeping the reminder time', () => {
    expect(postponedDueDate(d(2024, 6, 5, 10), 3, now)).toEqual(d(2024, 6, 13, 10));
    expect(postponedDueDate(d(2024, 6, 20, 9, 30), 2, now)).toEqual(d(2024, 6, 22, 9, 30));
  });

  it('classifies urgency by calendar day', () => {
    expect(urgencyOf({ status: 'pending', dueAt: d(2024, 6, 9, 23) }, now)).toBe('overdue');
    expect(urgencyOf({ status: 'pending', dueAt: d(2024, 6, 10, 8) }, now)).toBe('today');
    expect(urgencyOf({ status: 'pending', dueAt: d(2024, 6, 11) }, now)).toBe('upcoming');
    expect(urgencyOf({ status: 'done', dueAt: d(2024, 6, 1) }, now)).toBe('closed');
  });

  it('defaults to a week from today at 10:00', () => {
    expect(defaultDueDate(now)).toEqual(d(2024, 6, 17, 10));
  });

  it('only navigates on a well-formed reminder payload', () => {
    const payload = { kind: 'follow-up', patientId: 'p1', followUpId: 'f1' };
    expect(parseReminderPayload(payload)).toEqual(payload);
    expect(parseReminderPayload({ kind: 'follow-up', patientId: '' })).toBeNull();
    expect(parseReminderPayload(undefined)).toBeNull();
    expect(parseReminderPayload('p1')).toBeNull();
  });
});

describe('doctors', () => {
  it('peels a title off a typed name', () => {
    expect(parseDoctorName('دکتر علی احمدی')).toEqual({ title: 'دکتر', firstName: 'علی', lastName: 'احمدی' });
    expect(parseDoctorName('Dr. Sara Karimi')).toEqual({ title: 'Dr.', firstName: 'Sara', lastName: 'Karimi' });
    expect(parseDoctorName('احمدی')).toEqual({ title: null, firstName: '', lastName: 'احمدی' });
    // A lone title is a name, not something to discard.
    expect(parseDoctorName('دکتر')).toEqual({ title: null, firstName: '', lastName: 'دکتر' });
  });

  it('indexes specialty words and the normalised phone', () => {
    const text = doctorSearchText({ firstName: 'علی', lastName: 'احمدی', phone: '+98 912 000 0002' }, [
      'عفونی',
      'Infectious disease',
    ]);
    expect(text).toContain('09120000002');
    expect(text).toContain('عفونی');
    expect(text).toContain('infectious disease');
    expect(doctorDisplayName({ title: 'دکتر', firstName: 'علی', lastName: 'احمدی' })).toBe('دکتر علی احمدی');
  });
});

describe('patients', () => {
  it('indexes the phone in its normalised form', () => {
    expect(patientSearchText({ firstName: 'مریم', lastName: 'کریمی', phone: '0912 000 0001' })).toBe(
      'مریم کریمی 09120000001',
    );
  });
});

describe('places', () => {
  it('dials a direct line, or the switchboard then the extension', () => {
    expect(extensionDialUri({ directLine: '021-0000-1111', extension: '5' }, { switchboard: null })).toBe(
      'tel:02100001111',
    );
    expect(extensionDialUri({ directLine: null, extension: '۲۳۴۵' }, { switchboard: '021 0000 2222' })).toBe(
      'tel:02100002222,,2345',
    );
    expect(extensionDialUri({ directLine: null, extension: '2345' }, { switchboard: null })).toBeNull();
    expect(dialDigits('۲۳-۴۵#')).toBe('2345#');
  });

  it('builds a maps link from what is known', () => {
    expect(mapsUri({ name: 'X', mapUrl: 'https://maps.example/x', lat: '1', lng: '2', address: null })).toBe(
      'https://maps.example/x',
    );
    expect(mapsUri({ name: 'Clinic', mapUrl: null, lat: '35.7', lng: '51.4', address: null })).toBe(
      'geo:35.7,51.4?q=35.7,51.4(Clinic)',
    );
    expect(mapsUri({ name: 'X', mapUrl: null, lat: null, lng: null, address: null })).toBeNull();
  });

  it('pulls coordinates out of pasted text, and rejects impossible ones', () => {
    expect(parseCoordinates('https://maps.example/?q=35.6997,51.3380')).toEqual({ lat: '35.6997', lng: '51.3380' });
    expect(parseCoordinates('۳۵٫۷۰, ۵۱٫۴۰')).toEqual({ lat: '35.70', lng: '51.40' });
    expect(parseCoordinates('95.1, 51.4')).toBeNull();
    expect(parseCoordinates('no numbers')).toBeNull();
  });
});

describe('notes', () => {
  it('previews whichever body has content', () => {
    expect(notePreview({ body: 'free text', subjective: 's', objective: null, assessment: null, plan: null })).toBe(
      'free text',
    );
    expect(notePreview({ body: null, subjective: 'fever', objective: null, assessment: 'UTI', plan: null })).toBe(
      'fever — UTI',
    );
  });

  it('highlights events and pinned notes', () => {
    expect(isHighlighted({ type: 'event', isPinned: false })).toBe(true);
    expect(isHighlighted({ type: 'progress', isPinned: true })).toBe(true);
    expect(isHighlighted({ type: 'progress', isPinned: false })).toBe(false);
  });
});
