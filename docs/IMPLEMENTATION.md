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

Source0.11.51/code67 connects raw recovery to the existing idea/topic forms.
One shared lifecycle uses feature-owned strict codecs and synchronous
publishers. Exact whitespace, partial tags and invalid visible dates survive
raw persistence independently of publication. Complete published bases and
revision CAS prevent a recovered draft overwriting a newer correction. Exact
shown-row adoption changes only raw input; Save remains a separate transaction.
Original route/draft/dataset/focus ownership survives refresh and replacement.
Three short recovery links with older/newer pages stay in each existing list.
No new route, dependency, permission or backup format. Verification status and
source/native boundaries are in [validation-0.11.51.md](validation-0.11.51.md).
Full checks pass163 suites/2,325 app tests plus five workflows, with clean
typecheck/lint/formatting. Exact-source native acceptance and hosted CI are
pending; the last inspected owner artifact remains .50 below.

Previous0.11.50/code66 persists the original Note/encounter basis, including null,
raw date/clock and draft revision. A reopened draft cannot overwrite a newer
correction or attach itself to a later admission. Invalid dates remain raw and
cannot publish their older parsed timestamp. Legacy/conflicting drafts require
exact shown-row review/adoption, which changes only the raw draft; clinical
publication remains separate. Recovery cards select their own scoped draft ID.
The original dataset and loaded/completed native parents remain intact.
Recovery includes acknowledged canonical voice and filters empty recorder rows
before its limit; the selected draft and its meaningful preview stay visible.
Older recovery drafts are reachable in20-card replaceable pages, with stable
time/ID cursors and a way back after an older page empties. Recovery follows the
Today summary tiles with three previews and in-place access to the 20-card
pages; scheduled patient work has a ten-row preview, exact total and matching
full-list scope. Shared predicates and priority ordering prevent
the preview/count/destination from disagreeing. Filter changes replace only
read results, retaining the screen and native header parents.
The combined recovery/deck corrections pass81 focused cases. Final full checks
pass160 suites/2,255 application tests and five workflows, with typecheck/lint/
both formatting checks clean and no warnings. Regeneration reports no schema
changes. Exact final-head `2dcd60b` hosted CI succeeds, including schema
regeneration and the Android bundle.
Frozen `1915ee5` x86 native acceptance includes explicit adoption before
publication, original outpatient null association, invalid raw date/clock and
voice-only recovery. Independent final exports preserve the intended4,136
rows/34 media. Three native recovery pages select the oldest of41 tied drafts;
their export preserves all4,178 rows/34 media. The ten-task preview opens the
matching40-row full list. Acknowledged original-base restore/cold export
preserves all4,117 rows/34 media with only the three additive draft defaults.
The same frozen source produces an inspected, owner-signed .50/code66 arm64
candidate in `dist/`. See [validation-0.11.50.md](validation-0.11.50.md).
No phone acceptance has run. Restore latency and nonfatal native modal/audio
warnings remain open; bounded correctness is not a performance budget.

Preceding .49 scopes note/history readers to the live patient and validates
version/current-row/parent/dataset ownership in atomic history restoration.
Success returns to the patient workspace. Its frozen-source native witnesses
now pass: foreign-route refusal, intended version restoration and acknowledged
base restore/cold export, with all4,117 original rows/49 tables/34 media exact.
See [validation-0.11.49.md](validation-0.11.49.md). These witnesses do not validate
.50 code or a complete shift.

The preceding .48 binds delayed removal/old-dataset confirmation to the
original mounted navigator and one removal attempt. A new route supersedes an
old Back without a normal-path prompt; unchanged background stack cleanup still
works. Extension creation/editing validates the live place in its synchronous
write transaction; place rename and child search indexes commit together.
The manual place/extension editors still need raw recovery and original-intent
fencing. Final .48 source checks pass157 suites/2,168 application tests and five
workflows with typecheck/lint/both formatting checks green and no warnings.
Native .48 upgrade, old-form/normal exits and live-parent refusal/creation pass
their bounded witnesses. The independent post-action archive matches4,121
rows/49 tables/34 media after exactly one specified extension insertion; the cold
base matches all4,117 original rows/34 media. A native foreign-note read exposes
the scope gap addressed in .49. Rejected locator/script attempts and the late
restore completion without a tapped acknowledgment are preserved in
[validation-0.11.48.md](validation-0.11.48.md).

The preceding .47 makes current-card Kardex status/delete acknowledgments
transactional: exact shown row, live parent/episode, original dataset and atomic
id-only audit. Retained read failures cannot authorize actions. The manual order
form retains its original identity/input through route reuse, deletion and read
failure, locks duplicate publication, and prevents delayed suggestions or closing
another screen. Unknown start remains unknown. This is not raw draft recovery,
permanent correction history or implemented order-trash restore.

The preceding .45 shares a deterministic current-encounter fallback; duplicate
episodes remain intact. .46 adds40-card note cursor pages, bounded highlights,
visible-note voice counts and display-only backup progress updates. Full source
documents/history/crypto are unchanged. .47 full source checks pass156 suites/
2,143 application tests and five workflows, with typecheck/lint/both formatting
checks green. Source checks and native acceptance are tracked separately.

Native .46 upgrade, all90 long-note titles across three pages, whole-record
operation filter and full32,036-character editor witnesses pass. Its actual
post-witness archive matches4,212 rows/49 tables/34 media exactly; acknowledged
base restore/cold export matches the original4,117 rows/34 media. Interrupted
automation and the System UI boot ANR are explicitly retained in
[validation-0.11.46.md](validation-0.11.46.md). .47 native current/standing
Kardex actions, unknown-start edit and foreign-route refusal pass. Independent
archives match all4,128 rows after exactly three intended changes and34 media
hashes; acknowledged base restore/cold export matches the original4,117 rows.
See [validation-0.11.47.md](validation-0.11.47.md).
Native tied-episode Kardex is recorded in
[validation-0.11.45.md](validation-0.11.45.md). Patient/note delete/refusal/restore is recorded in
[validation-0.11.43.md](validation-0.11.43.md).
Raw vitals/context/timeline have bounded native evidence in
[validation-0.11.41.md](validation-0.11.41.md); explicit glucose units, separate
charts and old/current restore in [validation-0.11.42.md](validation-0.11.42.md).
These do not prove full-shift performance, every failure path or phone acceptance.
`dist/` now includes the inspected .50 owner candidate; an APK is not phone
acceptance or completion of the remaining product gates.

## Priority0: finish integrity and recovery

| ID | Contract | Current boundary and next work |
|---|---|---|
| D01 | Exact history | Note history retains SOAP boundaries, metadata, text and deterministic rapid-save ordering. Visual rich text needs a versioned codec and backward-compatible plain export/search. Permanent patient-field and other clinical correction history is not proved by note versions, soft deletion, id-only audit or retained raw drafts; complete and expose that owner requirement separately. Do not prune history. |
| D02 | Atomic note/version/draft acknowledgment | .50 persists original Note/encounter basis, including null, and raw date/clock/revision. Legacy or conflicting recovered drafts require exact shown-row adoption before separate publication; scoped recovery selects the intended draft. Software conflict, audit rollback, lifecycle and old/current import checks pass. Bounded native adoption/publication, outpatient/date/voice recovery, pages and whole archives pass in validation-0.11.50. .49 version restore has bounded native evidence. Preserve original dataset/native parents; general interruption/power acceptance remains open. |
| D03 | Durable stopped voice publication | Existing record, draft-note and capture journals support verified-copy retry and atomic metadata acknowledgment. Active/pre-journal recording loss and physical recorder/audio behavior are separate gates. |
| D04 | Atomic quick capture filing | Software preserves selected context, same-operation retry and one destination. Copied photo batches have a journal. Picker/pre-journal interruption and provider-loss/native failures still need acceptance. |
| D05 | Recover every manual form | Existing patient, encounter, task/schedule, follow-up, consult, occasion, companion, doctor/profile/rating, lab, imaging and vital recovery is unchanged. .51 connects one shared idea/topic lifecycle with feature-owned codecs/publishers, exact selected draft, raw date/whitespace, complete-basis CAS and separate publication. Software checks pass; native pilot acceptance is pending in validation-0.11.51. Six forms remain: Kardex order, specialty profile, prescription, place, extension and credential. Preserve exact credential whitespace and partial prescription lines. Kardex needs its original patient/encounter including null and shown clinical basis; do not plug it into the pilot's workspace-only null-parent port. Never copy a500-line engine or reuse doctor drafts for unrelated entities. |
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
