import { toIsoDate } from '@/lib/jalali';
import { toLatinDigits } from '@/lib/persian';

export interface DossierPatient {
  id: string;
  firstName: string;
  lastName: string;
  sex?: 'male' | 'female' | 'other' | null;
  ageYears?: number | null;
  birthYear?: number | null;
  birthDate?: string | null;
  nationalId?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  pastMedicalHistory?: string | null;
  drugHistory?: string | null;
  habitualHistory?: string | null;
  familyHistory?: string | null;
}

export interface DossierEncounter {
  kind: string;
  admittedAt?: Date | null;
  hospitalName?: string | null;
  ward?: string | null;
  bed?: string | null;
  service?: string | null;
  attendingName?: string | null;
  chiefComplaint?: string | null;
  outcomeNotes?: string | null;
}

export interface DossierDiagnosis {
  title: string;
  status: 'active' | 'resolved' | 'ruled_out';
  notes?: string | null;
}

export interface DossierVitals {
  recordedAt: Date;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  painScore?: number | null;
  gcs?: number | null;
}

export interface DossierOrder {
  kind: string;
  name: string;
  brandName?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  isPrn?: boolean;
  prnCondition?: string | null;
  status: string;
  startAt?: Date | null;
  notes?: string | null;
}

export interface DossierLab {
  analyteName: string;
  value: string;
  numericValue?: number | null;
  unit?: string | null;
  flag?: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | 'abnormal' | null;
  refLow?: number | null;
  refHigh?: number | null;
  sampleAt?: Date | null;
}

export interface DossierConsult {
  specialty?: string | null;
  doctorName?: string | null;
  reason: string;
  urgency: string;
  status: string;
  response?: string | null;
  followUpInstruction?: string | null;
}

export interface DossierImaging {
  studyType: string;
  bodyPart?: string | null;
  performedAt?: Date | null;
  findings?: string | null;
  impression?: string | null;
}

export interface DossierTask {
  title: string;
  priority: string;
  status: string;
  dueAt?: Date | null;
}

export interface DossierNote {
  type: string;
  title?: string | null;
  assessment?: string | null;
  plan?: string | null;
  body?: string | null;
  noteDate: Date;
}

export interface DossierData {
  patient: DossierPatient;
  activeEncounter?: DossierEncounter | null;
  diagnoses?: DossierDiagnosis[];
  vitals?: DossierVitals[];
  orders?: DossierOrder[];
  labs?: DossierLab[];
  consults?: DossierConsult[];
  imaging?: DossierImaging[];
  tasks?: DossierTask[];
  notes?: DossierNote[];
}

export interface DossierOptions {
  /**
   * When true, replaces patient name, national ID, phone number and exact address
   * with clinical pseudonyms to protect patient confidentiality (Invariant 9).
   * Defaults to true.
   */
  deidentify?: boolean;
  /** Current timestamp reference for Hospital Day (HD) calculations. */
  now?: Date;
}

function calculateAge(patient: DossierPatient, now: Date): number | null {
  if (patient.ageYears !== undefined && patient.ageYears !== null) {
    return patient.ageYears;
  }
  if (patient.birthYear) {
    // Jalali year or Gregorian year
    if (patient.birthYear > 1300 && patient.birthYear < 1450) {
      // Jalali year approximation (e.g. 1380 -> 2001)
      const currentGregorianYear = now.getFullYear();
      const currentJalaliYear = currentGregorianYear - 621;
      return Math.max(0, currentJalaliYear - patient.birthYear);
    }
    return Math.max(0, now.getFullYear() - patient.birthYear);
  }
  if (patient.birthDate) {
    const b = new Date(patient.birthDate);
    if (!Number.isNaN(b.getTime())) {
      let age = now.getFullYear() - b.getFullYear();
      const m = now.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) {
        age--;
      }
      return Math.max(0, age);
    }
  }
  return null;
}

function calculateHospitalDays(admittedAt: Date | null | undefined, now: Date): number | null {
  if (!admittedAt) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = now.getTime() - admittedAt.getTime();
  if (diff < 0) return 1;
  return Math.max(1, Math.floor(diff / msPerDay) + 1);
}

/**
 * Builds a de-identified, standardized SBAR clinical summary dossier for AI consultation.
 */
export function buildPatientDossier(data: DossierData, options: DossierOptions = {}): string {
  const deidentify = options.deidentify ?? true;
  const now = options.now ?? new Date();
  const { patient, activeEncounter, diagnoses, vitals, orders, labs, consults, imaging, tasks, notes } = data;

  const age = calculateAge(patient, now);
  const sexLabel = patient.sex === 'female' ? 'Female' : patient.sex === 'male' ? 'Male' : 'Other';
  const sexShort = patient.sex === 'female' ? 'F' : patient.sex === 'male' ? 'M' : 'O';

  const complaint = activeEncounter?.chiefComplaint || activeEncounter?.outcomeNotes || 'Clinical Consultation';
  const hospitalDay = calculateHospitalDays(activeEncounter?.admittedAt, now);

  const identifier = deidentify
    ? `Patient #${sexShort}-${age !== null ? age : 'Adult'} (${complaint})`
    : `${patient.firstName} ${patient.lastName} (${sexLabel}, ${age !== null ? `${age} y/o` : 'Age unknown'})`;

  const lines: string[] = [];

  // Header / SBAR Context
  lines.push(`# CLINICAL CASE DOSSIER: ${identifier}`);
  lines.push(`Generated: ${toIsoDate(now)} | MedOS Clinical Operating System`);
  lines.push('---');
  lines.push('');

  // 1. SITUATION
  lines.push('## 1. SITUATION & TRAJECTORY');
  lines.push(`- **Demographics:** ${sexLabel}${age !== null ? `, ${age} years old` : ''}`);
  if (!deidentify) {
    if (patient.nationalId) lines.push(`- **National ID:** ${toLatinDigits(patient.nationalId)}`);
    if (patient.phone) lines.push(`- **Phone:** ${toLatinDigits(patient.phone)}`);
    if (patient.city || patient.address) lines.push(`- **Location:** ${patient.city || ''} ${patient.address || ''}`);
  }
  if (activeEncounter) {
    lines.push(`- **Encounter Kind:** ${activeEncounter.kind}`);
    if (activeEncounter.hospitalName || activeEncounter.ward) {
      const hospitalPart = deidentify ? 'Hospital' : activeEncounter.hospitalName || 'Hospital';
      const wardPart = activeEncounter.ward ? ` - Ward: ${activeEncounter.ward}` : '';
      const bedPart = activeEncounter.bed && !deidentify ? `, Bed: ${activeEncounter.bed}` : '';
      lines.push(`- **Ward / Location:** ${hospitalPart}${wardPart}${bedPart}`);
    }
    if (activeEncounter.attendingName && !deidentify) {
      lines.push(`- **Attending Physician:** ${activeEncounter.attendingName}`);
    }
    if (activeEncounter.admittedAt) {
      lines.push(
        `- **Admission Date:** ${toIsoDate(activeEncounter.admittedAt)}${hospitalDay ? ` (Hospital Day HD #${hospitalDay})` : ''}`,
      );
    }
    if (activeEncounter.chiefComplaint) {
      lines.push(`- **Chief Complaint:** ${activeEncounter.chiefComplaint}`);
    }
  } else {
    lines.push('- **Encounter:** Outpatient / Ambulatory');
  }
  lines.push('');

  // 2. BACKGROUND & MEDICAL HISTORY
  lines.push('## 2. BACKGROUND & MEDICAL HISTORY');
  lines.push(`- **Allergies:** ${patient.allergies?.trim() || 'NKDA (No Known Drug Allergies)'}`);
  lines.push(`- **Blood Type:** ${patient.bloodType || 'Unknown'}`);
  lines.push(`- **Past Medical History (PMH):** ${patient.pastMedicalHistory?.trim() || 'None reported'}`);
  lines.push(`- **Outpatient / Home Medications:** ${patient.drugHistory?.trim() || 'None reported'}`);
  lines.push(`- **Habits & Social History:** ${patient.habitualHistory?.trim() || 'None reported'}`);
  lines.push(`- **Family History:** ${patient.familyHistory?.trim() || 'None reported'}`);

  if (diagnoses && diagnoses.length > 0) {
    lines.push('- **Active & Tracked Diagnoses:**');
    for (const d of diagnoses) {
      lines.push(`  * [${d.status.toUpperCase()}] ${d.title}${d.notes ? ` (${d.notes})` : ''}`);
    }
  }
  lines.push('');

  // 3. OBJECTIVE FINDINGS
  lines.push('## 3. OBJECTIVE CLINICAL DATA');

  // Vitals
  const latestVital = vitals?.[0];
  if (latestVital) {
    const bp =
      latestVital.systolicBp && latestVital.diastolicBp
        ? `${latestVital.systolicBp}/${latestVital.diastolicBp} mmHg`
        : 'N/A';
    lines.push('### Vital Signs (Most Recent)');
    lines.push(
      `- BP: ${bp} | HR: ${latestVital.heartRate ?? 'N/A'} bpm | RR: ${latestVital.respiratoryRate ?? 'N/A'} /min | Temp: ${latestVital.temperature ?? 'N/A'} °C | SpO2: ${latestVital.oxygenSaturation ?? 'N/A'}%${latestVital.gcs ? ` | GCS: ${latestVital.gcs}/15` : ''}${latestVital.painScore !== null && latestVital.painScore !== undefined ? ` | Pain: ${latestVital.painScore}/10` : ''}`,
    );
    lines.push(`  (Recorded: ${toIsoDate(latestVital.recordedAt)})`);
  } else {
    lines.push('### Vital Signs: No vital signs recorded yet');
  }

  // Kardex / Active Orders
  if (orders && orders.length > 0) {
    lines.push('### Current Inpatient Kardex & Active Orders');
    for (const o of orders) {
      const parts = [o.name];
      if (o.dose) parts.push(o.dose);
      if (o.route) parts.push(o.route);
      if (o.frequency && (o.frequency.toUpperCase() !== 'PRN' || !o.isPrn)) {
        parts.push(o.frequency);
      }
      if (o.duration) parts.push(`Duration: ${o.duration}`);
      if (o.isPrn) parts.push(`PRN (${o.prnCondition || 'as needed'})`);
      if (o.notes) parts.push(`Note: ${o.notes}`);
      lines.push(`- [${o.kind.toUpperCase()}] ${parts.join(' - ')} (${o.status})`);
    }
  } else {
    lines.push('### Current Inpatient Kardex: No active medication orders');
  }

  // Labs
  if (labs && labs.length > 0) {
    lines.push('### Laboratory Results');
    for (const l of labs) {
      const flagStr = l.flag && l.flag !== 'normal' ? ` [${l.flag.toUpperCase()}]` : '';
      const rangeStr = l.refLow !== null && l.refHigh !== null ? ` (Ref: ${l.refLow} - ${l.refHigh})` : '';
      const dateStr = l.sampleAt ? ` [${toIsoDate(l.sampleAt)}]` : '';
      lines.push(`- **${l.analyteName}:** ${l.value} ${l.unit || ''}${flagStr}${rangeStr}${dateStr}`);
    }
  }

  // Imaging
  if (imaging && imaging.length > 0) {
    lines.push('### Diagnostic Imaging');
    for (const im of imaging) {
      lines.push(`- **${im.studyType}${im.bodyPart ? ` (${im.bodyPart})` : ''}:**`);
      if (im.findings) lines.push(`  Findings: ${im.findings}`);
      if (im.impression) lines.push(`  Impression: ${im.impression}`);
    }
  }

  // Consults
  if (consults && consults.length > 0) {
    lines.push('### Specialist Consultations');
    for (const c of consults) {
      lines.push(`- **${c.specialty || 'Consult'} (${c.status.toUpperCase()} - ${c.urgency}):** ${c.reason}`);
      if (c.response) lines.push(`  * Consultant Answer: ${c.response}`);
      if (c.followUpInstruction) lines.push(`  * Recommendation: ${c.followUpInstruction}`);
    }
  }

  // Tasks
  if (tasks && tasks.length > 0) {
    lines.push('### Active Shift Tasks');
    for (const t of tasks) {
      lines.push(`- [ ] [${t.priority.toUpperCase()}] ${t.title}`);
    }
  }

  // Clinical Notes & Assessment
  if (notes && notes.length > 0) {
    lines.push('### Recent Clinical Notes & Progress');
    for (const n of notes.slice(0, 3)) {
      lines.push(`- **${n.type.toUpperCase()}${n.title ? ` - ${n.title}` : ''} (${toIsoDate(n.noteDate)}):**`);
      if (n.assessment) lines.push(`  * Assessment: ${n.assessment}`);
      if (n.plan) lines.push(`  * Plan: ${n.plan}`);
      if (n.body && !n.assessment && !n.plan) lines.push(`  * Summary: ${n.body}`);
    }
  }
  lines.push('');

  // 4. PROMPT INSTRUCTIONS FOR LLM
  lines.push('## 4. INSTRUCTIONS FOR CLINICAL AI CO-PILOT');
  lines.push(
    `You are a specialized clinical decision support assistant pair-programming with the inpatient physician for ${identifier}.`,
  );
  lines.push('Please analyze the clinical data above and provide:');
  lines.push(
    '1. **Clinical Assessment & Diagnostic Synthesis:** Synthesize the trajectory, evaluate the primary impression, and list critical differential diagnoses.',
  );
  lines.push(
    '2. **Red Flags & Missed Considerations:** Highlight potential drug-drug interactions, renal/hepatic dose adjustments, antimicrobial spectrum gaps, and clinical caveats.',
  );
  lines.push(
    '3. **Evidence-Based Recommendations:** Propose therapeutic steps, lab follow-ups, diagnostic imaging, and consults.',
  );
  lines.push('');
  lines.push('### IMPORTANT: AT THE END OF YOUR RESPONSE:');
  lines.push(
    'Provide your proposed clinical plan enclosed inside a single ````medos-plan code block in valid YAML or JSON format, so it can be imported directly into MedOS EHR:',
  );
  lines.push('');
  lines.push('```medos-plan');
  lines.push('assessment: "Concise clinical impression of current clinical status"');
  lines.push('note: "Detailed clinical progress note for today\'s ward round"');
  lines.push('medications:');
  lines.push('  - drug: "Generic Drug Name"');
  lines.push('    dose: "Dose with unit e.g. 1g"');
  lines.push('    route: "IV / PO / SC"');
  lines.push('    frequency: "Q8H / Daily / BID / PRN"');
  lines.push('    duration_days: 3');
  lines.push('    instructions: "Clinical rationale or stewardship instruction"');
  lines.push('labs:');
  lines.push('  - analyte: "Lab test name e.g. CBC, diff"');
  lines.push('    timing: "Tomorrow 06:00"');
  lines.push('consults:');
  lines.push('  - specialty: "Specialty e.g. Nephrology"');
  lines.push('    reason: "Clinical question for consultant"');
  lines.push('tasks:');
  lines.push('  - text: "Specific nursing or physician task"');
  lines.push('    due: "18:00"');
  lines.push('```');

  return lines.join('\n');
}
