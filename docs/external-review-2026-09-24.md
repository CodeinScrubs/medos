# Review of the two external AI reports

Reviewed against `55acf40` plus the working changes subsequently committed with this
document. The owner's product decisions and `IMPLEMENTATION.md` remain authoritative.
This is a bounded claim check, not a certification of the whole application.

## Report 1: repository audit and Antigravity changes

| Claim | Result and disposition |
|---|---|
| Timeline cards changed route parameters without changing the selected patient tab | Confirmed in the base commit. The supplied render-time state synchronization fixes the basic click but bypasses the autosave group. A failing component test demonstrated that it unmounted an unsaved editor. The integrated fix waits for successful saving and retains the editor on failure. Manual tabs also update the URL, allowing a previously visited destination to be reopened. |
| Alphabetical consult status puts answered/cancelled ahead of open work | Confirmed. Retain explicit SQL ranking. However, the supplied ranking still placed pending routine above requested emergency. An expanded SQLite test failed. Pending/requested now share the open rank, followed by urgency, before closed work. These are work-list priorities, not a validated clinical triage algorithm. |
| Urgency was absent from patient and Today cards | Confirmed. Retain the supplied short text badges for urgent/emergency, with color as supplementary information. |
| Missing Stack entries caused untranslated headers | Explicit Persian titles/modal configuration are useful and retained. Expo routes already existed as files; they were not unreachable solely because a Stack.Screen declaration was absent. Exact prior native header appearance was not tested on a phone. |
| Search version 1 proved older task/consult/capture search was broken | Overstated. Their original create/update code already populated searchText (`4a57f2d`, `2dead76`, `3eaf01c`). Adding a reindex function alone does not prove broken stored indexes. Keep version 2 as a defensive one-time rebuild; a real SQLite upgrade test now covers deliberately stale indexes in all three tables. It does not implement universal cross-module search. |
| Start Shift does not collect ward/place/supervisor | Confirmed: `shift-screen.tsx` calls `startShift()` without arguments. This is an incomplete workflow. Optional editable context should preserve the fast-start path; a mandatory intake wizard would conflict with fast capture. Tracked in W02. |
| Timeline loads five queries and renders all entries | Confirmed. Performance degradation is a risk, not a measured result. Benchmark realistic records on the target phone; use bounded retrieval/one scroll owner if needed. A nested virtualized list inside the existing ScrollView is not sufficient. Read failures also currently lack explicit timeline feedback. Tracked in W05. |
| 51 suites / 635 app tests passed | Independently reproduced before the additional regressions in this change. The earlier 634 count is a different snapshot. Not all tests use SQLite: component tests replace native UI/navigation; workflow tests run in Node. Tests passing does not prove device operation, complete restore or clinical validation. |
| 80/100, possible 95, highest standards, no better work possible | Subjective judgments without a reproducible acceptance assessment. Do not use these claims as release evidence. Calling a local navigation defect P0 is also a prioritization choice, not evidence of universal catastrophic failure. |

Migration 0014, raw schedule drafts and database-first task reminder intent match
the actual working implementation. Database writes and Android scheduling still cannot
be one atomic transaction. Repair is best effort until the OS accepts it; absence of
a phone leaves alarm delivery, reboot/force-stop and notification-tap behavior open.

## Report 2: ClinicalOS redesign

The report explicitly evaluates an 8,253-line `plan000.txt`, SHA-256
`48401083883fd770d11e945021f9f5692bf49a5ac42582574516214db80e7a1d`.
That input was not included in these two attachments and was not found among repository
files. Its line references and hash were not independently verified. It discusses
Flutter/Riverpod/Drift, a dispatcher, ECG calipers and dose calculators. This repository
uses Expo/React Native, TypeScript, expo-sqlite and **Drizzle**, not **Drift**.
Treat the report as a critique of another proposed source document, not as the current
MedOS audit or permission to replace the stack.

A related earlier attachment, **Architectural Blueprint and Implementation
Specification for ClinicalOS Phase 1**, is available: 11,520 lines, SHA-256
`cd5a2d1bb2407f70a012e1a5033daee62876ad637978508ea4577415eaeafe81`.
It is not the report's exact source. Targeted inspection does corroborate unsafe
patterns in that text: raw DB-only archive/overwrite (7593–7664), age=65 and missing
conditions=false (7838–7847), weight-only diazepam computation (6555), and a returned
STAGED label after direct Kardex insertion (7784–7818). No Dart build was run.

F12 needs particular caution: `assignedContactId` **exists** in its first CallRecordings
definition at line 262 and is used at 5151, but is absent from the later replacement
definition at 10682–10696. The available document is internally inconsistent, rather
than uniformly missing the field. Which definition was selected/generated determines
the build failure. This does not independently validate the other report's line 4510.

| Finding ids | Applicability to current MedOS |
|---|---|
| F01/F02/F03/F04/F08/F12/F14/F16 | The cited dispatcher, calculators, caliper and CallRecordings field are not implemented here. Their exact defects remain unverified without the original input. Keep the general requirement that unknown clinical data stays unknown and proposed AI output cannot activate treatment. Do not add those components to fix a nonexistent current defect. |
| F05/F06 | Current backup code is different: `VACUUM INTO` snapshot, encrypted archive, selectable media inclusion, staged import/media rollback. This refutes attributing the cited raw-database-only implementation to MedOS, but does not certify every interruption/low-space/provider path. Keep D10 device/restore gates open. A data-only backup cannot restore omitted media. |
| F07 | Current `db/client.ts` explicitly sets WAL plus synchronous=FULL. Autosave still has a pre-commit window; FULL cannot save text that has not reached SQLite or recover a destroyed phone. The general criticism of a universal zero-loss guarantee is valid. |
| F09 | MedOS already separates patients and encounters with foreign keys. Do not replace that model or create a separate outpatient identity database. |
| F10 | Closed-loop follow-up is incomplete and belongs in W06. Multi-user acceptance/ownership is not a current single-user requirement. A personal task does not always need a deadline. |
| F11 | Current lab rows already have text values, units and reference bounds. Corrected-result versioning and explicit review remain useful gaps; replacing the whole model is not justified by this report. |
| F13 | Current clinical queries soft-delete; the cited Dart Undo path is absent. Preserve recoverability and review real correction/restore paths under W07. |
| F15 | Device/OEM/permission limitations remain relevant acceptance gates. They do not establish that the proposed call-recording path works on the owner's phone. |

## Source checks and uncertainty

The web connector failed authentication during this review. Public primary sources
below were instead retrieved directly over HTTPS and their relevant text inspected:

- [Drift custom constraints](https://drift.simonbinder.eu/dart_api/tables/#custom-column-constraints): custom constraints replace generated ones. The report correctly retracts the claim that withDefault alone proves an ACTIVE stored value. Exact generated SQL still needs its original project/version.
- [SQLite synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous): WAL/NORMAL and WAL/FULL have different commit durability. Neither covers unsaved editor text or loss of the storage device.
- [Android exact alarms](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms) and [foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): permissions and lifecycle restrictions support device gates; do not turn this into a claim that every local reminder needs the same exact-alarm permission.
- [FDA CDS guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software): the official page does identify January 2026 guidance. It does not establish the regulatory status of MedOS in another country.
- [FDA pregnancy labeling](https://www.fda.gov/drugs/labeling-information-drug-products/pregnancy-and-lactation-labeling-resources), [FDA statin communication](https://www.fda.gov/drugs/fda-drug-safety-podcasts/fda-requests-removal-strongest-warning-against-using-cholesterol-lowering-statins-during-pregnancy), and [the expanded CPIC G6PD guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC10281211/) support rejecting simplistic universal drug rules. No drug rule, dose or calculator was implemented from either attachment.

The KDIGO numerical recommendations, individual SAFER/FHIR mappings, every proposed
clinical rule, and the original plan's code were not exhaustively revalidated in this
review. Performance targets, schedule estimates and score weights are proposals, not
measured project results or commitments.

## What to adopt, defer and reject

- **Adopt within existing work:** explicit unknowns, source/time of data, recoverable
  drafts, identity/encounter separation, corrected-result review, measured device
  performance, restore drills, independently sourced/versioned clinical tools.
- **Keep later:** AI proposals, semantic search/transcription, optional server/sync,
  HIS adapters only when actually requested with a real access contract, ECG tools
  only after scope and calibration/source validation. Do not create empty frameworks.
- **Do not add now:** tenants, role administration, organization workspaces, mandatory
  recipient-acceptance workflows, a new credentials vault, compulsory deadlines on
  every personal task, shake-to-undo, or a framework rewrite without measured need.
- **Do not delete requested features as bloat:** private colleague notes/ratings,
  occasion reminders, knowledge tied to teachers and personal prescription templates
  are explicit owner requirements. They can stay secondary without being removed.

Execution remains in `IMPLEMENTATION.md`; this report does not start a competing roadmap.
The integrated changes preserve Antigravity's useful badges, route titles and index bump,
and record the two regressions discovered while checking its claimed fixes.
