import { describe, expect, it } from '@jest/globals';

import { buildPatientDossier, type DossierData } from './dossier';

describe('buildPatientDossier', () => {
  const sampleData: DossierData = {
    patient: {
      id: 'pt-101',
      firstName: 'Sara',
      lastName: 'Mahmoudi',
      sex: 'female',
      birthYear: 1400,
      nationalId: '1234567890',
      phone: '09171234567',
      city: 'Shiraz',
      address: 'Zand Street',
      bloodType: 'O+',
      allergies: 'Penicillin (Anaphylaxis)',
      pastMedicalHistory: 'Asthma since childhood',
      drugHistory: 'Salbutamol inhaler PRN',
      habitualHistory: 'Non-smoker',
      familyHistory: 'Hypertension in mother',
    },
    activeEncounter: {
      kind: 'inpatient',
      admittedAt: new Date('2026-09-30T08:00:00Z'),
      hospitalName: 'Namazi Hospital',
      ward: 'Surgery',
      bed: '1',
      attendingName: 'Dr. Rasaei',
      chiefComplaint: 'Acute Abdominal Pain',
    },
    diagnoses: [
      { title: 'Hemorrhagic Ovarian Cyst', status: 'active', notes: 'Status post laparotomy' },
      { title: 'Appendicitis', status: 'ruled_out', notes: 'Normal appendix on surgical exploration' },
    ],
    vitals: [
      {
        recordedAt: new Date('2026-10-01T06:30:00Z'),
        systolicBp: 110,
        diastolicBp: 70,
        heartRate: 78,
        respiratoryRate: 16,
        temperature: 36.8,
        oxygenSaturation: 99,
        painScore: 3,
        gcs: 15,
      },
    ],
    orders: [
      {
        kind: 'drug',
        name: 'Cefazolin',
        dose: '1g',
        route: 'IV',
        frequency: 'Q8H',
        duration: '48h',
        status: 'active',
      },
      {
        kind: 'drug',
        name: 'Apotel',
        dose: '1g',
        route: 'IV',
        frequency: 'PRN',
        isPrn: true,
        prnCondition: 'pain > 4',
        status: 'active',
      },
    ],
    labs: [
      {
        analyteName: 'Hemoglobin',
        value: '10.2',
        numericValue: 10.2,
        unit: 'g/dL',
        flag: 'low',
        refLow: 12.0,
        refHigh: 15.5,
        sampleAt: new Date('2026-10-01T05:00:00Z'),
      },
      {
        analyteName: 'WBC',
        value: '10.5',
        numericValue: 10.5,
        unit: 'x10^3/uL',
        flag: 'normal',
        refLow: 4.5,
        refHigh: 11.0,
        sampleAt: new Date('2026-10-01T05:00:00Z'),
      },
    ],
    consults: [
      {
        specialty: 'Ob/Gyn',
        reason: 'Evaluate ovarian cyst residue post-op',
        urgency: 'routine',
        status: 'pending',
      },
    ],
    imaging: [
      {
        studyType: 'Abdominopelvic Sonography',
        findings: 'Fluid in pelvic pouch of Douglas, cyst wall collapse',
        impression: 'Consistent with ruptured cyst',
      },
    ],
    tasks: [
      {
        title: 'Check wound dressing and drain at 18:00',
        priority: 'high',
        status: 'open',
      },
    ],
    notes: [
      {
        type: 'progress',
        title: 'Morning Round Note',
        assessment: 'POD #1 post exploratory laparotomy, stable vitals',
        plan: 'Continue IV hydration and analgesia, ambulate',
        noteDate: new Date('2026-10-01T08:00:00Z'),
      },
    ],
  };

  const fixedNow = new Date('2026-10-02T10:00:00Z');

  it('de-identifies patient information by default', () => {
    const text = buildPatientDossier(sampleData, { now: fixedNow });

    // Should not include PII
    expect(text).not.toContain('Sara');
    expect(text).not.toContain('Mahmoudi');
    expect(text).not.toContain('1234567890');
    expect(text).not.toContain('09171234567');
    expect(text).not.toContain('Zand Street');

    // Should include clinical pseudonym
    expect(text).toContain('Patient #F-');
    expect(text).toContain('Acute Abdominal Pain');
  });

  it('includes identifiable data when deidentify is explicitly false', () => {
    const text = buildPatientDossier(sampleData, { deidentify: false, now: fixedNow });

    expect(text).toContain('Sara Mahmoudi');
    expect(text).toContain('1234567890');
    expect(text).toContain('09171234567');
    expect(text).toContain('Zand Street');
  });

  it('includes clinical trajectory, vitals, kardex, and abnormal labs', () => {
    const text = buildPatientDossier(sampleData, { now: fixedNow });

    // Trajectory
    expect(text).toContain('Namazi Hospital');
    expect(text).toContain('Ward: Surgery');
    expect(text).toContain('HD #3');

    // Vitals
    expect(text).toContain('BP: 110/70 mmHg');
    expect(text).toContain('HR: 78 bpm');
    expect(text).toContain('Temp: 36.8 °C');

    // Kardex
    expect(text).toContain('Cefazolin - 1g - IV - Q8H');
    expect(text).toContain('Apotel - 1g - IV - PRN (pain > 4)');

    // Labs with flags
    expect(text).toContain('**Hemoglobin:** 10.2 g/dL [LOW]');

    // Consults & Tasks
    expect(text).toContain('**Ob/Gyn (PENDING - routine):** Evaluate ovarian cyst residue post-op');
    expect(text).toContain('Check wound dressing and drain at 18:00');

    // Instructions for LLM and schema
    expect(text).toContain('```medos-plan');
    expect(text).toContain('assessment:');
    expect(text).toContain('medications:');
  });
});
