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
| D05 | All autosave fields show failure, retain latest text, offer retry and safe exit/recovery | Partial: note/capture route removal flushes and checks success; grouped shift/round fields flush before changing patient, opening editors, removing membership or ending shift. Failed fields show retry. In-flight writes remain unsaved; group rechecks for new edits while another field writes. Explicit draft discard reports failure. Consult replies, unsubmitted service/question pairs and quick-add task titles now persist with stale-revision protection, explicit comparison and atomic publication. Task drafts recover inline per patient/global scope; patient tab/edit/delete actions flush the group, while later query errors retain the loaded editor. Remaining: native back/gesture and process-death acceptance, raw invalid date recovery, media operation interruption, and concurrent editors in other flows. |
| D06 | Consult reply never inherits another consult's text | Implemented persisted per-consult draft and dedicated keyed answer screen. Atomic publish retires only that draft; retries do not change response time, closed/deleted records reject late writes, and failed writes retain the previous draft. SQLite and component-handler tests cover recovery, failure/retry and stale comparison rejection; old-backup SQL defaults tested. Native UI and process-death acceptance remain open. |
| D07 | Vitals distinguish blank from invalid, preserve partial BP and old values, record actual measured time | Implemented input/query guards and measured-time picker; `vitals.test.ts`. Available chart series no longer depend on default BP data. Native form/chart unverified. |
| D08 | Read/write errors are visible without dropping input; sensitive deletes are audited | Partial: patient read/delete, diagnoses/vitals and consult status errors surfaced; vitals/diagnosis mutations audited. Task/round refresh failures now retain loaded editors; initial note/draft read failures show an error instead of endless loading. Regression tests retain text across simultaneous read/write failure and then save it. Other edit gates, task/status actions and end-to-end recovery remain open. |
| D09 | Rounds use newest note rather than pinned-first; deleted encounters do not appear current; one active membership per patient/shift | Implemented for new writes: synchronous membership transaction, parent/encounter ownership validation, alive encounter join, latest published note query independent of pin order. `shifts.test.ts` covers concurrent adds, re-add history, deleted parents/encounters, wrong-patient links and draft/pin exclusion. Existing/imported duplicate memberships are preserved, not silently merged; UI/device acceptance remains open. |
| D10 | Backup/restore remains compatible and verifies copy strength honestly | Partial: only byte-verified copies permit pruning; equal-size unreadable copies show weaker evidence and keep older backups. Unknown/failed verification never prunes. UUID names refuse overwrite; retention protects the new copy through clock rollback. Regression tests cover provider failures, corruption, retention and atomic delivery evidence. Native SAF, interrupted restore, old fixtures, original media, low disk and second-device recovery remain open. |
| D11 | Follow-up clinical state and native reminder intent stay recoverable across failures | Implemented software slice: clinical writes precede native work; additive revision counters, deterministic reminder ids, strict cancellation and serialized repair avoid losing a record or acknowledging an obsolete request. Startup/foreground retry does not prompt for permission; cards expose unavailable reminders. Failed completion preserves its dialog text; deletes/status changes are audited. SQL failure injection, native stand-in failures/races, real notification wrapper, old-backup defaults and component handlers are tested. Actual Android alarm delivery, reboot/battery behavior, full interrupted restore and occasion mutation parity remain open. |

## Priority 1: complete everyday flows

| ID | Deliverable | Acceptance requirement |
|---|---|---|
| W01 | Inbox and task retrieval | Implemented retrieval slice: full matching totals, search and load-more for inbox/filed captures/tasks; patient/global task editor and completed/cancelled/deleted lists; reopen and restore; capture links open the actual task. Task text/outcome edits autosave with guarded exit. Quick-add titles persist as separate drafts until Add, recover inline and publish atomically without duplicates. SQLite/component tests cover overflow, ordering, partial edits, restore, draft recovery/conflicts and write failures. Remaining: device navigation/large-list performance and broad search coverage. |
| W02 | Shift history and rounds | Past-shift browse/detail implemented without restarting a shift. Removed memberships retain readable handoff notes; deleted patient identities are hidden. History deliberately omits current encounter location because it is not a historical snapshot. Remaining: persistent explicit reorder and device acceptance. Reviewed remains separate from tasks completed. |
| W03 | Priorities and due work | Task high/normal/low and consult emergency/urgent/routine use explicit tested SQL ranks. Known deadlines sort before undated tasks within a rank; closed history uses completion date. Task priority is editable. Date fields now report visible-input validity and all 13 existing consumer forms guard explicit save; invalid/incomplete text never authorizes saving the old date. Day/clock validity are independent. Remaining: task deadline editing/reminders; native keyboard/exit acceptance; durable raw invalid date drafts (currently only valid parsed dates survive recovery). |
| W04 | Patient summary | Identity, encounter/location, impressions, current problem, allergies with unknown state, relevant latest observations/labs with timestamps, medications and open work in a quick readable view. |
| W05 | Clinical record completion | Encounter history/transfers, PMHx/conditions, medication lifecycle, consult response/follow-up, imaging location/report/result review, lab manual/paste/file import and units, timeline filters. |
| W06 | Close the follow-up loop | Request, result received, physician reviewed, subsequent action and closed state are distinct and linked. No inferred completion; outstanding results remain findable. |
| W07 | Trash and correction | Task restore is available in the task list's deleted tab and preserves status/outcome/links; delete, restore and status changes are audited without clinical text. Other soft-deleted clinical entities still need appropriate restore paths. Review cross-patient moves with explicit destination identity and undo. |
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

- Packaging cleanup verified: direct Ionicons imports removed 18 unrelated fonts and
  4,017,947 combined font/bytecode bytes from the Android export. ESLint blocks the old
  barrel import. APK size, startup improvement and visual/device acceptance are unmeasured.
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
