# Execution ledger

Current work and acceptance gates. Read with `AGENTS.md`, `roadmap.md` and the newest
`HANDOFF.md` entry. Historical implementation details belong in that handoff
and the linked validation reports, not in the current backlog.

The owner authorized edits, commits and pushes. At most two GPT-6.1 Sol
subagents with extra-high reasoning may help; the primary agent owns
integration and verification. A passing milestone does not complete the product.

## Product and decisions

- One physician's Android workspace, fully offline: quick capture and retrieval
  during rounds, outpatient care and follow-up. General medicine, no specialty
  assumption. Web/server/desktop remain later work; no signup, tenancy or telemetry.
- Persian RTL navigation and Jalali dates; English clinical fields and Latin
  clinical numbers. Patient identity is independent of encounters. Opening a
  messenger or result does not mean it was sent or reviewed.
- Preserve original media and reversible corrections/deletion. Raw input must
  recover before publication, including invalid dates/numbers. Keep meaningful
  note versions without automatic pruning and compatible encrypted backups.
  Autosave is not a second-device backup or proof that every keystroke is durable.
- Credentials are an organized notebook, not a separate vault. No additional
  lock or mandatory security ceremony.
- Admission duration uses elapsed time. An unknown hour is represented as the
  owner's 12:01 noon assumption with uncertainty visible. Medication-day
  semantics must not change implicitly.
- Sourced deterministic clinical tools require source/version, applicability,
  units, visible inputs, reference/boundary tests and physician review before
  enablement. No chat formula, inferred input or automatic clinical order.
- No framework rewrite without a measured limitation and migration plan. No
  speculative abstraction, duplicate record, native dependency or on-screen essay.

## Current checkpoint

Application0.11.52/code68 adds bounded Kardex creation/display ownership to PR6.
A new form retains its original active episode including null; publication
checks original patient/episode/dataset together. After restore the old form
retains its original allergy display while same-dataset corrections stay live.
Full source checks pass164 suites/2,344 app tests and five workflows. The new
replacement test act warning is corrected; both allergy cases pass cleanly.
.52 hosted/native/APK acceptance is pending in
[validation-0.11.52.md](validation-0.11.52.md). This is not raw order recovery.

Previous0.11.51/code67, source a541ce5 on PR6, passes163 suites/2,329
app tests plus five workflows, with clean typecheck/lint/formatting. Exact-head
CI38013693701 succeeds, including regeneration and the Android bundle. One
shared raw lifecycle connects existing idea/topic forms and three paged recovery
links without new routes, dependencies or permissions. Complete-basis/revision
comparison, original intent and separate final publication protect corrections.
Archived teacher/specialty links remain visible and searchable during correction,
but unavailable references are not new picker choices.

Frozen-source Android witnesses pass raw whitespace/invalid-date recovery after
process stop, archived teaching links, tied-draft pages, future raw refusal and
explicit conflict adoption before separate Save. Independent authenticated
exports compare every intended row across50 application tables and all34 media
files. In-place upgrade preserves4,117 prior rows; the synthetic final action
archive matches4,141 intended rows. The read-only emulator's original userdata
and encryption-key image hashes remain exact. The same source produces the
inspected owner-signed arm64 .51/code67 APK in dist/. See
[validation-0.11.51.md](validation-0.11.51.md) for exact artifacts and limits.

Earlier source/native evidence remains in HANDOFF and version-specific reports:
[.50 note recovery and Today previews](validation-0.11.50.md),
[.49 scoped history restoration](validation-0.11.49.md),
[.48 delayed navigation and place ownership](validation-0.11.48.md), and
[.47 Kardex mutation ownership](validation-0.11.47.md). Do not substitute one
source's evidence for another. Six manual forms still need raw recovery.
Physical-phone acceptance, complete40-patient timings, pressure/restore costs,
clinical history/trash, rich text and fuller product workflows remain open below.

## Priority0: finish integrity and recovery

| ID | Contract | Current boundary and next work |
|---|---|---|
| D01 | Exact history | Note history retains SOAP boundaries, metadata, text and deterministic rapid-save ordering. Visual rich text needs a versioned codec and backward-compatible plain export/search. Permanent patient-field and other clinical correction history is not proved by note versions, soft deletion, id-only audit or retained raw drafts; complete and expose that owner requirement separately. Do not prune history. |
| D02 | Atomic note/version/draft acknowledgment | .50 persists original Note/encounter basis, including null, and raw date/clock/revision. Legacy or conflicting recovered drafts require exact shown-row adoption before separate publication; scoped recovery selects the intended draft. Software conflict, audit rollback, lifecycle and old/current import checks pass. Bounded native adoption/publication, outpatient/date/voice recovery, pages and whole archives pass in validation-0.11.50. .49 version restore has bounded native evidence. Preserve original dataset/native parents; general interruption/power acceptance remains open. |
| D03 | Durable stopped voice publication | Existing record, draft-note and capture journals support verified-copy retry and atomic metadata acknowledgment. Active/pre-journal recording loss and physical recorder/audio behavior are separate gates. |
| D04 | Atomic quick capture filing | Software preserves selected context, same-operation retry and one destination. Copied photo batches have a journal. Picker/pre-journal interruption and provider-loss/native failures still need acceptance. |
| D05 | Recover every manual form | Existing patient, encounter, task/schedule, follow-up, consult, occasion, companion, doctor/profile/rating, lab, imaging and vital recovery is unchanged. .51 connects one shared idea/topic lifecycle with feature-owned codecs/publishers, exact selected draft, raw date/whitespace, complete-basis CAS and separate publication. Software checks and bounded native recovery/conflict/archive witnesses pass in validation-0.11.51. Six forms remain: Kardex order, specialty profile, prescription, place, extension and credential. Preserve exact credential whitespace and partial prescription lines. The .52 manual Kardex form retains its original active patient/encounter including null and refuses foreign/deleted context; it still needs raw recovery with its shown clinical basis; do not plug it into the pilot's workspace-only null-parent port. Never copy a500-line engine or reuse doctor drafts for unrelated entities. |
| D06 | Consult reply ownership | Software keeps replies with their original consultation and preserves failed input. Verify full native request/answer/follow-up workflow. |
| D07 | Numerical integrity | Blank differs from invalid; paired BP conflicts cannot be half-merged; observation time/context stay explicit. Glucose units are recorded, never guessed/converted, and charts separate units. Broader chart/device and clinical applicability review remain open. |
| D08 | Truthful failures and recoverable deletion | Covered screens retain input with retry; old dataset callbacks refuse writes. Patient/note/capture/task restore exists. Labs, imaging, vitals, orders, consults, diagnoses and encounters need appropriate restore/audit paths. Order status/delete audit now commits atomically; order restore and permanent correction history remain. Lab deletion still needs audit. Never infer a deleted encounter's former active state. |
| D09 | Consistent rounds and active episode | New memberships validate live ownership, preserve reorder/handoff and use latest published clinical note independent of pins. .45 makes encounter readers consistent. Imported duplicate memberships/episodes are preserved; clinical duplicate resolution and broader native rounds acceptance remain open. |
| D10 | Compatible verified backup/restore | Format/KDF remain frozen; verified destination strength governs pruning. Restore excludes admitted writers/file jobs and preserves original ownership of old forms. Independent old/current restore exists in versioned reports. Critical swap/commit interruption, low disk, provider grants and second-device recovery remain open. |
| D11 | Recoverable follow-up/reminder intent | Database-first writes, stable ids/revisions, repair and failed-outcome retention are covered in software. Actual alarm/reboot/Doze behavior and the complete received/reviewed/action/closed product flow remain open. |
| D12 | Jalali occasions and communication | Leap-day edits/raw recovery, scheduled occurrence-year text, database-first reminder revision/repair and explicit sent confirmation are implemented in software. Test real lifecycle/delivery separately. Do not transmit messages during development tests. |

Reproduce before changing. Each new persistence path needs migrated-SQLite
failure/race/context/replay tests. Test retained forms and delayed callbacks,
not just pure serialization. Keep raw invalid input separate from clinical truth.

## Priority1: finish everyday workflows

| ID | Deliverable | Remaining acceptance or implementation |
|---|---|---|
| W01 | Inbox and tasks | Full matching totals/search/load-more, patient/global tasks, recovery, reopen/restore and explicit filing exist. Accept large-list/device navigation and broad search. |
| W02 | Shift and rounds | History, explicit persistent ordering, handoff and separate reviewed status exist. Preserve accessible ordering alternatives and wrong-patient protection. Add optional ward/place/supervisor context without slowing quick start. Accept full native rounds. |
| W03 | Due work | Explicit priority/urgency ranks and raw date/clock validation exist. Validate native software IME, alarm lifecycle and all editor exits. |
| W04 | Patient deck | Existing first-tab episode and bedside snapshot lead with identity/location/impressions/allergies, timed observations/labs, running orders and open work. Physician review and measured40-patient shift acceptance remain. Do not add a dashboard maze. |
| W05 | Clinical history | Separate encounters, timeline filters/bounded previews/keyset pages and direct record access exist. Accept native pagination/every kind/pressure and finish appropriate correction/restore. |
| W06 | Follow-up loop | Distinguish result received, physician reviewed, subsequent action and closed. Preserve outstanding work; no inferred completion. |
| W07 | Trash and correction | Extend appropriate original-context restore beyond current record kinds. Parent restore must not revive separately deleted children. Stale/alive/cross-patient/conflicting records refuse acknowledgment. Any explicit cross-patient move needs visible destination identity and undo. |
| W08 | Notes and media | Add visual headings/bold/lists/checklists with codec/history/export compatibility. .46 bounded card/highlight/voice retrieval has native pagination/filter/full-document witnesses; measured performance and broad shift acceptance remain. Keep original images and reversible crop/highlight/type/annotation, documents/PDF/video and external file import; accept native image/export/retry and capture interruptions. |
| W09 | People, places and knowledge | Features exist for specialties/referrals/private ratings/social notes, teaching/teacher, specialty careers, personal prescriptions, extensions and ideas. .51 connects idea/topic raw recovery and exposes area-read rejection/retry. Topic teacher/specialty checks and merged search commit in its publication transaction. Complete remaining forms and actual edit/search acceptance. Extension creation/editing rejects missing/deleted parents inside its transaction; a failing child index rolls back a place rename. These software checks do not finish deleted-place recovery/move or full native acceptance. |
| W10 | Calendar and communication | Accept Jalali/leap/time changes, reminders, occasion preparation and explicit actual sending history. No silent delivery claim or development transmission. |

## Priority2: validated clinical tools and future AI

| ID | Deliverable | Gate |
|---|---|---|
| C01 | Reliable context | Structured allergies/home medications, explicit unknown/none/not-entered, times/source, age reference and applicability. Preserve legacy free text; never guess structure. |
| C02 | Versioned clinical library | Common complaints, conditions, precautions, screening, algorithms and score catalogue. Source/version/population/exclusions/units/freshness/input contract, reference examples and boundaries for each tool. Review actual primary sources, not reviewer ratings or AI claims. |
| C03 | Physician-reviewed calculations | Actual inputs/missing/stale values/source/limits visible; confirmed immutable input/output/version snapshot. Clinical review before enablement. |
| C04 | Personal AI | Persian/English transcription, semantic retrieval, knowledge organization and progress/discharge drafts with provenance. Benchmark phone/local-server choices later; explicit configured permission for any cloud data flow. Outputs remain drafts. |
| C05 | Calls | Existing post-call/user-selected-file/folder/share import retains bytes/context with durable same-operation retry and confirmed cancel. Real external recorder/grant behavior, interruption/low-space and content duplicate detection remain. No built-in recording workaround without verified Android feasibility. |

WHO SMART is an engineering reference, not MedOS clinical validation:
[WHO SMART](https://smart.who.int/). Verify each enabled tool's actual sources.

## Priority3: performance and delivery evidence

- Reproduce the older .33 focus/pressure ANR with event-time scheduling/stack
  evidence; the recovered matching late stack does not establish its cause.
- Measure restore/key-derivation phases and target-device cost; .50 synthetic
  cleanup takes about465 observer-inclusive seconds. Retain frozen parameters,
  normalization schemes, golden keys and independent compatibility. Native
  keyboard-controller modal soft exceptions and audio dead-handler warnings
  remain diagnostic/acceptance work; retained processes do not prove harmlessness.
- Measure cold start, patient open/search,40-patient scrolling, capture, writes
  and backup. Exercise a complete long synthetic shift and record actual timings.
  Fast Jest or a build does not establish interactive performance.
- Check native timeline pagination/every kind, long notes, large font, RTL,
  dark mode, software IME and edge-to-edge/three-button navigation.
- Exercise denied permissions, low space, process death/restart, clock/timezone
  changes, upgrades, missing/corrupt media, provider grant loss and restores.
  Preserve originals; orphan inventory is read-only until deletion is authorized.
- When software/native gates are complete, build/inspect the owner arm64 artifact.
  Verify package/version/code/ABI/certificate/essential JNI and record actual hashes.
  Keep x86_64 QA artifacts private; never put one in `dist/`.
- Physical phone: camera, audio/audible playback, recorder/grants, notifications,
  Doze/reboot/power interruption, chosen backup provider and second-device recovery.
  Hardware absence is an open gate, not a reason to stop independent software work.
- Keep source checks, exact-source hosted CI, bundle/APK inspection, emulator,
  physical-device acceptance and physician clinical review separate. The phone
  is not currently the sole remaining work. Do not claim a crash-free final app.

## Handoff discipline

Each change leaves a focused commit with rationale and Agent trailer, appropriate
regression evidence and a newest handoff with exact **Open threads** heading.
Update current status here; do not append another chronological version history.
Record evidence/limitations in the matching validation report. Historical claims
remain in [HANDOFF.md](HANDOFF.md) and reports; correct them only if they were wrong.
The [external claim check](external-review-2026-09-24.md) does not authorize a
framework rewrite or multi-user/HIS scope. Tables/screens alone do not complete
a milestone. The primary agent owns integration and verification.
