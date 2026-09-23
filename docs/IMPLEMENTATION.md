# Execution ledger

This is the current delivery backlog, not a claim of completeness. Read it with
`AGENTS.md` and the latest `HANDOFF.md` entry. The owner authorized implementation,
commits and GitHub pushes on 2026-09-23, with **no subagents**. Continue in priority
order; do not treat a successful test suite as acceptance of the entire product.

## Product and decision record

- Personal physician workspace, Android first, fully offline: fast capture and
  retrieval for inpatient rounds, outpatient visits and follow-ups. General medical
  workflow, not tied to one specialty. Web, server and desktop remain later work.
- Clean Persian RTL UI, English clinical text, Latin clinical numbers, Jalali UI
  dates. Patient identity is separate from each encounter. Never infer a new
  encounter or a completed action from merely opening a screen or messenger.
- Keep original media, reversible edits/deletes, recoverable autosave, meaningful
  note versions without automatic pruning, and compatible encrypted backups.
  Autosave is not an independent backup, and uncommitted keystrokes are not durable.
- Credentials are an organized notebook, not a separate vault. No additional vault
  gate or mandatory security workflow. No telemetry, tenancy, billing or signup.
- Admission duration follows elapsed time; unknown admission hour uses 12:01 noon
  with uncertainty visible. Do not change medication-day semantics implicitly.
- The latest owner-supplied conversation expands the goal to sourced clinical
  scores, precautions, screening and algorithms, reviewed by the physician.
  This supersedes the earlier blanket prohibition only within the explicit
  validation boundary in `AGENTS.md`. No formula copied from an AI chat counts
  as a validated tool. Nothing automatically orders treatment or diagnoses.
- The attachment's numerical rating (52/100), dependency count, and claimed
  approvals are reviewer statements, not acceptance evidence. Recheck actual
  code, dependency advisories, sources and devices when acting on those claims.
- Do not rewrite the framework without a measured limitation and migration plan.
  Prefer completing usable flows over adding abstractions, duplicate entities,
  long on-screen explanations, or speculative native dependencies.

## Priority 0: data integrity and recovery

| ID | Required behavior | Status / acceptance evidence |
|---|---|---|
| D01 | Exact note history includes SOAP boundaries, doctor, metadata and text; no hash-based false equality; stable rapid-save ordering | Implemented; `notes/versions.test.ts`. Old snapshots remain readable. Missing historical versions cannot be reconstructed. |
| D02 | Note + history + restored draft state commit or roll back together | Implemented; SQLite failure-injection tests in `versions.test.ts`. |
| D03 | Publish persisted draft + note + versions + voice attachment metadata together; retry without duplicate note/audio | Implemented; `commit-draft.test.ts`. Files must already exist before transaction. Native recording remains unverified. |
| D04 | Failed initial capture can retry; simultaneous filing creates one destination; attachment metadata and selected patient commit with filing | Implemented; `capture/captures.test.ts`. Conflicting destination/patient is refused. |
| D05 | All autosave fields show failure, retain latest text, offer retry and safe exit/recovery | Open. `AutosaveField`, route exits, round navigation, recording callbacks. Test failed writes and process termination separately. |
| D06 | Consult reply never inherits another consult's text | Implemented keyed in-screen drafts; `answer-drafts.test.ts` covers closing A, editing B and late submission. Native UI unverified; persistent recovery remains D05. |
| D07 | Vitals distinguish blank from invalid, preserve partial BP and old values, record actual measured time | Implemented input/query guards and measured-time picker; `vitals.test.ts`. Available chart series no longer depend on default BP data. Native form/chart unverified. |
| D08 | Read/write errors are visible without dropping input; sensitive deletes are audited | Partial: patient read/delete, diagnoses/vitals and consult status errors surfaced; vitals/diagnosis mutations audited. Edit gates, other task/status actions and end-to-end recovery remain open. |
| D09 | Rounds use newest note rather than pinned-first; deleted encounters do not appear current; one active membership per patient/shift | Open; query tests for duplicates, deleted encounters and older pinned notes. |
| D10 | Backup/restore remains compatible and verifies copy strength honestly | Partial: only byte-verified copies permit pruning; equal-size unreadable copies show weaker evidence and keep older backups. Unknown/failed verification never prunes. UUID names refuse overwrite; retention protects the new copy through clock rollback. Regression tests cover provider failures, corruption, retention and atomic delivery evidence. Native SAF, interrupted restore, old fixtures, original media, low disk and second-device recovery remain open. |

## Priority 1: complete everyday flows

| ID | Deliverable | Acceptance requirement |
|---|---|---|
| W01 | Inbox and task retrieval | No inaccessible 21st/51st item; real totals, pagination/search, valid destination links including global tasks, completed-task history, edit/reopen/undo. |
| W02 | Shift history and rounds | Open past shifts and handoff notes after ending; revisit safely; explicit reorder; clinician marks reviewed separately from tasks completed. |
| W03 | Priorities and due work | Explicit priority ranks, not lexical sorting. Patient/global tasks, deadlines and notifications are usable in UI, not only schema fields. |
| W04 | Patient summary | Identity, encounter/location, impressions, current problem, allergies with unknown state, relevant latest observations/labs with timestamps, medications and open work in a quick readable view. |
| W05 | Clinical record completion | Encounter history/transfers, PMHx/conditions, medication lifecycle, consult response/follow-up, imaging location/report/result review, lab manual/paste/file import and units, timeline filters. |
| W06 | Close the follow-up loop | Request, result received, physician reviewed, subsequent action and closed state are distinct and linked. No inferred completion; outstanding results remain findable. |
| W07 | Trash and correction | Every soft-deleted clinical entity has an appropriate restore path; preserve links and history; audit restore. Review cross-patient moves with explicit destination identity and undo. |
| W08 | Notes and media | Visual rich text with versioned document codec and plain-text export/search; preserve old text; templates; quick text/voice/photo anywhere applicable; original images/crop comparison, external file import. |
| W09 | Places, colleagues and knowledge | Specialties/referrals, private ratings/social notes, extensions/locations, teaching linked to teacher, specialty career notes, personal prescription templates, app ideas. Verify complete edit/search flows, not just existing tables. |
| W10 | Calendar and communication | Patient/global reminders and follow-ups; scheduled occasions/message preparation; record actual sending only after confirmation. No message transmission during development tests. |

## Priority 2: clinical tools and AI

| ID | Deliverable | Release gate |
|---|---|---|
| C01 | Trustworthy clinical context | Structured allergies/home medications, explicit unknown/none/not-entered, observation time/source, age reference and applicability. Preserve legacy free text without guessing. |
| C02 | Versioned clinical library | Common complaints, conditions, precautions, screening, algorithms and broad score catalogue. Each tool has primary source, version, target population/exclusions, units, freshness rules, inputs, deterministic logic, reference examples and boundary tests. |
| C03 | Physician-reviewed calculation | Show actual inputs, missing/stale data, source and limits. No missing=false assumptions. Save immutable input/output/tool-version snapshot only after physician confirmation. Clinical review per tool before it is enabled. |
| C04 | Personal AI assistance | Persian/English transcription, semantic retrieval, knowledge organization, progress/discharge drafts from existing data with provenance. Drafts never become clinical facts automatically. Benchmark device/local-server options; cloud requires explicit configured permission and data-flow review. |
| C05 | Call workflow | Quick post-call note + user-selected audio import first; investigate automatic two-sided call recording on actual target hardware separately. Do not advertise ordinary microphone permission as call-recording support. |

The WHO SMART publications separate data dictionaries, decision logic and functional
requirements: [WHO SMART](https://smart.who.int/). This is an engineering reference,
not validation of MedOS. Sources must be checked individually for the actual tools.
Android recording constraints must be assessed against its
[AudioSource API](https://developer.android.com/reference/android/media/MediaRecorder.AudioSource)
and device behavior. Another AI's statement or a successful build is insufficient.

## Priority 3: usability and release evidence

- Today leads with current shift/patients and due actions. Secondary sections use
  short previews and view-all; empty-state wording reflects all actual work.
- Collapse optional add forms; keep a fast single action for capture. Replace long
  instructional prose with clear labels and transient save/error feedback.
- Hold-and-move ordering needs persistent order, accessible alternatives and
  protection against moving content onto the wrong patient. Preserve originals.
- Measure cold start, patient open/search, scrolling 40 patients, photo/audio capture,
  database writes and backup on the target phone; publish measured values, not
  invented performance guarantees. Include RTL, keyboard and three-button navigation.
- Verify offline use, denied permissions, low space, process death, restart, date/time
  changes, upgrade migrations, corrupt/missing media, and backup restore on a second
  device. Record build SHA and exact scenarios. Hardware absence is an unverified gate,
  not a reason to halt independent software work.
- `npm run check`, schema/migration check, Android bundle, CI for the exact commit,
  APK/device acceptance and clinical-content review are separate gates.

## Handoff discipline

Each change must leave a focused commit with Agent trailer, rationale in architecture
only when a design decision changes, regression evidence, and a latest handoff with
the exact **Open threads** heading. Update this ledger as work passes acceptance;
keep the wider requested scope visible. A milestone is not complete just because its
tables or screens exist. No subagents in this execution, per owner instruction.
