import { and, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  consultations,
  diagnoses,
  doctors,
  encounters,
  imagingStudies,
  labPanels,
  labValues,
  notes,
  orders,
  patients,
  places,
  tasks,
  vitals,
} from '@/db/schema';
import { createConsultInTransaction } from '@/features/consults/queries';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { createNoteInTransaction } from '@/features/notes/queries';
import { createTaskInTransaction } from '@/features/tasks/queries';
import { newId, stamps } from '@/lib/ids';

import type {
  DossierConsult,
  DossierData,
  DossierDiagnosis,
  DossierImaging,
  DossierLab,
  DossierNote,
  DossierOrder,
  DossierTask,
  DossierVitals,
} from './dossier';
import type { ParsedConsult, ParsedLab, ParsedMedication, ParsedTask } from './parser';

const alivePatient = isNull(patients.deletedAt);
const aliveEncounter = isNull(encounters.deletedAt);
const aliveOrder = isNull(orders.deletedAt);
const aliveDiagnosis = isNull(diagnoses.deletedAt);
const aliveVital = isNull(vitals.deletedAt);
const aliveLab = isNull(labValues.deletedAt);
const aliveConsult = isNull(consultations.deletedAt);
const aliveImaging = isNull(imagingStudies.deletedAt);
const aliveTask = isNull(tasks.deletedAt);
const aliveNote = isNull(notes.deletedAt);

/**
 * Fetches all clinical data required to generate an exhaustive AI consultation dossier.
 */
export async function fetchDossierData(patientId: string): Promise<DossierData | null> {
  const patientRow = await db
    .select()
    .from(patients)
    .where(and(alivePatient, eq(patients.id, patientId)))
    .get();

  if (!patientRow) return null;

  // Active Encounter with Hospital and Attending names
  const activeEncounterId = resolveActiveEncounterId(patientId);
  let activeEncounterData: DossierData['activeEncounter'] = null;

  if (activeEncounterId) {
    const encRow = await db
      .select({
        encounter: encounters,
        place: places,
        attending: doctors,
      })
      .from(encounters)
      .leftJoin(places, and(eq(encounters.placeId, places.id), isNull(places.deletedAt)))
      .leftJoin(doctors, and(eq(encounters.attendingId, doctors.id), isNull(doctors.deletedAt)))
      .where(and(aliveEncounter, eq(encounters.id, activeEncounterId)))
      .get();

    if (encRow) {
      activeEncounterData = {
        kind: encRow.encounter.kind,
        admittedAt: encRow.encounter.admittedAt,
        hospitalName: encRow.place?.name ?? null,
        ward: encRow.encounter.ward,
        bed: encRow.encounter.bed,
        service: encRow.encounter.service,
        attendingName: encRow.attending ? `${encRow.attending.firstName} ${encRow.attending.lastName}` : null,
        chiefComplaint: encRow.encounter.chiefComplaint,
        outcomeNotes: encRow.encounter.outcomeNotes,
      };
    }
  }

  // Diagnoses
  const diagRows = await db
    .select()
    .from(diagnoses)
    .where(and(aliveDiagnosis, eq(diagnoses.patientId, patientId)))
    .orderBy(desc(diagnoses.createdAt))
    .all();

  const dossierDiagnoses: DossierDiagnosis[] = diagRows.map((d) => ({
    title: d.title,
    status: d.status,
    notes: d.notes,
  }));

  // Vitals (most recent first)
  const vitalsRows = await db
    .select()
    .from(vitals)
    .where(and(aliveVital, eq(vitals.patientId, patientId)))
    .orderBy(desc(vitals.measuredAt))
    .limit(5)
    .all();

  const dossierVitals: DossierVitals[] = vitalsRows.map((v) => ({
    recordedAt: v.measuredAt,
    systolicBp: v.systolic,
    diastolicBp: v.diastolic,
    heartRate: v.heartRate,
    respiratoryRate: v.respRate,
    temperature: v.temperature ? Number(v.temperature) : null,
    oxygenSaturation: v.spo2,
    painScore: v.painScore,
    gcs: null,
  }));

  // Orders / Kardex
  const orderRows = await db
    .select()
    .from(orders)
    .where(and(aliveOrder, eq(orders.patientId, patientId), eq(orders.status, 'active')))
    .orderBy(desc(orders.startAt))
    .all();

  const dossierOrders: DossierOrder[] = orderRows.map((o) => ({
    kind: o.kind,
    name: o.name,
    brandName: o.brandName,
    dose: o.dose,
    route: o.route,
    frequency: o.frequency,
    duration: o.duration,
    isPrn: o.isPrn,
    prnCondition: o.prnCondition,
    status: o.status,
    startAt: o.startAt,
    notes: o.notes,
  }));

  // Labs
  const labRows = await db
    .select({
      val: labValues,
      panel: labPanels,
    })
    .from(labValues)
    .innerJoin(labPanels, eq(labValues.panelId, labPanels.id))
    .where(and(aliveLab, eq(labPanels.patientId, patientId), isNull(labPanels.deletedAt)))
    .orderBy(desc(labPanels.collectedAt))
    .limit(20)
    .all();

  const dossierLabs: DossierLab[] = labRows.map(({ val, panel }) => ({
    analyteName: val.analyte,
    value: val.value ?? '',
    numericValue: val.valueNum !== null ? Number(val.valueNum) : null,
    unit: val.unit,
    flag: val.flag,
    refLow: val.refLow !== null ? Number(val.refLow) : null,
    refHigh: val.refHigh !== null ? Number(val.refHigh) : null,
    sampleAt: panel.collectedAt,
  }));

  // Consults
  const consultRows = await db
    .select({
      consult: consultations,
      doctor: doctors,
    })
    .from(consultations)
    .leftJoin(doctors, and(eq(consultations.doctorId, doctors.id), isNull(doctors.deletedAt)))
    .where(and(aliveConsult, eq(consultations.patientId, patientId)))
    .orderBy(desc(consultations.createdAt))
    .limit(6)
    .all();

  const dossierConsults: DossierConsult[] = consultRows.map(({ consult, doctor }) => ({
    specialty: consult.specialty,
    doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : null,
    reason: consult.reason,
    urgency: consult.urgency,
    status: consult.status,
    response: consult.response,
    followUpInstruction: consult.followUpInstruction,
  }));

  // Imaging
  const imagingRows = await db
    .select()
    .from(imagingStudies)
    .where(and(aliveImaging, eq(imagingStudies.patientId, patientId)))
    .orderBy(desc(imagingStudies.studyDate))
    .limit(6)
    .all();

  const dossierImaging: DossierImaging[] = imagingRows.map((im) => ({
    studyType: im.modality,
    bodyPart: im.region,
    performedAt: im.studyDate,
    findings: im.reportText,
    impression: im.impression,
  }));

  // Tasks
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(aliveTask, eq(tasks.patientId, patientId), eq(tasks.status, 'open')))
    .orderBy(desc(tasks.dueAt))
    .limit(10)
    .all();

  const dossierTasks: DossierTask[] = taskRows.map((t) => ({
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueAt: t.dueAt,
  }));

  // Notes
  const noteRows = await db
    .select()
    .from(notes)
    .where(and(aliveNote, eq(notes.patientId, patientId)))
    .orderBy(desc(notes.noteDate))
    .limit(4)
    .all();

  const dossierNotes: DossierNote[] = noteRows.map((n) => ({
    type: n.type,
    title: n.title,
    assessment: n.assessment,
    plan: n.plan,
    body: n.body,
    noteDate: n.noteDate,
  }));

  return {
    patient: {
      id: patientRow.id,
      firstName: patientRow.firstName,
      lastName: patientRow.lastName,
      sex: patientRow.sex,
      ageYears: patientRow.ageYears,
      birthDate: patientRow.birthDate,
      nationalId: patientRow.nationalId,
      phone: patientRow.phone,
      city: patientRow.city,
      address: patientRow.address,
      bloodType: patientRow.bloodType,
      allergies: patientRow.allergies,
      pastMedicalHistory: patientRow.pastMedicalHistory,
      drugHistory: patientRow.drugHistory,
      habitualHistory: patientRow.habitualHistory,
      familyHistory: patientRow.familyHistory,
    },
    activeEncounter: activeEncounterData,
    diagnoses: dossierDiagnoses,
    vitals: dossierVitals,
    orders: dossierOrders,
    labs: dossierLabs,
    consults: dossierConsults,
    imaging: dossierImaging,
    tasks: dossierTasks,
    notes: dossierNotes,
  };
}

export interface CommitAiPlanInput {
  patientId: string;
  encounterId?: string | null;
  saveNote: boolean;
  noteText?: string;
  assessmentText?: string;
  medications: ParsedMedication[];
  labs: ParsedLab[];
  consults: ParsedConsult[];
  tasks: ParsedTask[];
}

export interface CommitAiPlanResult {
  noteId?: string;
  orderIds: string[];
  consultIds: string[];
  taskIds: string[];
}

/**
 * Commits reviewed and physician-approved AI plan items in a single atomic synchronous transaction.
 * Invariant 6: Synchronous database transaction.
 * Invariant 10: Explicit physician validation gate.
 */
export async function commitAiPlan(input: CommitAiPlanInput): Promise<CommitAiPlanResult> {
  const result: CommitAiPlanResult = db.transaction((tx: DbTransaction) => {
    const patientExists = tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(alivePatient, eq(patients.id, input.patientId)))
      .get();

    if (!patientExists) throw new Error('پروندهٔ بیمار یافت نشد.');

    const encounterId =
      input.encounterId !== undefined ? input.encounterId : resolveActiveEncounterId(input.patientId, tx);

    let createdNoteId: string | undefined;
    const now = new Date();

    // 1. Progress Note & Assessment
    const notePlan = input.noteText?.trim() || '';
    const noteAssessment = input.assessmentText?.trim() || '';
    if (input.saveNote && (notePlan || noteAssessment)) {
      createdNoteId = createNoteInTransaction(tx, {
        patientId: input.patientId,
        encounterId,
        type: 'progress',
        title: 'ویزیت و برنامه هوش مصنوعی',
        assessment: noteAssessment || null,
        plan: notePlan || null,
        body: [noteAssessment, notePlan].filter(Boolean).join('\n\n') || null,
        noteDate: now,
      });
    }

    // 2. Medications
    const createdOrderIds: string[] = [];
    const selectedMeds = input.medications.filter((m) => m.selected);
    for (const med of selectedMeds) {
      const orderId = newId();
      tx.insert(orders)
        .values({
          id: orderId,
          ...stamps(now),
          patientId: input.patientId,
          encounterId,
          kind: 'drug',
          name: med.drug.trim(),
          dose: med.dose.trim() || null,
          route: med.route.trim() || null,
          frequency: med.frequency.trim() || null,
          duration: med.duration?.trim() || null,
          notes: med.instructions?.trim() || null,
          status: 'active',
          startAt: now,
        })
        .run();
      createdOrderIds.push(orderId);
    }

    // 3. Labs (entered as active lab orders)
    const selectedLabs = input.labs.filter((l) => l.selected);
    for (const lab of selectedLabs) {
      const labOrderId = newId();
      tx.insert(orders)
        .values({
          id: labOrderId,
          ...stamps(now),
          patientId: input.patientId,
          encounterId,
          kind: 'lab',
          name: lab.analyte.trim(),
          notes: lab.timing?.trim() || null,
          status: 'active',
          startAt: now,
        })
        .run();
      createdOrderIds.push(labOrderId);
    }

    // 4. Consultations
    const createdConsultIds: string[] = [];
    const selectedConsults = input.consults.filter((c) => c.selected);
    for (const consult of selectedConsults) {
      const consultId = createConsultInTransaction(tx, {
        patientId: input.patientId,
        encounterId,
        specialty: consult.specialty.trim() || 'مشاوره',
        reason: consult.reason.trim(),
        urgency: 'routine',
        status: 'pending',
        requestedAt: now,
      });
      createdConsultIds.push(consultId);
    }

    // 5. Shift Tasks
    const createdTaskIds: string[] = [];
    const selectedTasks = input.tasks.filter((t) => t.selected);
    for (const task of selectedTasks) {
      const taskId = createTaskInTransaction(tx, {
        patientId: input.patientId,
        encounterId,
        title: task.text.trim(),
        kind: 'general',
        source: 'ai_copilot',
        priority: 'normal',
        notes: task.due ? `زمان پیشنهادی: ${task.due}` : null,
      });
      createdTaskIds.push(taskId);
    }

    return {
      noteId: createdNoteId,
      orderIds: createdOrderIds,
      consultIds: createdConsultIds,
      taskIds: createdTaskIds,
    };
  });

  // Audit asynchronously outside the transaction
  void audit('note.versionsBackfilled', {
    entityType: 'patient',
    entityId: input.patientId,
    summary: `ورود برنامه درمانی هوش مصنوعی: ${result.orderIds.length} سفارش، ${result.consultIds.length} مشاوره، ${result.taskIds.length} تسک`,
  });

  return result;
}
