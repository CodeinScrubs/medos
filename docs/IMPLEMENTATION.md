# Execution ledger

This is the current delivery backlog, not a claim of completeness. Read it with
`AGENTS.md` and the latest `HANDOFF.md` entry. The owner authorized implementation,
commits and GitHub pushes on 2026-09-23. The current delegation limit (2026-10-08)
is **at most two subagents**, each GPT-6.1 Sol with extra-high reasoning, with
the primary agent owning integration and checks. Continue in priority
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

0.11.37 closes companion raw-form recovery via migration0024 and hardens the
remaining manual doctor submissions against original-intent, late navigation,
same-turn duplicate and field overwrite defects. Their raw crash recovery is
still open. Imported photo checksums/original MIME are now actually persisted;
custom lab units and flagged-row Remove are accessible. Tables/history show
each recorded unit. No dependency, permission, route or clinical formula added.
Actual IME acceptance added a stable header publication/Close slot to companion
and manual doctor forms. The actual table exposed inherited mono line metrics;
explicit value/unit lines and shared font-scaled geometry preserve row separation.
Verification and explicit remaining acceptance gates belong in
validation-0.11.37.md and the newest HANDOFF; do not treat these fixes as full
P0 or product completion. Next: doctor/profile/rating and photo-caption/imaging
raw durability, durable photo batch publication/recovery and orphan inventory;
then physical, pressure and full-shift evidence.

Final .37 source `5924bd1` passes 137 suites/1,857 app tests and five workflows.
Inspected/installed emulator bytes pass native font scales1/1.6, raw cold
recovery and current/old/current restore. Independent comparisons preserve
4,079 rows/44 application tables/28 media hashes exactly; old .36 restore
preserves4,070 rows and leaves the new draft table empty. The signed/inspected
owner arm64 APK is built, with an actual JS bundle identical to accepted QA.
It has not been tested on the A52s. See validation-0.11.37.md for artifact
identities and rejected trials; remaining P0 and acceptance work stays open.

0.11.36 adds reversible photo annotation without overwriting the original or
working image. The viewer opens a single editor with pen/highlight/arrow/text,
crop/rotate, undo/redo and history. Raw text and marks use recoverable/CAS drafts;
publication/version retention is atomic. Source copies and PNG shares are
verified; cache-hit native readiness is a pinned config-plugin patch, not a new
dependency. Native evidence and its limits belong in validation-0.11.36.md.
This does not close the photo-import journal/orphan, other raw forms, physical,
pressure or complete product gates below.

Image checkpoint `4c24534` passes native mixed-text recovery, erase/Undo, release
coordinates, cached PNG repeat, crop/rotation, original sharing and old/new restore.
Final application `f5cd5df` passes 134 suites/1,780 app tests and five workflows.
History lists read metadata only; selected documents are loaded within original
dataset admission. Inspected installed final QA bytes also pass stationary pen/
highlight dots, exact Down/Up coordinates, lazy baseline/reapplied history and
actual PNG pixel/byte checks. Final cold comparison preserves all 4,070 rows/
43 app tables/28 media hashes and live raw text exactly. Originals remain intact.
This is bounded emulator evidence; owner/physical/performance gates stay distinct.
See validation-0.11.36.md and HANDOFF for final artifact/CI identity.

0.11.35: manual lab entry now persists its versioned raw form, including invalid
date/clock/number and open range text, through additive migration0022. Clinical
publication plus draft retirement is atomic/CAS-guarded, original encounter and
dataset intent stay captured, and delayed acknowledgment cannot Back a newer
route. Existing value notes/source/sub-minute time survive editing. Compare
exposes current clinical data and raw draft before explicit whole-panel rebase.
Native parent/header stay stable; no dependency, route or formula was added.
Final application source `d2bcbea` passes 128 suites/1,704 app tests, three workflow
checks and exact-source CI. Native QA found keyboard-occluded footer publication;
one stable header now uses the same publication path. Delayed clipboard retrieval
preserves intervening row edits, including explicitly retyped original values.
Final inspected/installed QA bytes pass in-place preservation, historical-panel
raw cold recovery, invalid Save refusal, IME-open edit publication, soft draft
discard and final cold comparison of all 4,057 rows/41 tables/25 media hashes.
The signed/inspected owner arm64 APK is built; it has not been tested on the A52s.
See validation-0.11.35.md for exact sources, artifacts and rejected attempts.
Next implementation: companion/doctor raw recovery and remaining original-intent
gates, then safe orphan accounting; custom lab unit entry and flagged-row Remove
access also need focused UI corrections. Physical/power/pressure/performance and
complete P0 acceptance remain separate.

0.11.34: 0.11.33 retained the header but still failed the exact native Save
reproduction. Both corresponding note form Columns now retain one native
stacking parent when saving toggles pointerEvents. Real Column/View tests cover
idle, pending publication/discard, failure/retry and completion. No schema,
dependency, global layout change or new workflow. Native correction and remaining
draft voice acceptance are tracked in validation-0.11.34.md; never infer native
success from the software witness. The 0.11.32 and 0.11.33 artifacts both failed.

0.11.34 bounded native acceptance now passes on exact installed QA bytes:
legacy Save, new stopped/cold draft voice, IME-open publication, ready refusal,
explicit discard and cacheless recovery retaining newer text. Final cold reopen
preserves 4,049 rows/40 tables/25 files exactly. Native playback progress/Pause
works; acoustic output and physical/performance/power gates remain separate.
Preserve the pre-upgrade .33 picker-focus ANR under concurrent host load as an
unresolved pressure trial; its cause was not proved by later success.
At that checkpoint, the next P0 was manual lab raw recovery, then companion/
doctor raw forms. The manual lab source correction now appears above in .35;
its native recovery gates remain separate. Do not store partial labs as clinical rows.

0.11.33: native 0.11.32 acceptance found/repeated a note-close crash after correct
SQL publication. The completed branch now keeps the same scroll host so its
ScreenOptions cannot remount/rewrite the native header during Back. Real
screen/header publication and discard witnesses fail before, pass after;
the former string-host editor tests missed this. See validation-0.11.33.md for
source and rebuilt native checkpoints; its native retest also failed.
Finish this bounded native acceptance before raw manual lab/contact recovery.
Restoring older archives also retains unrelated media bytes: safe orphan
accounting/cleanup is open; do not delete them to make archive comparisons pass.

0.11.32: new-note stopped voices reuse the recording journal. Canonical draft
attachments survive later text autosave; pending jobs protect publication,
retirement and parent identity. Note/history/media movement is one transaction,
preserving original file/hash/time and old JSON voice compatibility. Original
dataset admission and navigation focus govern final acknowledgment; brief final
submission freezes editing and failed publication remains editable/retryable.
The unused process-local staging path is removed. No migration/dependency/route.
See validation-0.11.32.md for executed source and separate native checkpoints.
Next P0: manual lab/contact raw recovery and remaining async forms, then the
other integrity/native/product gates below. This is not complete P0 acceptance.

0.11.31: stopped quick-capture voices use the existing recording journal;
capture kind/media/job acknowledgment and empty cleanup/filing are atomic.
Original writer/screen/card/picker/recovery intents survive restore without
writing replacement rows. Latest typing is flushed before close; delayed native
or filing acknowledgment cannot navigate over another route. No new schema,
dependency or normal-path UI. See validation-0.11.31.md for witnessed software
failures and separate source/artifact/native gates. This does not close active/
pre-journal interruption, draft-note voices, manual raw forms or phone acceptance.
Next P0 is the draft-note journal/publication contract, then manual lab/contact
raw recovery and remaining form intent/navigation audits.

0.11.31 acceptance (2026-10-08): exact application `d61b11d`, CI 37679736687,
signed/inspected owner arm64 and QA x86_64 APKs. Offline in-place upgrade preserves
4,024 rows/40 app tables/18 files. Actual Back/manual stopped voices survive cold
reopen. Native retained-inbox replacement, rejected pending publication/assignment,
seeded ready recovery without cache and note filing pass independent row/media
comparisons; final cold reopen preserves 4,035 rows/21 files exactly. No observed
MedOS crash/ANR; this is bounded native acceptance. Seeded readiness does not prove
power-loss behavior; no physical/performance, audible playback or full P0 sign-off.
See validation-0.11.31.md. The next implementation is draft-note voices, not a
duplicate capture mechanism or a new normal-path recovery screen.

0.11.30 acceptance checkpoint: application `eb1979a`, exact-source CI
37656747034 success, both signed/inspected ABIs and native in-place upgrade
preserve 4,023 rows/40 app tables/18 media files. The continuous native round
reviewed all 40 identities with one process/no observed MedOS crash; final export
contains only intended review/text/occasion changes. See validation-0.11.30.md.
This closes that bounded round/upgrade gate, not physical-phone or performance
acceptance: emulator jank was 89.61%. Next implementation remains durable
stopped capture voices, then note-draft voices and other raw-form gaps.

2026-10-07, 0.11.30: native 40-patient review of 0.11.29 found excessive shift
header space and a late navigation race when scheduling/permission completed
after a newer deep link. Shift/round now omit only their duplicate top inset;
round/add-patient stay direct and shift administration is one inline group.
The occasion form checks original navigation focus before delayed Back and
retains one completed/read-only close path. The pre-fix deferred-reminder witness
failed; targeted four suites / 40 checks pass after correction. Other async forms
still need navigation-ownership audit. Native and full-check evidence for this
source is tracked in validation-0.11.30.md; previous exact source/archive/heavy
navigation evidence is in validation-0.11.29.md. No broader P0/phone sign-off is implied.

2026-10-07, 0.11.29: the active shift/Today deck now exposes compact patient
identity, admission, pinned-episode context and the next correctly scoped task.
Search reaches all members; hidden handoff editors stay mounted. Accessible
reorder flushes the one Scope and atomically compares/updates the complete live
membership permutation. Root patient read retry is wired. Raw occasion forms
are durably staged by additive migration 0021; publication/retirement is atomic
and idempotent, with original intent through comparison/discard/native scheduling.
Message channels are accessible in one sheet; handover is prepared, sent status
requires explicit confirmation, retry does not reopen and all history is reachable.
Strict Jalali/date recovery and 1300–1500 ICU boundary checks cover leap rollover;
lunar occasions default to one-off. See validation-0.11.29.md for exact evidence.
The software heavy-shift test accelerates 24 hours for 40 patients with 960 tasks,
240 notes / 480 versions and 1,440 lab values; it is not a native 24-hour soak.
Compatible shell-quote/source-map-js patches remove two advisories (current scan
46 affected entries before, 44 after; five underlying advisories remain). This
closes neither every raw-form/stopped-voice gap nor physical-phone, clinical or
whole-product acceptance. No automatic messaging or new clinical formula is added.

2026-10-07 PR audit: all five heads and their older-base CI were checked. A local
integration passed all 1530 existing app tests, but 24 targeted checks failed
(one rollback check passed). PRs 1/4 are blocked as submitted; PRs 3/5 need
changes. PR 2's useful acknowledged-answer lock is ported independently in
0.11.27, retaining the original lease/exit guard and failure retry. The existing
patient summary now includes lab units and older-result age; messenger failure
feedback no longer invents a clipboard copy. See project-audit-2026-10-07.md and
validation-0.11.27.md for exact evidence and proposed paper-replacement acceptance.
No PR was remotely merged or approved. Existing execution priorities below stay
in force; a new AI banner or feature count does not close the capture/phone gates.
The same audit's bounded production-dependency scan found seven underlying
advisories propagated to 81 affected package entries. This patch changes none
of them. First take scoped compatible shell-quote/source-map-js fixes with their
own verification; trace the remaining parent/tool/runtime paths. Do not apply
npm's suggested framework downgrades or `audit fix --force`. Exact versions,
primary advisory links and limits are in the audit's dependency section.

2026-10-07, 0.11.28: live GitHub refresh found the same five open PR heads;
their audit dispositions remain unchanged. The main overview now separates
failed/loading reads from empty follow-ups, contacts, diagnoses, consults and
admissions; retains loaded rows/typed input, offers retry and updates admission
duration from the shared clock. The compact kardex resolves episode ownership
and orders in one watched SQLite statement. No new route, normal-path dialog,
dependency, schema or clinical rule. See validation-0.11.28.md for separate gates;
this does not close raw recovery, physical-phone or full-shift acceptance.
Signed arm64 inspection and bounded offline x86_64 upgrade/scope/cold-reopen
acceptance also passed; independent archive comparison preserved all 39
application tables and 18 original media files before native fixture additions.
Source-reviewed read follow-up: wire root `PatientRecord`'s existing query retry
into both root ErrorNotice branches, retaining the same AutosaveScope/input.
Do not equate the native projection check with native SQL failure injection.

2026-10-07, 0.11.26: original intent is captured before initial reads for patient,
admission/edit/discharge, follow-up and consult-answer forms. Their Autosave and
manual publication/comparison/load/adopt/discard use that token through final
acknowledgment. Loaded raw input survives replacement; delayed duplicate/delete
confirmations cannot mutate the replacement dataset. Companion entry now uses
latest-input and submission refs; its query atomically rejects retired patients.
Inline doctor/place creation is fenced, and the picker reports failures and
suppresses duplicate creation without adding normal-path UI.
See [validation-0.11.26.md](validation-0.11.26.md) for executed evidence and pending
acceptance. Next: durable stopped voices for capture/note drafts, then independent
manual lab/contact raw recovery and remaining integrity/feature/native gates below.
Do not equate scoped intent fencing with all-form or whole-product completion.

2026-10-04, 0.11.25: fence NoteCard pin/nested delete, FollowUpCard.perform,
media viewer caption/delete/share and lab entry creation/update/paste. Keep original
Scope/Gate ownership, actual prompt/raw input on failure and admission through SQL/
native acknowledgment. Save/Paste mutexes prevent duplicate or early lab publication;
async paste preserves unrelated current edits. No new dialogs/guards/dependencies.
See [validation-0.11.25.md](validation-0.11.25.md) for evidence and limitations.
Final 114 suites / 1462 app tests + three workflows, exact-source CI, both signed
ABI packages and bounded offline native acceptance passed. Old pin/delete, follow-up
completion, lab Save and viewer caption/delete/share refused; typed outcome/lab/
caption input remained. Independent export preserved all 39 app tables and 18 files
exactly. Fresh pin/history, completion, caption and lab note persisted after cold
reopen with only expected changes; 33 other app tables and all files were unchanged.
Next: patient/admission/follow-up/consult-answer form intents, then durable stopped
voice publication for draft/capture. Manual lab raw input still needs a separate
durable recovery design; retained mounted input is not crash recovery. Broader
clinical/native/physical-phone/product gates below remain open.

2026-10-04, 0.11.24: fence manual patient actions and task/consult/schedule raw
draft publication, load/adopt/discard and reminder retry. Late descendants inherit
their retained Scope's original generation; clean flush cannot confer current
authority. Undo retains its original token after row removal, and async media/native
acknowledgment keeps admission until completion. No new UI or dependencies.
See [validation-0.11.24.md](validation-0.11.24.md) for reproduction and acceptance
evidence. Next bounded integrity work: note-card pin/delete, follow-up card actions,
media viewer delete/caption, lab entry and other unscoped patient/admission/follow-up/
consult-answer forms. Then durable stopped voices for capture/note drafts. Neither
this patch nor patient renewal establishes every descendant or whole-product safety.
Exact-source CI, both signed packages and bounded offline native acceptance now
passed. A consultation composer mounted after restore retained old ownership,
refused publication and kept actual input. The old task checkbox also refused.
Independent export preserved all 39 application tables and 18 files exactly;
explicit renewal allowed a fresh consultation/request status that survived cold
reopen. Physical phone/API 26 and other forms remain open. Start the next bounded
patch with NoteCard's pin/nested delete and FollowUpCard.perform: protect complete
note history and retain completion outcome across failure, through native reminder
acknowledgment. Avoid UI changes or new guards in that patch.

2026-10-04, 0.11.23: implement explicit renewal of retained patient roots through
the originating route's always-on guard. Keep pending manual input and the last
patient snapshot until confirmed review/copy or closure; recovery is also available
before the initial read completes. Per-dialog/route ownership and immutable tokens
prevent delayed confirmations from acquiring new authority. URL-tab transitions
use the Scope fence; scoped actions retain admission through awaits. Vital and
diagnosis manual mutations are fenced; failed diagnosis correction retains actual
prompt text, and duplicate Add/Submit is suppressed. Software/native evidence is
recorded separately in [validation-0.11.23.md](validation-0.11.23.md).
Next: remaining direct contact/star/task/consult/lab/imaging/media/order actions
and raw-draft comparison/load/discard intents. Do not claim root renewal alone
fences every descendant callback. Then finish durable capture/draft-note stopped
voice journals and the remaining feature/native acceptance gates.
Exact-source CI, signed owner/emulator packages and bounded native renewal now
passed. The actual retained vital field survived restore and rejected old Save;
review cancellation retained it, confirmation replaced the originating route,
and fresh header Edit worked. Independent export preserved all 39 application
tables and 18 media files exactly. A subsequent fresh vital save survived cold
reopen. This does not cover every descendant mutation or physical-phone behavior.

2026-10-03, 0.11.22: all 21 real-SQL witnesses failed on pinned 0.11.21 source.
They reproduce overwritten search indexes across twelve rebuild entry points and
five related-name paths, an old flag applied to a corrected lab result, duplicate
baseline history from parallel repair and incomplete lab/history after a later
SQL failure. Each feature repair now keeps current reads/maps and writes inside
one synchronous transaction. Clinical fields/timestamps and history semantics
are unchanged; no UI, dependency, migration or archive scheme change.
See [validation-0.11.22.md](validation-0.11.22.md) for actual gates. This closes
those repair interleavings, not all post-commit housekeeping or manual intents.
Next: remaining manual/raw-draft token fences and fresh capture on retained root
screens, then durable quick-capture/draft-note stopped-voice journals.
Exact-source CI, both signed packages and bounded offline native repair acceptance
passed on 2026-10-04. Independent export comparison checked all 39 application
tables and 18 media files with only expected derived changes; cold native labs
and fresh patient Edit passed. Native testing also reproduced the retained root
Scope's stale Edit refusal. Fix explicit renewal without auto-remounting unregistered
manual input; a clean SaveGroup alone cannot establish a clean workspace.

2026-10-03, 0.11.21: the real-SQL witness reproduced an ordinary clinical write
acknowledged during restore and subsequently erased. Pre-commit admission now
guards native preparation, Drizzle execution and the public raw facade. Restore
uses explicitly injected, revocable authority; successful SQL replacement advances
an in-process generation synchronously, while failed replacement leaves it unchanged.
All Autosave schedulers retain their original token and hold admitted-writer leases
across async acknowledgement. Note/kardex manual writes and existing-record voice
actions carry the immutable token. Stale note/order input stays mounted for review;
confirmed exit is local only. See `validation-0.11.21.md` for actual gates.
This is deliberately pre-commit exclusion: ordinary queries can run during
post-commit housekeeping. Other manual forms, delayed raw-draft comparison/load/
discard handlers and unleased async query continuations still need generation
coverage. Next: finish those intent boundaries, then durable quick-capture and
draft-note voice acknowledgement. No speculative route/framework/dependency work.
Exact-source CI and both signed packages passed. On the isolated offline modern
emulator, old-archive restore retained actual mounted note input with disabled
Save and confirmed local-only exit. Independent export comparison preserved all
39 application tables and 18 media files exactly; cold fresh-intent opening and
empty application crash buffer passed. This is not native coverage of every editor
or physical-phone acceptance. Source review also found awaited row snapshots in
post-commit search/lab/version repairs; reproduce those races and move each repair's
read/write boundary into a synchronous transaction before broadening repair overlap.

2026-10-03, 0.11.19: native API 26 restore exposed an authenticated AES output
capacity tail in installed expo-crypto. The reader now accepts only exact plaintext
length or the observed extra 16 zero bytes, after authentication; archive/key
schemes and writer remain unchanged. Recording transitions/publication compare
the canonical owner including null, closing a future generic capture race before
enabling that journal for draft/capture UI. Evidence and remaining gates are in
[validation-0.11.19.md](validation-0.11.19.md).
Exact-source CI, signed packages, actual offline API 26 old/current SAF restores
and modern upgrade/full-archive preservation now passed. Comparisons distinguish
unchanged clinical fields from native reminder-id repair and known retained
unreferenced QA media; this does not close whole-dataset interruption safety.

Source review before 0.11.20 found photo jobs bypassing file-maintenance exclusion in
`attachments/capture.ts`; `LabsTab.photoPanel` separately picks, creates a panel
and stores its photo. Reserve before the first picker await through metadata
acknowledgement, covering the direct storage API and lab callback, including picker
errors. The bounded photo fix is below. Next address clinical-write admission during restore and dataset
generation fencing for loaded editors together. Busy checks alone cannot stop
an old editor from writing after replacement ends. Preserve its unsaved text for
explicit recovery rather than silently remounting/flushing it into the new data.

2026-10-03, 0.11.20: photo APIs now reserve before the picker/storage and retain
exclusion through metadata acknowledgement. The lab-sheet callback owns its
picker, panel creation and attachment work, catches picker rejection and guards
duplicate callbacks. Target/source inputs are captured; retired targets refuse
native work. Finalized witnesses failed on the old source and pass on the new
handlers. Current release gates are in
[validation-0.11.20.md](validation-0.11.20.md). This does not make photo recovery
durable or panel/file publication atomic; ordinary-write admission and dataset
generation fencing remain the next structural safety work.
Exact-source CI, signed owner/emulator packages, real offline lab-picker cancel
and gallery-photo publication now passed. Independent archives preserved all
old rows/files; the uncropped fixture's original bytes matched and all images/
prior voices decoded. Native held-picker overlap refusal was not established.
Physical-phone, ordinary-write/stale-editor and durable media gates remain open.

2026-10-03, 0.11.18: D03/D05/D10 now include a persisted stopped-voice journal for
existing records. Source and destination fingerprints, immutable operation id,
atomic attachment acknowledgement, retry without recorder cache after verified
copy, and confirmed reference-protected cancellation have SQLite/handler tests.
Failure-only controls use the original record and existing inbox. Lost native
completion also offers explicit discard before storage starts. This does not
complete draft/capture voice recovery or active/pre-journal interruption; native,
artifact and exact-source gate status is in
[validation-0.11.18.md](validation-0.11.18.md).

2026-10-01, 0.11.13: D05/D08 now include recoverable raw admission/edit/discharge
forms with explicit atomic publication, stale clinical-context refusal, confirmed
comparison/load/discard and visible auxiliary-read errors. This is a software
slice, not completion of all manual forms. Its exact-source CI, signed packages,
acknowledged raw-form force-stop recovery, invalid/valid publication, older/current
SAF restores and exact 38-table/original-WAV round trip on an isolated emulator
are recorded in [validation-0.11.13.md](validation-0.11.13.md). Physical-phone and
interruption gates remain open. That review reproduced two ordinary-media bugs:
a moved voice source cannot retry a rejected SQL insert, and attachment writes
accept a deleted patient. The 0.11.14 software slice fixes both: copied source,
same-file replay, synchronous target/owner checks, awaited recorder acknowledgement
and one grouped screen exit. It also refuses successful no-op draft writes, commits
capture voice/kind together and preserves recorded time. Validation and remaining
native/durable-operation gates are in [validation-0.11.14.md](validation-0.11.14.md).
Exact-source CI and signed 0.11.14 artifacts now pass; bounded isolated-emulator
recording/Back/tab/manual-stop, acknowledged cold draft/capture recovery, actual
SAF old/current restores, restored draft publication and independent 38-table /
seven-audio-file round-trip comparisons passed. This does not prove pre-ack
process-death recovery or complete ordinary-write/editor-versus-restore safety.
The preceding 0.11.12 source/artifacts/CI, actual SAF cancellation and full native
restore round trip are recorded in [validation-0.11.12.md](validation-0.11.12.md).
All 37 non-audit/backup/settings application tables and original WAV matched in
that small dataset. It does not close critical interruption or ordinary-write
and media/editor-versus-restore gates in D10/C05.

| ID | Required behavior | Status / acceptance evidence |
|---|---|---|
| D01 | Exact note history includes SOAP boundaries, doctor, metadata and text; no hash-based false equality; stable rapid-save ordering | Implemented; `notes/versions.test.ts`. Old snapshots remain readable. Missing historical versions cannot be reconstructed. |
| D02 | Note + history + restored draft state commit or roll back together | Implemented; SQLite failure-injection tests in `versions.test.ts`. |
| D03 | Publish persisted draft + note + versions + voice attachment metadata together; retry without duplicate note/audio | Implemented; `commit-draft.test.ts`. Files must already exist before transaction. 0.11.14 emulator recording, acknowledged draft recovery/restore and publication preserve one note/version/voice with original captured time (validation-0.11.14.md). Physical-phone and durable pre-ack media-operation recovery remain open. |
| D04 | Failed initial capture can retry; simultaneous filing creates one destination; attachment metadata and selected patient commit with filing | Implemented; `capture/captures.test.ts`. Conflicting destination/patient is refused. |
| D05 | All autosave fields show failure, retain latest text, offer retry and safe exit/recovery | Partial: note/capture route removal flushes and checks success; grouped shift/round fields flush before changing patient, opening editors, removing membership or ending shift. 0.11.5 also gates external shift/member/review changes; exact final text is retained on the original archived membership without revival, with an id-only recovery audit. Failed fields show retry. In-flight writes remain unsaved; group rechecks for new edits while another field writes. Explicit draft discard reports failure. Consult replies, unsubmitted service/question pairs and quick-add task titles now persist with stale-revision protection, explicit comparison and atomic publication. Task drafts recover inline per patient/global scope; patient tab/edit/delete actions flush the group, while later query errors retain the loaded editor. 0.11.11 adds persisted raw follow-up forms, background/leave flush, explicit comparison, confirmed load/discard and atomic idempotent publication with captured encounter; migrated-SQLite/component handlers pass. 0.11.11 signed-emulator acceptance covers acknowledged raw follow-up draft recovery after force-stop, invalid publish refusal, corrected publication, confirmed discard and current/older backup round trips (validation-0.11.11.md). Remaining: physical-phone/back/gesture coverage, raw drafts in other manual forms, media operation interruption, and concurrent editors in other flows. |
| D06 | Consult reply never inherits another consult's text | Implemented persisted per-consult draft and dedicated keyed answer screen. Atomic publish retires only that draft; retries do not change response time, closed/deleted records reject late writes, and failed writes retain the previous draft. SQLite and component-handler tests cover recovery, failure/retry and stale comparison rejection; old-backup SQL defaults tested. Native UI and process-death acceptance remain open. |
| D07 | Vitals distinguish blank from invalid, preserve partial BP and old values, record actual measured time | Implemented input/query guards and measured-time picker. 0.11.15 serializes validation/write, checks live patient/encounter ownership, preserves unrelated corrected fields and exact untouched notes, refuses same-field/BP-pair/time/encounter conflicts, blocks rapid duplicate submission and exposes read retry. `vitals.test.ts` and real-form handlers in `vitals-tab.test.tsx` use migrated SQLite. Bounded native create/cold-reopen/edit/invalid-input/time/soft-delete and independent archived SQL checks pass (validation-0.11.15.md). Available chart series no longer depend on default BP data, but 0.11.15 native review found a clipped endpoint date. 0.11.16 adds inward date anchors and bounded label sampling; pure/rendered checks pass, current native date acceptance is tracked separately. Raw form crash recovery and physical-phone acceptance remain open. |
| D08 | Read/write errors are visible without dropping input; sensitive deletes are audited | Partial: patient read/delete, diagnoses/vitals and consult status errors surfaced; vitals/diagnosis mutations audited. Task/round refresh failures retain loaded editors; initial note/draft read failures show an error instead of endless loading. Today, shift progress, inbox, open consults, unfinished notes, upcoming occasions and timeline now expose read failures with explicit retry; cached rows remain visible without unreliable totals or empty/success claims. Timeline names its failed sources. Error diagnostics are collapsed by default. Capture assignment keeps its picker after a write failure and prevents overlapping submits. Hook and migrated-SQLite component tests cover failure/retry boundaries. All 18 EditGate consumers now wire required error/retry inputs (patient edit added in 0.11.6); failed primary reads are distinct from loading/absence, and loaded forms retain local input. Tests cover 19 primary read paths (lab panel and values separately), plus retained lab/encounter text and existing draft flows. Button-started writes (delete, star, pin, status, settings) now report failures instead of dropping them (2026-09-26); encounter and note deletes are audited, and deleted notes restore from the trash. Shift/round active and membership read failures now withhold empty/completion claims, expose retry and retain loaded handoff text; round note/consult reads also have retry. Failed add-patient writes retain selection and block overlapping submits. Loading is distinct from zero. Calls retain their source/selection on failure (C05). 0.11.5 reads active shift and members in one snapshot, retains keyed inputs through external identity changes, rejects stale closed-shift additions/review/close actions, and preserves final text on an archived original membership. 0.11.6 also retains the manual patient editor on failed refresh/retry, omits non-editable star/tags from its write, and validates whole-year age without stripping invalid characters. 0.11.7 adds durable raw create/edit patient drafts, controlled raw birth-date recovery, guarded/background flush, atomic and idempotent publication, duplicate confirmation, field-level conflict comparison, confirmed soft discard, and current/older backup compatibility tests. 0.11.11 follow-up creation also gates initial draft reads and retains its editor on failed refresh/retry. 0.11.12 moves encounter liveness/status/count reads and writes into synchronous transactions; stale discharge is refused, imported duplicate encounters retain authoritative ordering, and status repair cannot overwrite an intervening discharge. Rapid manual encounter/discharge submissions are guarded; failed count reads retain the form. Backup provider/setting failures surface separately from true cancellation. Remaining: other auxiliary lookups/manual-form drafts, competing editors outside the covered flows, and native failure/process-death acceptance. |
| D09 | Rounds use newest note rather than pinned-first; deleted encounters do not appear current; one active membership per patient/shift | Implemented for new writes: synchronous membership transaction, parent/encounter ownership validation, alive encounter join, latest published note query independent of pin order. `shifts.test.ts` covers concurrent adds, re-add history, deleted parents/encounters, wrong-patient links and draft/pin exclusion. Existing/imported duplicate memberships are preserved, not silently merged; UI/device acceptance remains open. |
| D10 | Backup/restore remains compatible and verifies copy strength honestly | Partial: only byte-verified copies permit pruning; equal-size unreadable copies show weaker evidence and keep older backups. Unknown/failed verification never prunes. UUID names refuse overwrite; retention protects the new copy through clock rollback. 0.11.10 preserves older safety snapshots until a new nonempty copy succeeds, strictly reads recovery markers, excludes competing backup/restore/recovery before yielding, rejects missing original-schema core tables and handles post-commit failures honestly. Regression tests cover failure/race/rollback/retry boundaries. Isolated offline native SAF full backups, 0.11.9-to-0.11.10 restoration, wrong-key/corrupt-file refusal, exact eight-table/original-WAV round trip, cold reopening and a bounded early process-stop/retry passed; independent Node decryption and SQLite integrity checks are recorded in validation-0.11.10.md. 0.11.11 additionally round-trips the new raw follow-up drafts, published follow-up and unchanged original WAV through current and older archives (validation-0.11.11.md). 0.11.12 excludes whole call-file jobs from backup/restore/recovery and refuses changed/unknown archive entry lengths. 0.11.16 extends that reservation from recorder permission/start through stop and awaited metadata acknowledgement; failed operations retain it for retry and unmount cleanup waits for settlement. Software failure/race tests pass; current native lifecycle acceptance is tracked in validation-0.11.16.md. Remaining: physical phone, critical-media-swap/commit and power-loss interruption, ordinary clinical writes/photo/voice versus restore, full disk/provider grant loss and second-device recovery. |
| D11 | Follow-up clinical state and native reminder intent stay recoverable across failures | Implemented software slice: clinical writes precede native work; additive revision counters, deterministic reminder ids, strict cancellation and serialized repair avoid losing a record or acknowledging an obsolete request. Startup/foreground retry does not prompt for permission; cards expose unavailable reminders. Failed completion preserves its dialog text; deletes/status changes are audited. SQL failure injection, native stand-in failures/races, real notification wrapper, old-backup defaults and component handlers are tested. Actual Android alarm delivery, reboot/battery behavior and full interrupted restore remain open. Occasion parity is recorded separately in D12. |
| D12 | Occasion saves, doctor changes and native alarms remain consistent after failures | Implemented software slice: migration 0015, database-first validated writes, stable native ids, strict cancellation, serialized content/revision checks, repair of deleted/disabled rows and deleted doctors, rename refresh, startup/foreground/restore retry. Permission/native failure keeps the saved occasion and offers a compact retry; restore reports incomplete housekeeping. Deletions are audited. SQL/native failure, race, legacy-id/import and component tests cover these boundaries. Leap-day editing preserves Esfand 30; notification text uses the scheduled occurrence year. Initial read errors are visible, loaded form text survives refresh/save failure, and duplicate submits are guarded. Raw occasion drafts/autosave and actual phone delivery/lifecycle acceptance remain open. |

## Priority 1: complete everyday flows

| ID | Deliverable | Acceptance requirement |
|---|---|---|
| W01 | Inbox and task retrieval | Implemented retrieval slice: full matching totals, search and load-more for inbox/filed captures/tasks; patient/global task editor and completed/cancelled/deleted lists; reopen and restore; capture links open the actual task. Task text/outcome edits autosave with guarded exit. Quick-add titles persist as separate drafts until Add, recover inline and publish atomically without duplicates. SQLite/component tests cover overflow, ordering, partial edits, restore, draft recovery/conflicts and write failures. Remaining: device navigation/large-list performance and broad search coverage. |
| W02 | Shift history and rounds | Past-shift browse/detail implemented without restarting a shift. Removed memberships retain readable handoff notes; deleted patient identities are hidden. History deliberately omits current encounter location because it is not a historical snapshot. Remaining: persistent explicit reorder, optional editable ward/place/supervisor context (fast start currently records none), and device acceptance. Reviewed remains separate from tasks completed. |
| W03 | Priorities and due work | Task high/normal/low and consult emergency/urgent/routine use explicit tested SQL ranks. Known deadlines sort before undated tasks within a rank; closed history uses completion date. Task priority is editable. Date fields now report visible-input validity and all 13 existing consumer forms guard explicit save; invalid/incomplete text never authorizes saving the old date. Day/clock validity are independent. Task deadline editor now preserves raw incomplete date/clock drafts, applies validated schedules atomically, and offers optional patient/global reminders with repair after native failure. Task schedule recovery/conflicts, old-backup defaults and notification lifecycle have regression tests. Both open consult statuses now share the first rank before urgency; route-driven tab changes wait for autosave. 0.11.9 also fixes shared prompt first-Back/IME handling and backup Next focus; bounded native evidence is in validation-0.11.9.md. Remaining: physical-phone/software-IME, other editor exit/alarm acceptance and raw date drafts in other forms. |
| W04 | Patient summary | Identity, encounter/location, impressions, current problem, allergies with unknown state, relevant latest observations/labs with timestamps, medications and open work in a quick readable view. **Implemented 2026-09-26 (0.10.0):** the record's first tab leads with the episode card and «در یک نگاه» — last vitals, newest lab result per analyte that is flagged or unreadable, running kardex orders, last note's A/P, each with its age and one tap from its tab (`patient-snapshot.test.tsx`); allergies show «ثبت نشده» when blank, distinct from NKDA; problems, tasks, consults and follow-ups follow. Emulator-checked with fabricated data; phone acceptance and physician review of what belongs on it remain. |
| W05 | Clinical record completion | Encounter history/transfers, PMHx/conditions, medication lifecycle, consult response/follow-up, imaging location/report/result review, lab manual/paste/file import and units, timeline filters. Timeline read errors now name failed sources, retain available events, mark partial counts and retry failed reads. Unbounded assembly/rendering still needs measured large-record acceptance and bounded retrieval/one scroll owner if necessary. |
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
| C05 | Call workflow | Partial: post-call capture and user-selected folder/file/share import work without a built-in call recorder. Note/history/attachment/filename hint commit together, patient liveness is checked, historical audio retains time/encounter provenance, and failures retain source/selection. 0.11.8 adds a durable UUID journal/path reservation before copy, streamed SHA-256, verified-copy retry without the provider, atomic retry links, simultaneous-retry serialization, pending recovery and confirmed cancellation/cleanup on the existing Calls screen. Ready retries refuse changed bytes; deleted clinical records are not recreated. Cancelled cleanup remains visible until finished. Filename hints and Today counts no longer claim content identity; equal-name folder rows/playback use URI identity. The existing DocumentPicker now preserves the provider's display name; failure feedback remains visible inside its patient picker. Bounded isolated-emulator evidence covers staged upgrade, offline WAV import, failed-request recovery/retry/cancel, same-UUID replay after force-stop reopening an edited note, original-file preservation and large-font recovery actions; see validation-0.11.8.md. 0.11.12 holds an in-process file-job lease through journal/copy/hash/commit or cancel/cleanup; backup/restore/recovery refuse competing jobs before yielding, and imports refuse maintenance. Software tests cover the exclusion and busy auto-backup race. Remaining: real Cube recording/share and grant/recreation acceptance, native interruption/power/low-space, ordinary writes/photo/voice versus restore and native concurrent-import acceptance, older orphan copies and content-based duplicate detection. A fresh explicit import deliberately creates a new operation. |

The WHO SMART publications separate data dictionaries, decision logic and functional
requirements: [WHO SMART](https://smart.who.int/). This is an engineering reference,
not validation of MedOS. Sources must be checked individually for the actual tools.
Android recording constraints must be assessed against its
[AudioSource API](https://developer.android.com/reference/android/media/MediaRecorder.AudioSource)
and device behavior. Another AI's statement or a successful build is insufficient.

## Priority 3: usability and release evidence

- 2026-10-01 (0.11.9): shared prompt first Back hides the IME and retains text;
  backup setup's Next focuses confirmation. Final local gate: 83 suites / 973
  app tests + 3 workflows. [Validation evidence](validation-0.11.9.md) records
  signed owner/emulator artifacts, isolated offline upgrade, prompt discard/
  reopen/empty/unchanged/backdrop/Cancel checks and a bounded large-font/dark
  dialog check. Focus was tested with hardware Enter; software-IME Next and
  physical-phone acceptance remain open. No dependency, permission, route,
  schema, cryptographic scheme or extra UI feature was added.

- 2026-10-01 (0.11.8): resumable audio imports with same-operation retry,
  confirmed cancellation, honest filename/time labels and visible failed-import
  feedback on the existing screen. Final source gate: 82 suites / 966 app tests
  + 3 workflows; exact-source CI passed. [Validation evidence](validation-0.11.8.md)
  records signed final arm64/x86_64 artifacts and bounded isolated offline
  import/replay/recovery/cancel/large-font checks. APK delivery now rejects missing
  essential native libraries and wrong/mixed ABIs. Real-recorder grants, native
  interruption/restore and physical-phone acceptance remain open. No dependency,
  permission, route, backup format or clinical-tool scope change; migration 0017
  adds the import journal.
- 2026-09-30 (0.11.7): durable raw create/edit patient drafts, explicit validated
  atomic publication, idempotent retry, guarded exit, duplicate/conflict handling
  and confirmed soft discard. Final gate: 78 suites / 907 app tests + 3 workflows;
  exact-source CI passed. [Validation evidence](validation-0.11.7.md) records
  signed final arm64/x86_64 artifacts and bounded offline upgrade, completed-save
  recovery, invalid-input rejection, edit/publication/discard and large-font
  navigation checks. Other manual forms, permanent patient-field history,
  uncommitted/native interruption, restore and physical-phone acceptance remain
  open. Migration 0016 is additive; backup format/dependencies/routes unchanged.
- 2026-09-30 (0.11.6): shift identity changes preserve keyed text before
  adoption; patient edit retains input on read failure and validates whole-year
  age. Final software gate: 76 suites / 868 app tests + 3 workflows, source CI
  passed. [Validation evidence](validation-0.11.6.md) records signed arm64 and
  separate x86_64 artifacts, an upgrade from 0.11.4, bounded offline editor,
  round/history and font/keyboard/navigation checks. Manual-form raw drafts,
  concurrent editors, native failure/recovery and target-phone acceptance remain
  open; these changes add no dependencies, schema or clinical-tool scope.
- 2026-09-30 (0.11.4): [plans/001-005](../plans/README.md) implemented and software
  verified (76 suites / 832 app tests + 3 workflow tests). Exact filtered destinations,
  honest draft/inbox labels, readable controls, shift-first Today, full follow-up
  lists and an autosave-preserving round footer. The record star also reports failed
  writes. [Validation evidence](ux-validation-0.11.4.md) distinguishes signed arm64
  packaging, bounded x86_64 emulator runs and remaining native/phone acceptance;
  this does not close D08/C05 or the wider clinical backlog.
- Packaging cleanup verified: direct Ionicons imports removed 18 unrelated fonts and
  4,017,947 combined font/bytecode bytes from the Android export. ESLint blocks the old
  barrel import. APK size, startup improvement and visual/device acceptance are unmeasured.
- Today leads with current shift/patients and due actions. Secondary sections use
  short previews and view-all; empty-state wording reflects all actual work.
- Collapse optional add forms; keep a fast single action for capture. Replace long
  instructional prose with clear labels and transient save/error feedback.
  2026-09-26 (emulator pass): the consult form folds behind «+ کانسالت», add buttons are
  the soft style, the record's eight tabs are a 4 x 2 grid instead of an off-screen strip,
  the capture button floats on Today, and name search reaches discharged patients.
- Emulator acceptance is available without the phone (x86_64 build, AGENTS.md §7). The
  2026-09-26 pass found a crash on every note save (react-native-screens #4429) that no
  test could see; it is fixed and guarded by lint. Walked on the emulator: new patient,
  note new/edit/back/header-save, capture, shift and round, consult, diagnosis, admission
  and its guarded delete, kardex order, CBC entry, trash restore, More, backup and
  settings screens. Still owed on the phone: everything native-specific (camera, voice,
  notifications, backup to the chosen folder, three-button navigation).
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

## External review disposition

The [2026-09-24 claim check](external-review-2026-09-24.md) distinguishes verified
repository defects from claims about an unavailable Flutter plan. Its suggestions do
not authorize a stack rewrite, multi-user/HIS workflows or removal of requested CRM
features. This ledger remains the execution source of truth.

## Handoff discipline

Each change must leave a focused commit with Agent trailer, rationale in architecture
only when a design decision changes, regression evidence, and a latest handoff with
the exact **Open threads** heading. Update this ledger as work passes acceptance;
keep the wider requested scope visible. A milestone is not complete just because its
tables or screens exist. Delegation follows the current owner limit at the top of
this ledger; the primary agent owns integration and verification.
