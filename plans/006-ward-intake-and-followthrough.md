# Ward intake, bedside work and follow-through

**Status:** DESIGN / NOT IMPLEMENTED AS A COMPLETE WORKFLOW  
**Owner scenario:** one physician starts a new ward rotation, creates a working census, follows patients through rounds, and closes each episode without losing its history.  
**Data rule:** this plan uses synthetic examples only. Never commit patient names, dates of birth, clinical narratives, media, database exports or screenshots.

This plan turns the owner's 2026-11-27 workflow description into implementation and acceptance contracts. It is not permission to create a second patient system, a new dashboard, a cloud service, or an automatic clinical decision-maker.

## Product outcome

A paper replacement must be at least as fast as the current paper workflow for capture and task entry, while being materially better at retrieval, longitudinal comparison, handoff and missed-work prevention. A feature is not successful merely because it has a form or database table. It must preserve the original intent, survive interruption, remain usable one-handed under ward conditions, and provide an honest path to the full record.

## Current building blocks to reuse

The source already contains patient identity and encounters, raw patient/encounter drafts, shift membership and round ordering, patient briefs/snapshots, tasks and reminders, consult requests and answers, follow-ups, notes and note versions, quick capture, voice recording, photo/document attachments, labs and flowsheets, analyte trends, clinical timeline/history, places and extensions, doctor profiles and greeting composers, encrypted backup/restore.

The implementation task is therefore integration and closure of workflow gaps, not replacement of these modules. Before each slice, inspect the current source and tests; this plan may drift as earlier PRs land.

## Workflow contracts

### 1. Start a shift and build the census quickly

- Start or resume one active shift. Capture the facility, ward/service and relevant shift context once; do not ask for them on every patient.
- Add existing patients by search and add a selected set of admitted patients as one atomic operation.
- Create a new patient with the minimum identity available at the bedside: name and an explicitly approximate age are sufficient. Sex, DOB, national identifier, contacts and permanent history may be unknown.
- Do not fabricate a DOB from an age. Preserve the distinction between approximate age, exact civil DOB and unknown.
- A minimal patient must still be uniquely retrievable. Warn on likely duplicates but never merge records automatically.
- Patient identity is longitudinal. A new admission gets a separate encounter. A location change during the same hospitalization preserves the admission clock and records the transfer in context.
- Bulk intake must preserve the shown order and either commit the whole selected set or none. A partial list after an error is unacceptable.
- Do not require the full medical history before the patient can appear on the active shift.

**Acceptance:** create a synthetic 10-patient census using only name/approximate age; add the census to a shift; reopen the app; verify all 10 patients, age certainty, order, encounter context and patient identities. Include duplicate names, missing DOB, missing sex, a deleted patient and a patient whose admission changed during the selection. A failed insert must leave no partial batch.

### 2. Progressive patient completion and transfer history

- Keep permanent patient background separate from encounter-specific presentation, transfers, investigations and plans.
- Preserve exact partial input in existing draft/recovery mechanisms. A failed save must not silently discard text, dates, numbers or selected context.
- Support structured fields where they improve retrieval, but allow concise narrative for facts that do not fit a fixed form.
- Show the current encounter and location prominently. Retain prior episodes and their original locations/dates in history.
- Never infer that a patient was reviewed, transferred, discharged or treated from opening a screen.

**Acceptance:** enter a synthetic transfer chain (emergency department -> PICU -> ward) and verify the sequence remains readable and each episode retains its original timestamps and ownership. Edit permanent allergy history without rewriting prior encounter facts.

### 3. Fast bedside capture: text, voice, photo and documents

- From the patient context, capture a short text, voice recording or photo with as few decisions as possible. The patient association must be explicit and visible before final filing.
- Preserve original media bytes. Derived crops, thumbnails, OCR text and annotations must never overwrite the original.
- Group multi-page reports as one logical document with stable page order, document type, date/source and patient/encounter association. A four-page report must be retrievable as one report, not four unrelated images.
- Provide a patient-scoped media/document list with useful filters (type/date/source) and direct open/zoom. Do not make the user search a global inbox to find an already filed report.
- Voice transcription and OCR are draft aids. Any extracted clinical value or text must show its source and require explicit review before it becomes a clinical record.
- Keep raw audio/photo available when transcription/OCR fails or is unavailable offline.
- Do not upload patient content to a cloud model or external service by default. Any future opt-in processing needs an explicit, understandable data boundary.

**Acceptance:** attach a synthetic four-page report, close/reopen the app, verify all pages, order and original bytes, and retrieve it from the patient record. Exercise denied camera/microphone permission, low storage, process death during file copy and retry without duplicates or false success.

### 4. Round tasks and delegated work

A consultant instruction should become a durable, patient-linked task, not a free-floating reminder or an easily lost line in a note.

Each task must retain:
- patient and original encounter context;
- the requested action and source/requesting clinician when known;
- due date/time or an explicit unknown time;
- priority and status;
- the evidence/result that completes it, when applicable;
- the next notification/communication action, if one is required.

Examples include a timed bedside review, a VBG, a repeat CXR, a pending culture, or notifying the supervising clinician when a named result arrives. These are examples of task types, not clinical recommendations.

- Quick-add must accept a short title first; patient, encounter, due time, source and details can be added progressively.
- Offer relative and absolute scheduling, but preserve the entered time and timezone semantics. Unknown time must not become midnight.
- Surface due and overdue patient tasks in the shift/Today context and in the patient's record. A task should be discoverable from both.
- Separate "result expected", "result received", "physician reviewed", "action required", "action completed" and "closed". A notification being scheduled or delivered is not proof that a result was received or reviewed.
- Preserve the task if a reminder permission is denied or an OS alarm is inexact. Report native scheduling separately from committed clinical data.
- Support explicit handoff/reassignment and retain who requested the work and its context.

**Acceptance:** create multiple synthetic tasks with different due times and priorities, background/kill/reopen the app, deny notification permission, receive a result, mark it reviewed, create a follow-on action and close it. No stage may be inferred from a reminder callback.

### 5. Progress notes and longitudinal labs

- Make it quick to add a dated progress note to the correct encounter. Keep authored notes, drafts and published notes distinguishable.
- Show latest relevant notes and outstanding tasks in the bedside brief without replacing the full timeline.
- Provide a flowsheet across all available observations and a direct analyte trend view. Twenty CBC panels must be navigable without opening each panel one by one.
- Compare values only when analyte identity and units are compatible. Never silently convert units or combine different methods/reference intervals.
- Preserve textual comparators such as '<' and '>' and display raw result text alongside numeric chart values.
- Show dates/times and source; missing or unknown values must remain missing, not zero.
- Allow manual entry and image-backed capture. OCR may suggest fields but cannot publish unreviewed values.

**Acceptance:** seed at least 20 synthetic CBC panels, compare WBC values across dates, verify newest-first and chronological trend views, preserve abnormal flags and reference ranges, and confirm that unit changes or textual comparators are not misrepresented.

### 6. Discharge, transfer and follow-up

- Discharge closes the active encounter and removes the patient from the active ward census/round; it does not delete the patient or clinical history.
- A transfer creates or updates the correct encounter/location transition and retains outstanding work until explicitly handed off, completed or cancelled.
- Before discharge, surface unresolved tasks, pending cultures/results, required notifications and follow-up plans. The physician explicitly decides what is complete, transferred or still pending.
- Retain discharge summary, outcome, destination and follow-up date/instructions as structured and searchable facts.
- The patient remains retrievable for future outpatient care, consults and readmission. A later encounter must not overwrite the previous admission.

**Acceptance:** discharge a synthetic patient with one completed task and one pending culture. Verify removal from active shift, preservation of the pending item with explicit ownership/hand-off, retained prior episode, and successful later retrieval/readmission.

### 7. Professional contacts, facilities and knowledge notes

- Reuse the existing doctor, place, extension and knowledge notebook modules.
- Store laboratory/facility name, phone, address, map location, website and a short private brief. Allow a clinical record to reference the place where a test was performed.
- Keep professional contact and personal communication notes private and searchable; never expose colleague ratings or private profiles in clinical exports by default.
- The greeting workflow already schedules a reminder, prepares text and records sent status on explicit confirmation. Verify these transitions on the phone, including opening and cancelling the composer. Actual automatic sending would require a separate owner-configured integration with recipient confirmation and delivery receipts.

**Acceptance:** create a synthetic lab location, link a synthetic report to it, retrieve the facility by name and address, and verify that private colleague notes are not included in ordinary diagnostics or clinical exports.

## UX and performance constraints

- Capture must be possible with one hand and without navigating away from the patient's current context.
- A quick action should not require a long form. Ask only for fields needed to safely commit that specific action.
- Use a compact patient brief for rounds and a complete record for deep review; avoid duplicating all clinical content across dashboards.
- Keep RTL, Persian labels and Jalali dates, with Latin clinical numbers and units.
- Preserve large-font, dark-mode, keyboard and accessibility behavior.
- Measure actual device latency for patient open/search, quick add, task add, capture, media retrieval, flowsheet and 40-patient scrolling. Do not infer performance from Jest or bundle success.
- The paper-parity benchmark is the number of actions and elapsed time for common capture/task flows, measured on the target device with synthetic data. No arbitrary speed claim is accepted.

## Safety, data and engineering invariants

- Offline-first remains the default. No signup, multi-tenancy, telemetry or automatic cloud synchronization.
- Never hard-delete clinical data. Keep reversible deletion and original media.
- Preserve backup format/KDF compatibility; migrations are additive only and require SQL defaults.
- All writes that form one clinical decision must be transactional, audited where required, and protected against stale dataset/encounter ownership.
- Raw drafts are not published clinical truth. Autosave acknowledgement is not proof that every keystroke is durable.
- No AI-generated diagnosis, order, dosage or treatment is automatically committed. Source-backed clinical tools require their own validation and physician review.
- Synthetic fixtures only. No real patient data in GitHub, CI, plans, commits, tests or screenshots.

## Implementation sequence

1. **Atomic ward batch addition** — PR #18 plus the stale census repair. Review the existing all-admitted shortcut and its evidence in [validation-0.11.68](../docs/validation-0.11.68.md). Ward filters and a selected-subset picker are later workflow changes.
2. **Minimal patient intake** — progressive identity (name + approximate age), duplicate warning, create encounter and shift membership safely, and preserve drafts. Reuse existing patient/encounter forms and transaction helpers.
3. **Patient-context quick actions** — text/voice/photo capture and direct filing, retaining original media and a clear patient/encounter target.
4. **Task/result lifecycle** — unify consultant instructions, due work and pending-result follow-through without confusing notification state with clinical state.
5. **Document grouping and retrieval** — multi-page documents, type/source/date and patient-scoped access.
6. **Longitudinal labs and progress** — benchmark flowsheet/trend navigation with 20+ panels and preserve unit/reference semantics.
7. **Discharge and handoff closure** — pending-work reconciliation and later retrieval/readmission.
8. **Professional directory integration** — lab/facility references and private contact notes; messaging provider integration only if explicitly configured.

Each slice requires a red regression witness where feasible, real SQLite tests for queries/mutations, full `npm run check`, exact-source hosted CI, and separate emulator/physical acceptance. Do not start a later slice by assuming the previous one is accepted.

## Definition of done for this workflow

A synthetic 10-patient morning shift and a 40-patient heavy shift can be started, populated with minimal identities, enriched progressively, rounded, assigned work, updated with text/voice/photos/labs, followed through pending results, discharged and later retrieved without losing original context. The common flows are measured on a real target device. CI, emulator, physical-device and physician clinical review evidence are reported separately. There is no "finished" claim while any of those gates remain open.
