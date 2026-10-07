# MedOS project and pull-request audit — 2026-10-07

**Reviewer:** GPT-6 via Codex, solo. **Purpose:** decide whether the five open PRs
improve the owner's clinical workflow without introducing misleading records,
data loss, extra navigation, or speculative features.

## Conclusion

The project has a substantial, useful foundation. Keep its Android/offline SQLite
architecture and finish the clinical workflow before considering a rewrite. The
five PRs are not collectively ready for main. PR 2 contains a useful small fix;
PRs 3 and 5 contain useful ideas with integration defects; PRs 1 and 4 have
blocking clinical-record/workflow problems. None was merged, approved, closed,
or commented on remotely during this review. The review experiment is separate
from the released application.

There is no evidence that MedOS already replaces paper across a complete busy
shift, outperforms another product, or has no remaining bugs. Existing screens,
green CI, a successful APK build, and software tests are different kinds of
evidence. The next acceptance target should be an offline 40-patient shift on
the owner's phone, with interruption/recovery and measured common actions.

## 1. Evidence and exact scope

The audited main source is `466a1a886bba55b05defed59a1b741c7f7e21b5d`, version
0.11.26 / Android code 42. Its ordinary check passed 117 suites / 1507 app tests
and three workflow tests. Exact-source CI `37573104289` was read directly as
completed/success. Native acceptance of that standalone version had not run
when the owner redirected work to these PRs. The subsequent 0.11.27 scope is
recorded separately in [validation-0.11.27.md](validation-0.11.27.md).

All five PRs were fetched and attached to the task. Titles, descriptions, changed
files, production diffs, relevant full implementations and tests were inspected.
All share merge base `6fe73d10f19b5ae09d9683455070710cf68f50e9` (0.11.15),
eleven application patch versions behind the audited main. Their old green CI
does not establish compatibility with main's newer restore/intent protections.

| PR | Exact reviewed head | Verified CI run | Recommendation |
|---|---|---|---|
| [1 — clinical AI copilot](https://github.com/CodeinScrubs/medos/pull/1) | `507e0d0d2846e71043ad6c58ec8809b4f5902723` | `37052219278`, success | Block as submitted; redesign as a durable, provenance-bound draft workflow |
| [2 — consult answer guard](https://github.com/CodeinScrubs/medos/pull/2) | `98550ee4534ff8d6bd99c085fd774bb7119b9ab2` | `37036415654`, success | Port the small acknowledged-publication lock while retaining current protections |
| [3 — bedside round view](https://github.com/CodeinScrubs/medos/pull/3) | `5b90da18750bad6df84c923a5a72b77ff98a0f95` | `37039761040`, success | Changes required: units, age, held state, overflow and compactness |
| [4 — consult referral actions](https://github.com/CodeinScrubs/medos/pull/4) | `80223bdecf375ec2e86f52e0399e0bd5690c2406` | `37053419683`, success | Block false completion; preserve draft/context and confirm the actual action |
| [5 — impression autocomplete](https://github.com/CodeinScrubs/medos/pull/5) | `a331e6f283f458761f364fc2cd27b4f395aa78b8` | `37045210904`, success | Changes required: latest-input ref, normalization, optional non-destructive suggestions |

An owned isolated checkout first passed the unchanged baseline check. All five
PRs were then integrated locally onto 0.11.26 with explicit conflict resolution
that preserved its original dataset intent and always-on answer removal guard.
That experiment passed 123 suites / 1530 app tests and three workflow tests.
This shows why green existing tests alone were insufficient.

New targeted witnesses produced **24 failed checks and one passing rollback
check** across four suites. These are not 24 distinct bugs: several assertions
exercise the same defect, and some pin an unmet product requirement. Clinical
outcomes use real migrated SQLite, not mocked successful writes. Clipboard,
linking, navigation and component rendering are stand-ins, so these witnesses
are not native UI evidence. Exact fixtures and reproduction instructions are in
[reviews/2026-10-07/README.md](reviews/2026-10-07/README.md).

Findings below distinguish **reproduced** behavior from **source-reviewed** gaps
and **unmeasured** acceptance requirements. No real patient or model API was used.
Statements such as “100% coverage” or “under two seconds” in a PR description
need a coverage report or a timed workload; the inspected checks do not establish
those claims.

The later 0.11.27 source `f6c9277` passed 118 suites / 1515 app tests plus three
workflow tests and exact-source CI `37577506830`. Its signed x86_64 package
upgraded the existing QA installation offline without clearing data. Independent
full-archive comparison preserved all 39 application tables and 18 media files
exactly. An old answer form retained input after restore and refused publication
without changing those rows/files; a fresh answer survived cold reopen, with only
its expected consultation changes and one answered audit event. See the separate
validation record for artifacts, exclusions, QA tool issues and remaining limits.
No proposed PR UI, AI output, external delivery or 40-patient speed is certified
by that bounded native run.

## 2. Blocking PR findings

### PR 1: preserve clinical meaning before adding an AI workflow

Primary files: `features/ai/dossier.ts`, `queries.ts`, `parser.ts`,
`ai-consult-modal.tsx`, and `plan-staging-modal.tsx` under the mobile source.
Thirteen selected checks failed; the transaction rollback check passed.

| ID / priority | Evidence and concrete failure | Required change / acceptance |
|---|---|---|
| AI01 / P1 | **Reproduced:** an empty allergy field becomes `NKDA (No Known Drug Allergies)` in the exported dossier. Source also substitutes `Adult`, `Other`, and `None reported` for absent demographic/history data. | Blank must remain unknown/not recorded. Explicit negative findings need an explicit recorded assertion. Test blank, explicit none, positive history and incomplete demographic input. |
| AI02 / P1 | **Reproduced:** de-identification removes the identity header but exports a synthetic patient's name/phone from free-text notes. The UI encourages pasting this into external chatbots. | Remove the “de-identified” guarantee. The locked project contract does not allow third-party patient-data transmission. A future export needs an independently reviewed data policy; removing header fields or adding a phone regex is not general anonymization. Keep local draft processing possible. |
| AI03 / P1 | **Reproduced:** orders still active in a previous encounter appear in the new encounter's dossier; current `patientOrdersQuery(patientId, encounterId)` correctly excludes them. Diagnosis projection drops `kind: rule_out`. | Reuse the current episode/standing-order rules; preserve diagnosis certainty/kind/status and provenance. Test re-admission, closed episodes, standing orders, rule-out/impression/confirmed/resolved states. |
| AI04 / P1 | **Reproduced:** a medication-only commit accepts an encounter belonging to another patient. Individually valid foreign keys do not enforce this relationship. Clearing a selected medication name stores an active blank order. | Validate the entire reviewed input inside the transaction, including patient/encounter ownership and live state. Share existing query invariants instead of bypassing them with unchecked raw inserts. Reject the whole invalid plan, retaining the draft. |
| AI05 / P1 | **Reproduced:** a retained staging modal commits into a restored dataset with the same row ids. A plan reviewed on encounter A silently uses newly active encounter B at commit time. | Capture immutable dataset generation, patient, encounter and source revision when preparing the draft; carry them through delayed callbacks and final acknowledgment. Refuse stale context without discarding input. Never resolve a fresh encounter implicitly in an old plan. |
| AI06 / P1 | **Reproduced:** medication duration is committed but not visible/editable in staging. `99 days` in the synthetic plan is absent from the review inputs. | Every field written must be shown and reviewable, including duration/instructions/timing. Default proposed clinical entries to unselected; keep AI output a draft and require explicit physician selection. A generic confirmation heading is insufficient. |
| AI07 / P2 | **Reproduced:** valid JSON scalar input throws because `in` is used on a string; object-shaped drug input becomes selected `[object Object]`. | Use a bounded, versioned, strictly validated input format with the existing validation dependency. Preserve raw input and actionable errors. Do not guess a clinical plan from arbitrary Markdown/YAML prose. Test scalar/null/array/object, wrong field types, size limits, malformed payloads and unsupported versions. |
| AI08 / P2 | **Reproduced:** after the first successful plan, the same modal ignores a second distinct plan because its submission ref and saving state stay locked. | Scope the submission mutex to one immutable operation, reset only for a genuinely new operation, and make SQL publication idempotent by operation id. Test failure/retry, double taps, reopen and two separate successful drafts. |
| AI09 / P1 | **Reproduced:** reopening the dossier allows copying the old cached summary while a refresh is pending. | Show patient/episode and source time; disable export until a coherent current read completes. Preserve cached display as stale only if explicitly labeled. Failure must offer retry and must not masquerade as loading or current data. |

Additional source-reviewed gaps:

- Dossier fetches use multiple awaited reads rather than one coherent snapshot.
  They can mix clinical revisions. A modal-local effect cancellation flag is not
  a dataset ownership boundary.
- Recent-row limits silently omit information: 20 lab values, six consults,
  ten tasks, four queried notes and three exported notes. Task ordering uses
  descending due time; older urgent pending work can be absent. Include complete
  relevant pending work, explicit omission counts and selection rules.
- The note query does not exclude drafts. Export discards SOAP S/O and can
  omit body text when A/P exists. Measured blood glucose is not projected.
  Date-only export drops recorded clocks and admission-time uncertainty; use
  the established date/elapsed-time helpers instead of new parallel semantics.
- Raw pasted replies and staging edits are transient component state. Closing,
  process death and a delayed clipboard read can lose or overwrite them. There
  is no durable provenance record linking the raw reply, reviewed fields,
  clinical source snapshot, schema/model/source and committed operation.
- `void audit(...)` is outside the publication transaction and unacknowledged.
  A retry after an unknown acknowledgment needs durable idempotency, not only
  an in-memory boolean.
- Clipboard/share failures are dropped; failed initial fetch leaves no useful
  retry path. Android Back can close during publication through `onRequestClose`.
  Fixed modal footers lack the project's safe-area/keyboard/removal contracts;
  actual obscured taps or lifecycle crashes were **not** reproduced on a device.
- The overview gains both a prominent AI card and a header entry, plus two
  modal layers. English implementation labels such as “Staging Gate” add no
  useful clinical information. This competes with the patient's immediate work.

Keep the useful idea—assembling a faithful record and reviewing a draft—but do
not equate a prompt requesting a therapeutic plan with a clinically validated
assistant. First implement the owner's stated transcription, retrieval,
organization and progress/discharge draft goals. Do not introduce a cloud SDK,
vector service or therapeutic order parser just to appear AI-ready.

### PR 4: preparation is not requesting or sending

Primary files: `features/consults/consult-share-modal.tsx`, `logic.ts`,
`consults-section.tsx`, and `patients/overview-tab.tsx`.
Six selected checks failed.

| ID / priority | Evidence and concrete failure | Required change / acceptance |
|---|---|---|
| REF01 / P1 | **Reproduced in four paths:** Copy, SMS composer, WhatsApp and dialer opening move the real consultation from pending to requested. The UI claims it was sent although neither sending nor a completed call was observed. | Keep preparation/opening separate from the existing explicit “requested” action. Only physician confirmation changes the clinical workflow status. Test cancel/back/external-app failure and actual manual confirmation. |
| REF02 / P1 | **Reproduced:** an old Copy callback changes consultation/audit rows after dataset replacement. | Retain original dataset intent and target snapshot; fence clipboard/native work and delayed confirmation through acknowledgment. Refuse old actions and preserve the prepared text. |
| REF03 / P2 | **Reproduced:** repeated same-turn SMS callbacks open the composer twice. | Add one operation mutex, disabled busy controls and caught promises. On failure keep the preview open, show retry and retain content. Do not auto-close after a status failure. |

Source-reviewed: the Copy handler drops a clipboard rejection; message creation
includes patient identifiers by default; preview/context can become stale. The
PR tests mock status mutation and assert the wrong automatic transition, so they
certify behavior that violates the product contract. Some new fixtures also
contain owner-context locations/phone details prohibited in this public repo;
replace these with synthetic generic fixtures before publication. Those details
are deliberately not copied into this report.

The useful part is a previewable, editable referral draft with a chosen recipient
and quick access to existing contact actions. Avoid an extra confirmation after
every harmless Copy; make the clinical “requested” action distinct and explicit.
Never rename external-app opening to successful delivery.

## 3. Useful PRs needing precise integration

### PR 2: acknowledge once, retain the current exit guard

The proposed committed lock is useful for a completed answer route. The existing
query is already idempotent; the real residual problem is repeated navigation
and later editing of a route that has already published. Do not describe this as
proof of repeated clinical inserts.

The old PR conflicts with 0.11.26's always-on removal guard and ownership lease.
Keep those protections. Lock only **after SQL acknowledgment**, allow a genuine
SQL failure to retry, and report navigation failure separately from a saved
clinical reply. Never unlock the saved reply merely because `router.back()`
fails. These requirements were implemented independently on main with real-SQL
tests for repeated taps/late input, failed navigation, and failed publication/
successful retry. This does not remotely merge or approve PR 2.

### PR 3: compact clinical context, not three more misleading cards

Three selected checks failed in `features/shifts/round-screen.tsx`:

1. **P1, reproduced:** flagged values omit their recorded units. `3 mg/dL` is
   displayed as a bare `3`.
2. **P1, reproduced:** `isRunning` includes held orders; the new drug card does
   not label them held. They look like active administration.
3. **P2, reproduced:** a seventh flagged result is silently hidden by the six-row
   cap, with no count or direct indication of more results.

Source-reviewed: one latest timestamp labels values from several collection
times; non-drug orders are titled medications; the first five orders are an
arbitrary preview, not an established antibiotic stewardship view. No timed
40-patient or large-font/device test supports the speed/usability claims.

Use a shared, scoped clinical read model or reuse the semantics of the existing
patient summary. Each displayed result retains value, unit, flag and age. Held
and discontinued orders must be distinct; missing units are explicit. Show
overflow counts and one-tap access to the full section. Place pending actions
where they remain reachable without scrolling through several new cards.
Preserve the existing membership-id cursor, grouped autosave and original intent
when switching patients. “Reviewed” must not complete the patient's tasks.

Main's existing patient summary also omitted lab units and could imply that an
older analyte shared the latest sample's age. The small 0.11.27 fix addresses
that existing defect without adopting the entire proposed round layout.

### PR 5: optional suggestions must save the actual selected text

Two selected checks failed:

1. **P1, reproduced on current main integration:** the chip updates `setTitle`
   but not `latestTitle.current`. The screen shows `Atrial Fibrillation (AF)`;
   Add saves `AF` to real SQLite. Route all typed and selected changes through
   one function that updates the latest-input ref, state and persistence intent.
2. **P2, reproduced:** Arabic-keyboard Yeh does not match the Persian Yeh in
   the catalog. Reuse the project's text normalization/search rules rather than
   parallel lowercase/substring logic.

Source-reviewed: selection ignores the busy submission state; chips need an
accessible button role and an adequate touch target. The hardcoded catalog
contains broad-to-specific expansions (for example `Hernia` to `Inguinal Hernia`)
and ambiguous abbreviations. That observation is about lost specificity, not a
validated clinical dictionary assessment. Keep physician-entered free text and
certainty; never expand or diagnose automatically. Prefer previous owner-used
terms and explicitly selected, reviewed catalog entries. No measured evidence
establishes the proposed two-second entry claim.

## 4. Current architecture: what to retain and improve

### Retain the useful foundation

- One local physician workspace, Android APK, Persian RTL/Jalali chrome and
  Latin clinical values. Single-device local data is the v1 source of truth.
- Patient identity separate from encounters, shifts, tasks, consults, labs,
  imaging, medication orders, attachments and notes. Do not collapse these
  into a generic nine-table record store or a universal graph/metadata table.
- Expo/React Native, expo-router, Drizzle/SQLite, typed settings and feature query
  boundaries. No measured framework limitation justifies discarding the existing
  clinical, backup, RTL and regression work for Flutter.
- Additive migrations, soft deletion, frozen backup/key schemes, original media,
  meaningful note versions, synchronous transactions and real-SQL tests.
- Immutable dataset intent, admitted-write/file-operation leases and one grouped
  autosave/removal guard per editor. They are complex because replacement/media
  acknowledgment is complex; new features must reuse them, not bypass them.
- Current SQLite startup explicitly sets WAL, `synchronous=FULL`, foreign keys
  and a busy timeout. The old claim that it relies on an unknown synchronous
  default is no longer current. FULL does not persist uncommitted keystrokes or
  independently prove physical power-loss survival.
- `useLive` already watches joined tables, coalesces notifications and retains
  loaded state after refresh failure. Do not propose a new event bus or blanket
  audit-trigger refetch optimization without measuring a real problem.

### Improve boundaries and completeness

- **Reusable read semantics:** current-episode orders, latest-per-analyte labs,
  diagnosis certainty and read-error handling should have one reviewed meaning
  across overview, rounds, search and future drafts. Reusing UI wholesale is
  not required; sharing a typed read projection is sufficient. Do not add a
  general repository/service abstraction for every trivial query.
- **Clinical summary ownership:** `patient.summary` is manual and can diverge
  from later diagnosis/encounter changes. Define whether the card shows the
  owner's manual current problem, episode impressions or both. Do not silently
  overwrite it or derive a confirmed diagnosis from free text. This is a
  source-reviewed consistency risk, not a reproduced wrong-diagnosis incident.
- **Read failure honesty:** `PatientSnapshot` does not include encounter-read
  errors in its combined notice and supplies no summary retry. This remains a
  source-reviewed gap. A failed context query must not look like “no orders.”
- **Durable recovery:** note/capture drafts and several raw forms persist, but
  mounted text preservation is not universal crash recovery. Durable stopped
  voice publication is implemented for existing records, not yet fully wired
  for new note/capture drafts. Contact/manual lab raw fields and remaining
  feature editors require their own recovery acceptance.
- **Restore is more than an atomic SQL transaction:** independently verify files,
  raw drafts, revisions, original media and reminders together at critical
  interruption points. A successful ordinary restore round trip does not cover
  process death or low-space failure at each step.
- **History/trash:** note history is not full version history for every clinical
  entity. Soft deletion without a usable restore path is incomplete protection
  against a mistaken tap. Preserve old backups and add explicit recovery paths.
- **Documentation drift:** the roadmap is a feature inventory with historical
  phone claims and old counts. Treat the newest HANDOFF/IMPLEMENTATION/validation
  as current evidence; do not copy its check marks into a release-complete claim.
- **Portability is selective:** `lib/ids.ts` uses Expo Crypto, and native crypto
  bindings are part of the backup implementation. Do not assume the whole lib
  folder is device-independent merely from its name or the layer diagram. Keep
  pure clinical/text contracts portable; isolate a native binding when a real
  second runtime needs it, preserving existing cryptographic test vectors.

### Dependency advisories require triage, not automatic framework changes

After the application source freeze, a bounded `npm audit --omit=dev --json`
completed on the unchanged lockfile. It reported 81 affected packages (one
critical, 65 high, 15 moderate), but only **seven underlying advisory records**.
Severity propagates through Expo/React Native dependency chains. “Production” in
npm's graph includes build/development utilities installed by Expo; it is not
evidence that all 81 packages or vulnerable paths execute in the signed APK.
No dependency was changed in this patch; these are a separate, open maintenance
finding, not introduced by the five PRs. Full independent exploit reachability
was not established.

| Locked underlying package | Source-verified advisory / patch status | Next action |
|---|---|---|
| `shell-quote@1.10.0` | [Critical command quoting advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), patched in 1.11.0 | Prioritize a compatible locked update. Its recorded parent is react-devtools-core with `^1.6.1`; reproduce safe quoting without executing injected commands, then run checks/bundle/native inspection. |
| `source-map-js@1.2.1` | [Source-map offset DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), patched in 1.2.2 | Compatible locked update under postcss `^1.2.1`; check source-map/bundle behavior. |
| `decode-uri-component@0.2.2` | [Malformed decoding DoS](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), patched in 0.5.0 | Parent query-string asks for `^0.2.2`; a forced override crosses its compatibility range. Trace actual link parsing, test bounded malformed input and choose a supported parent upgrade/compatible mitigation. |
| `node-forge@1.4.0` | [RSA verification advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), no patched version listed | Trace Expo CLI/code-signing use and applicable inputs; track upstream. Do not change MedOS AES backup schemes or APK signing based on an unrelated package name. |
| `braces@3.0.3` | [Nested-pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), no patched version listed | Parent micromatch; inspect externally supplied patterns versus controlled build globs and apply supported depth/input handling if exposed. |
| `sprintf-js@1.0.3` | [Unbounded precision advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), no patched version listed | Recorded parent is argparse in coverage tooling. Determine whether any untrusted format reaches it; upgrade/remove through the owning tool when supported. |
| `uuid@7.0.3` | [v3/v5/v6 buffer-bound advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq), patched families include 11.1.1 | Recorded parent xcode requires `^7.0.3`; a major override needs compatibility review. MedOS ids use `Crypto.randomUUID()`, not these buffer APIs. Do not rewrite patient ids or historical records. |

Patch availability and affected ranges were independently checked against the
linked GitHub advisory pages on 2026-10-07. An initial unbounded registry attempt
was cancelled; the bounded retry produced the actual report. npm suggested
framework downgrades such as Expo 44.0.6 and old native libraries through
`fixAvailable`; these are resolver suggestions, not a compatible MedOS upgrade
plan. Do not run `npm audit fix --force` or add broad overrides to make a counter
zero. Preserve Expo/RN compatibility and validate each selected change separately.

## 5. Product fit: a shift should feel like one workspace

The main competition is the owner's paper plus habitual phone notes. The product
must reduce locating, remembering and rewriting work. A large number of modules
or an AI banner does not establish that gain.

Official deployed Epic mobile descriptions include patient lists, medications,
allergies, history, results and clinical documentation; some features are
specifically listed for Canto rather than Android Haiku. These are useful workflow
benchmarks, not measured MedOS performance comparisons.
[Inova's EpicCare mobile description](https://www.inova.org/for-physicians/epiccare-mobile-apps).
The following design recommendations are inferences from those workflow patterns
and the owner's stated shift, not evidence of feature or speed parity.

### A. Keep the opening screen focused

Current Today contains the shift card, several counts, follow-ups, tasks,
an admitted-patient preview, calls, inbox, open consults, draft notes and upcoming
items. Each may be useful, but all are competing for the same first screen. Its
general admitted-patient preview is not identical to the current shift roster.

Recommended first screen during an active shift:

1. Hospital/ward/shift context with the actual current roster.
2. Each compact patient row: name, age/sex, ward/bed, elapsed admission duration
   with known/assumed time, current impression/problem, and next pending action.
3. Stable Search and Quick Capture, reachable without selecting a template.
4. Remaining personal/global work in an expandable or secondary area.

There should be one current-worklist concept. A “Today” area should be a view of
that work, not a separate workflow requiring duplicate setup. Keep global tasks
available without forcing them into a patient. Do not add urgency colors or a
mandatory severity classification that the owner explicitly deferred.

### B. Keep the patient obvious through every action

Show identity and active encounter in the patient workspace, relevant editors,
round transitions and draft confirmation. Use a compact clinical summary and
the next actions first; detailed history, media and previous episodes remain
one deliberate section away. Keep existing tabs recognizable; do not add a
new modal for every module or an extra duplicate header shortcut.

Quick capture must work before complete structure, with durable local
acknowledgment. Later manual organization must preserve the original text,
recorded time and attachments. “Ask radiology” can be a raw capture now and a
patient task later; AI may suggest structure, but may not silently finalize it.

### C. Rounds should support action and safe handoff

Keep one patient at a time, previous/next, a visible remaining count, important
facts and pending tasks/consults. Navigation flushes the grouped editor and
blocks only when recovery is required. Details open directly at their actual
section. Ending a shift does not discharge its patients, close encounters or
mark unfinished clinical work complete. Carry unfinished work explicitly to the
next shift/handoff without recreating duplicate tasks.

### D. Bloat to reject, useful secondary modules to keep

Reject duplicated AI entry points, large permanent explanations, internal
implementation words, decorative statistics, mandatory tagging/questionnaires,
parallel capture systems, a new graph database, speculative cloud infrastructure,
and framework/dependency churn without evidence. Do not add telemetry, accounts,
billing, collaboration or a new credentials vault.

Doctors/ratings/referrals, places/extensions, medical knowledge/teacher links,
specialty research, owner-written prescription templates and ideas are explicit
owner requirements. They are not unwanted bloat; keep them organized in secondary
navigation rather than competing with active patients. Keep credentials a simple,
reliable notebook as requested. Place recovery/diagnostic controls on failure
paths, not between the physician and an ordinary note.

## 6. Goal coverage: existence is not acceptance

| Owner goal | Current evidence / gap | Completion criterion |
|---|---|---|
| Manage 20–40 active patients and remember their next actions | Patient/encounter/shift/round/task screens exist; no complete timed busy-shift acceptance | Correct current roster, brief clinical context and next action; complete the synthetic shift script below on the owner phone |
| Fast note/progress/history/consult capture | Templates, persisted notes/drafts and consult workflow; some manual-field and voice interruption gaps remain | Acknowledged text/media recover after interruption; no wrong patient/episode; minimal taps and no duplicate publication |
| Kardex, start/day/frequency, stop/hold | Query/schema/screens exist; new PR display loses held distinction | Preserve current-episode/standing scope, exact fields and status; medication-day meaning is separately documented |
| Manual/Excel/photo labs and trends | Manual, tabular paste, lab-sheet images and trends exist; direct `.xlsx` is not implemented | Units/value qualifiers/reference ranges and collected time survive import/edit/backup; direct import includes review and conflict handling |
| Clinical photos, original/crop/compare, imaging location | Original/media/imaging flows exist; interruption and complete comparison UX still need acceptance | Original bytes preserved, reversible crop/preview, captured time and comparison, explicit external image location |
| Voice everywhere; Persian/English transcription | Recording exists in several flows; durable new-draft/capture stop journal and transcription are not complete | Defined target coverage, reliable recording/stop/retry/cold recovery, then reviewed transcript retaining original audio |
| Follow-ups, patient/companion contacts, calendar | Patient/global tasks, follow-ups/schedules/contact screens exist | Real alarm permission/reboot/clock tests; exact due time and call target; no success claim from opening a dialer |
| Doctors, specialties, ratings, private social notes and messages | Feature model/screens exist; broad device and autosave acceptance incomplete | Fast filtered lookup/referral; private notes stay local; schedule prepares and explicit owner action records sending |
| Knowledge, teacher links, specialties, personal prescription templates and ideas | Existing knowledge modules | Recoverable editing, meaningful hierarchy/search, correct source/teacher link and readable export without pretending templates are validated recommendations |
| Rich visual note editor | Plain-text/SOAP foundation; a full rich-text document model/editor is not delivered | Versioned reversible codec, old text/history fidelity, Persian RTL/English/IME/clipboard/voice compatibility and crash recovery |
| Organized credentials | Simple credential UI exists; no vault needed | Reliable save/recovery/search/copy; no extra biometric gate or forced workflow |
| Automatic backup and full restore | Encrypted local full backup, SAF/manual/background paths and historical compatibility tests exist | Last successful verified destination is honest; off-device independent copy chosen by owner; restore interruption/low-space/phone acceptance |
| Exact and semantic search | Normalized conventional search exists; semantic retrieval is not implemented | Search relevant fields and incomplete drafts with filters/failure feedback; future semantic results cite original records without overwriting them |
| Full reversible clinical history | Meaningful note history and soft deletes are substantial; all-entity history/trash is not complete | Explicit per-entity revision/recovery policy, no automatic pruning of promised note versions, reviewable mistaken-delete recovery |
| Manual reordering and moving records between sections/patients | Shift membership sort keys and query support exist; persistent explicit reorder and broader move acceptance remain open in IMPLEMENTATION W02/W07 | Persist intentional display order with an accessible alternative to dragging; never change clinical occurrence times. Cross-patient moves require explicit destination identity, retained provenance/links, audit and undo; simple reordering needs no extra confirmation |
| Sourced scores/algorithms and AI drafts | Validation contracts exist; chat-derived formulas or generic AI staging do not satisfy them | Per-tool evidence and physician review; explicit units/inputs/freshness/population; outputs remain drafts and never auto-order |
| Future web/private server/desktop | Deferred by owner | Stable ids/formats/domain semantics now; device identity and conflicts designed before sync; no current network dependency |

## 7. Prioritized execution and acceptance

This is the audit's rationale and proposed acceptance detail. `IMPLEMENTATION.md`
remains the execution ledger; do not create a competing task system.

### M0 — Finish a safe PR decision

- Retain all newer main protections; rebase each revised PR onto an explicit
  current main SHA. Give each PR one clinical/user outcome.
- Keep PRs 1/4 blocked until their P1 contracts pass. Prefer splitting summary
  preparation/durable draft review from any clinical-order proposal capability.
- Port PR 2's small fix with acknowledgment/retry/navigation tests. Revise PRs
  3/5 independently before choosing the final compact UI.
- Re-run the preserved witnesses on each changed head, then the ordinary check.
  For relevant screens inspect the actual signed native build and Android Back,
  keyboard and safe-area behavior. No merge based solely on old CI green.
- Triage the seven underlying dependency advisories above. Start the two
  compatible patched transitive updates as a separate scoped change; review
  unsupported/major parent changes for runtime reachability and compatibility.
  A green test count does not mean a dependency advisory has been resolved.

**Exit:** recorded verdicts, no known false-status/wrong-scope path admitted to
main, current exact-source checks, and clear native limitations.

### M1 — Close acknowledged-capture and restore gaps

1. Connect the existing stopped-voice operation journal to new note drafts and
   quick captures. Reserve file admission before the first native await, retain
   it through destination verification and metadata/draft acknowledgment, and
   atomically attach the immutable operation. Retry without requiring a vanished
   recorder cache or producing duplicate audio.
2. Give remaining manual raw inputs a durable, versioned recovery representation
   without auto-publishing clinical entries. Preserve invalid visible date/number
   text separately from parsed values. Inherit original dataset intent and use
   one editor removal scope. Test contact/manual lab and remaining feature forms.
3. Test restore interruption before/after file replacement, SQL commit and
   housekeeping. Include mismatched/missing/corrupt attachments, insufficient
   storage, dropped folder grant and reminder reconstruction. Independently
   compare every app table and file; do not only count records.

**Exit:** no acknowledged text/media disappears in the tested interruption
matrix; old intents refuse new datasets; retry/cancel remain usable and drafts
do not leak into finalized clinical data. Active recording before journal
creation needs its own explicitly described interruption limitation.

### M2 — Establish the paper-replacement workflow

Use 40 synthetic patients with varied encounters, bed transfers, one readmitted
patient, a changed/rule-out diagnosis, a held order, mixed lab times/units,
pending consults, timed bedside examinations, an operation-note photo, follow-up
and handoff. Reproduce the owner's abdominal-pain/surgery/consult/lab workflow
without incorporating identifying details from the chat into fixtures.

Required scenarios:

1. Start/open a shift, add a patient quickly and fill details later.
2. Locate a named patient/bed/next action; review events and previous results.
3. Capture a note, photo and voice; return to the same patient after interruption.
4. Record actual consultation requesting, later answer and follow-up instruction.
5. Check/hold/change an order and review the exact old versus new result.
6. Move between patients in rounds while preserving unfinished input.
7. Correct a mistaken entry, recover a deletion and inspect relevant history.
8. Finish/handoff the shift with pending work still pending; re-admission remains
   a new encounter belonging to the same patient.
9. Export/restore and cold-reopen; verify records, drafts, original media and due
   work independently. No required network access throughout the shift.

**Exit:** owner can complete the entire script without paper used to compensate
for missing workflow, confusion about patient/episode, or unreported failed
saves. Record actual taps, timings, failures and owner observations; “looks nice”
and a reviewer saying WOW are not measurable acceptance.

### M3 — Measure speed, navigation and visual usability

Proposed targets, **not current measurements or promises**:

- Current shift visible on launch; commonly used capture/details reachable in
  one or two deliberate actions from the worklist/patient workspace.
- On the target phone with the 40-patient workload, warm patient open P95 below
  one second and ordinary local search P95 below 300 ms. Report cold start and
  larger-dataset behavior separately; revise targets from measured evidence.
- An acknowledged save has a clear pending/saved/failed signal; no false success.
  Record input-to-ack timing, dropped frames and long tasks as data volume grows.
- At default and enlarged font, Persian/English mixed text, dark/light theme,
  keyboard open and three-button navigation, clinical values/units and essential
  actions remain legible and tappable. Screens need no explanatory essay.

Profile first with synthetic archived records/media at several sizes, including
the owner's possible long-term tens of thousands of records. Record SQL timings,
query plans, render/list virtualization, memory and startup. Add indexes or a
local search index only where the bottleneck is demonstrated. Do not assume
an unbounded joined list is fast because 40 rows passed a unit test.

**Exit:** measured results and an explicit short list of remaining regressions;
benchmark against the owner's existing paper workflow, not marketing claims.

### M4 — Complete requested workflows without crowding the clinical core

- Finish rich visual notes through a versioned reversible document codec. Keep
  original plain text and historic versions readable; separate clinical structure
  from presentation. Test IME/RTL/selection/clipboard and autosave before adopting
  a new native/editor dependency. A smaller staged editor may be safer than a
  general Notion clone.
- Add direct spreadsheet import with preview, units/times mapping, conflict and
  duplicate handling, one transaction and recovery. Current TSV paste remains
  valid; do not claim it is an `.xlsx` importer.
- Complete photo comparison/original-preserving crop and expected voice target
  coverage. Provide recovery for all promised soft-deleted clinical entities.
- Finish intentional persistent ordering with a discoverable drag/reorder action
  and accessible controls, preserving the membership-id round cursor. Define
  section moves per entity; crossing patients requires a confirmed destination,
  correct encounter/attachment links, provenance, audit and undo under the original
  intent. Keep clinical dates separate from display order. Existing capture
  assignment/publication is not evidence of a general safe clinical-record mover.
- Exercise doctor/referral/private ratings, knowledge/teacher links, specialty
  profiles, owner templates, ideas, places/extensions and simple credentials
  end to end. Keep these reachable through organized secondary navigation.
- Exercise reminders on the actual phone after reboot/permission changes and
  when the app is not foreground. Treat schedules, delivery and manual completion
  as separate states. Backup destination verification and off-device copies have
  similarly separate meanings.

**Exit:** each goal in section 6 has a demonstrated owner workflow and recovery
path. Feature inventory check marks are not the exit criterion.

### M5 — Add AI and clinical tools only with the right contract

Start with Persian/English transcription, semantic retrieval with original-record
citations, knowledge organization and draft progress/discharge summaries. Keep
audio and raw/model text, source snapshot, proposed edits and physician changes.
Expose missing/conflicting information; never turn absence into negative history.

For any structured draft importer: bounded versioned schema, coherent source
snapshot with omission counts, immutable patient/encounter/revision/generation,
durable operation id, full field preview, unselected defaults and an idempotent
atomic publication path. Failure retains the same draft and cannot duplicate
records. Clinical actions must remain explicit physician decisions.

Each enabled deterministic tool additionally needs source/version, population
and exclusions, units, visible inputs and freshness, reference and boundary
tests, and physician review under invariant 10. Software tests alone do not
validate medical content. No new thresholds/formulas are approved by this audit.

Select local phone/home-server/cloud adapters only when the next concrete use
case and data policy are approved. Keep local records operational without them.
Do not install vector infrastructure or several providers as speculative scaffolding.
Web/server/desktop/sync remain later work requiring a separate conflict policy.

**Exit:** reproducible software and clinical-source evidence, documented data flow,
and owner-reviewed outputs; no unobserved therapeutic action or external export.

## 8. Handoff discipline for multiple AI builders

The canonical documents are already sufficient: AGENTS for rules, HANDOFF for
the latest session, architecture for settled rationale, IMPLEMENTATION for open
work, and per-release validation for evidence. Keep other tool instruction files
as pointers. This audit adds evidence; it does not replace that hierarchy.

For every next PR/session:

1. Identify the exact base SHA and unrelated work; run brief/check before edits.
2. State one outcome, its preserved invariants and a failing witness when a
   consequential defect is reproducible. Read the current code, not only a chat.
3. Keep source diffs scoped; no dependency/migration/framework change without an
   actual need and migration/recovery implications.
4. Keep test fixtures synthetic. Confirm all shared transaction/query rules and
   original intent through final acknowledgment, including delayed callbacks.
5. Run the meaningful targeted tests and full check; preserve full failed-check
   context rather than reporting only a later green rerun.
6. Record exact source/artifact/CI ids and separate software, build, emulator,
   physical-phone and clinical validation. Freeze source before bundling an APK.
7. Commit with the Agent trailer and a short handoff naming open gaps. Do not
   mark a feature finished because the next smaller model may trust that label.

The owner can swap providers without relying on this chat if each builder follows
that procedure. No prompt can make an arbitrary model “bulletproof”; enforceable
boundaries, reviewable small changes, failure tests and honest acceptance records
are the practical control.
