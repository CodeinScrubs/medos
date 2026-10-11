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

Application 0.11.60/code 76 on codex/permission-state-recovery is draft PR 11's
candidate. Frozen source e34e79e passes 35 focused tests, the full 182-suite/
2,734-test check, five workflow checks, normal push and exact-source hosted CI.
Actual installed QA bytes accept repaired no-credential disable, enrolled
cancel/retry/disable and cold cancel/retry with the original synthetic patients.
Both signed x86/arm64 APKs pass actual version/ABI/certificate/JNI inspection;
dist/MedOS-0.11.60.apk is the newest owner artifact, not physical acceptance.
First-source camera/grace observations, environmental failures and exact hashes
remain separate in [validation-0.11.60.md](validation-0.11.60.md).

.59's 179-suite/2,699-test check, normal push and exact-source hosted CI pass.
Its installed private x86 APK matches inspected bytes. Native camera-grant return
keeps the original PID and updates the mounted card. Real exact-alarm special
access changes two existing occasion requests from a one-hour window to zero;
this is scheduling, not delivery. No .59 owner APK was built. See
[validation-0.11.59.md](validation-0.11.59.md); .58 evidence stays in its own report.

Permanent clinical correction history covers patient,
companion, encounter, diagnosis, vital, whole lab panel, imaging, order, consult
and follow-up records. Nine clinical record kinds can be restored from the
existing trash. Corrections appear in the existing patient timeline. Exact
ownership, audit/history rollback, original dataset and bounded reads are
required; no new route, dependency, permission or backup scheme is introduced.
The earlier two additive migrations create the history table and ownership
indexes; .58 adds no migration.

.58 adds companion/follow-up recovery and protects all nine trash kinds from
identical same-millisecond edit cycles. Companion deletion and follow-up status,
completion and postponement retain the shown clinical decision. Native reminder
receipt changes alone do not invalidate it. Recovery preserves original context/
status/result and acknowledges native reminder work separately from committed
clinical data. Focused software evidence is recorded in
[validation-0.11.58.md](validation-0.11.58.md). Full check passes178 suites/2,684
app tests, five workflow tests and typecheck/lint/format; no migration changes.
The last retained-screen correction closes an acknowledged outcome after focus
loss. Frozen source `7d557fe` passes exact-source hosted CI. Both signed .58 APKs
pass actual version/ABI/certificate/JNI inspection. Native contact/follow-up
restore/delete/denied-permission/retry/cold-start and four complete archive
comparisons pass; a completed follow-up is not reopened and originals remain.
Only native request acknowledgment is accepted: the synthetic AVD's disabled
exact-alarm access produces an inexact one-hour OS window. See the .58 report.
Earlier first-source x86 evidence does not substitute for this final candidate.

The .56 seven-kind restore/history/archive/native matrix and both inspected APKs
are recorded in [validation-0.11.56.md](validation-0.11.56.md). A later verified
mixed-owner lab defect still blocks .56 startup. .57 preserves that panel,
withholds its results with a conditional notice and repairs healthy data;
strict publication/history and real SQL failure rollback remain unchanged.
Frozen .57 source `36d4ff1` passes the full software check and exact-source hosted
CI. Its inspected signed x86/arm64 APKs, native mixed-owner restore/read/refusal/
cold-start and healthy delete/restore pass with independent complete-state
comparisons. See [validation-0.11.57.md](validation-0.11.57.md) for the actual
artifact hashes, remaining boundaries and incremental draft PR9 against PR8.
Native version0 first-start is not accepted by the restore/cold witnesses.
Older .55 input diagnosis
reproduces long-command native stale-event injection failures. The original
short mismatch and older focus ANR remain unresolved; later exact input is not
a causal explanation or physical-keyboard acceptance.

Parent evidence stays attributed to its own frozen source: [.55 notebook forms](validation-0.11.55.md), [.54 clinical form context](validation-0.11.54.md),
[.53 discharge](validation-0.11.53.md), [.52 Kardex](validation-0.11.52.md),
[.51 workspace recovery](validation-0.11.51.md), [.50 note recovery](validation-0.11.50.md) and earlier HANDOFF entries. PR1–9 are not merged here.

Physical-phone acceptance, full timed 40-patient native shifts, pressure/restore
costs, rich text, remaining trash kinds and fuller workflows remain open below.
The phone is not currently the sole remaining work.

## Priority0: finish integrity and recovery

| ID | Contract | Current boundary and next work |
|---|---|---|
| D01 | Exact history | Note history retains SOAP boundaries, metadata, text and deterministic rapid-save ordering. Visual rich text needs a versioned codec and backward-compatible plain export/search. .56 adds permanent typed snapshots for ten clinical kinds and before/after access in the existing timeline; old rows start with a real baseline on first correction. Unknown/misowned bodies stay unverified. Complete new-source native/whole-archive acceptance separately. Do not prune history. |
| D02 | Atomic note/version/draft acknowledgment | .50 persists original Note/encounter basis, including null, and raw date/clock/revision. Legacy or conflicting recovered drafts require exact shown-row adoption before separate publication; scoped recovery selects the intended draft. Software conflict, audit rollback, lifecycle and old/current import checks pass. Bounded native adoption/publication, outpatient/date/voice recovery, pages and whole archives pass in validation-0.11.50. .49 version restore has bounded native evidence. Preserve original dataset/native parents; general interruption/power acceptance remains open. |
| D03 | Durable stopped voice publication | Existing record, draft-note and capture journals support verified-copy retry and atomic metadata acknowledgment. Active/pre-journal recording loss and physical recorder/audio behavior are separate gates. |
| D04 | Atomic quick capture filing | Software preserves selected context, same-operation retry and one destination. Copied photo batches have a journal. Picker/pre-journal interruption and provider-loss/native failures still need acceptance. |
| D05 | Recover every manual form | Existing clinical stores and the .51 idea/topic and .54 Order ports are retained. .55 adds specialty profile, prescription, place, extension and credential to the same engine. Strict raw codecs preserve partial fields/secret whitespace; full-basis comparison, feature mutation, receipt/retirement and audit are one transaction. Blank-drug partial lines and invalid expiry refuse publication without losing raw input; explicit credential replacement/clear removes legacy cipher/nonce. Live references, original dataset/focus and retained native parents remain required. See validation-0.11.55 for actual software/native/artifact boundaries. Broader interruption/physical acceptance remains open; this milestone does not prove every keystroke durable. Clinical forms must validate original ownership rather than use an unparented notebook port. Never copy the engine or reuse doctor drafts for unrelated entities. |
| D06 | Consult reply ownership | Software keeps replies with their original consultation and preserves failed input. Verify full native request/answer/follow-up workflow. |
| D07 | Numerical integrity | Blank differs from invalid; paired BP conflicts cannot be half-merged; observation time/context stay explicit. Glucose units are recorded, never guessed/converted, and charts separate units. Broader chart/device and clinical applicability review remain open. |
| D08 | Truthful failures and recoverable deletion | Covered screens retain input with retry; old dataset callbacks refuse writes. Patient/note/capture/task restore exists. .56 adds audited restore for labs, imaging, vitals, orders, consults, diagnoses and historical/inactive encounters, with original full-row basis and patient/episode ownership. .58 adds companion/follow-up restore, clinical-sequence recovery tokens and retained delete/status/result/postpone intent. Lab deletion and required clinical audit/history share the write transaction. Notebook trash and broader interruption/device acceptance remain. Never infer a deleted encounter's former active state. |
| D09 | Consistent rounds and active episode | New memberships validate live ownership, preserve reorder/handoff and use latest published clinical note independent of pins. .45 makes encounter readers consistent. Imported duplicate memberships/episodes are preserved; clinical duplicate resolution and broader native rounds acceptance remain open. |
| D10 | Compatible verified backup/restore | Format/KDF remain frozen; verified destination strength governs pruning. Restore excludes admitted writers/file jobs and preserves original ownership of old forms. Independent old/current restore exists in versioned reports. Critical swap/commit interruption, low disk, provider grants and second-device recovery remain open. |
| D11 | Recoverable follow-up/reminder intent | Database-first writes, stable ids/revisions, repair and failed-outcome retention are covered in software. .58 recovery preserves outcome/status/deadline and reports native repair separately; retained row checks protect clinical choices across live refresh. Native denied-permission/retry/cold request acknowledgment passes in .58. .59 separately accepts actual special access and the occasion-request window transition; alarm/reboot/Doze delivery and the complete received/reviewed/action/closed product flow remain open. |
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
| W05 | Clinical history | Separate encounters, timeline filters/bounded previews/keyset pages and direct record access exist. .56 adds bounded correction history and seven clinical restore kinds. Accept new-source native pagination/every kind/pressure; note and clinical history retain separate codecs. |
| W06 | Follow-up loop | Distinguish result received, physician reviewed, subsequent action and closed. Preserve outstanding work; no inferred completion. |
| W07 | Trash and correction | .56 extends original-context restore to seven clinical kinds; .58 adds companions/follow-ups and protects identical same-ms cycles. Notebook tombstones still need appropriate recovery; the places-list phone intent needs a handled rejection. Native contact/follow-up recovery, denied notification permission, retry and cold persistence pass in .58; actual alarm delivery remains separate. Parent restore must not revive separately deleted children. Stale/alive/cross-patient/conflicting records refuse acknowledgment. Any explicit cross-patient move needs visible destination identity and undo. |
| W08 | Notes and media | Add visual headings/bold/lists/checklists with codec/history/export compatibility. .46 bounded card/highlight/voice retrieval has native pagination/filter/full-document witnesses; measured performance and broad shift acceptance remain. Keep original images and reversible crop/highlight/type/annotation, documents/PDF/video and external file import; accept native image/export/retry and capture interruptions. |
| W09 | People, places and knowledge | Features exist for specialties/referrals/private ratings/social notes, teaching/teacher, specialty careers, personal prescriptions, extensions and ideas. .51 connects idea/topic raw recovery and exposes area-read rejection/retry; .55 connects the remaining notebook forms. Topic/reference checks and merged search commit with publication. Extension creation/editing rejects missing/deleted parents inside its transaction; a failing child index rolls back a place rename. Complete broad edit/search acceptance and deleted-place recovery/move; bounded recovery checks do not finish every native workflow. |
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

- Long single-command .55 ASCII injection failures have native stale-drop evidence.
  The original short mismatch is still unexplained; diagnose it before accepting
  input under pressure. Capture IME readiness/event-time/native ordering and host versus
  target load separately; idle retries and process survival do not establish cause.
- Reproduce the older .33 focus/pressure ANR with event-time scheduling/stack
  evidence; the recovered matching late stack does not establish its cause.
- Measure restore/key-derivation phases and target-device cost; .50 synthetic
  cleanup takes about465 observer-inclusive seconds. Retain frozen parameters,
  normalization schemes, golden keys and independent compatibility. Native
  keyboard-controller modal soft exceptions and audio dead-handler warnings
  remain diagnostic/acceptance work; retained processes do not prove harmlessness.
- .59 accepts actual mounted camera-grant return and the system exact-alarm
  switch, including two observed occasion-request windows changing from one hour
  to zero. Actual delivery and OEM/Doze/reboot behavior remain separate.
- .60 accepts handled lock/settings failures in software and bounded actual
  no-credential/enrolled/cold behavior on frozen installed QA bytes. Its full
  check, source CI and both inspected APKs pass. Physical authentication and
  broader native failure/lifecycle cases remain separate.
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
