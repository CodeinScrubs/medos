# 0.11.35 — recoverable raw manual lab entry

Current application checkpoint: `d2bcbea7d5cdba0b01155935e8e12b831ec78d88`.
Full checks/hosted CI and bounded native edit/discard/cold recovery pass on its
inspected installed QA bytes. Earlier sections retain the intermediate probes
and rejected setup attempts; final evidence and its limits follow below.

## Problem and implementation

The previous manual lab form kept input only in component state. Navigating away
or restarting lost an unsubmitted panel, including text hidden inside the date,
clock and reference-range widgets. Late Save acknowledgment could also close a
newer route. Editing replaced values without carrying their existing notes and
rounded an unchanged collection timestamp to a minute.

Migration 0022 adds `lab_form_drafts`, with one open form per patient/new-panel
or patient/existing-panel. Its strict version-1 document retains exact raw text,
ordered rows and units/ranges/notes, preset/name state, incomplete date/clock and
the open range editor's input/session. Invalid input remains a draft, never a
clinical result. Untouched forms write nothing; malformed drafts are retained
and reported, not silently replaced with a blank form.

One SQL snapshot loads patient, target, values, draft and initial active encounter.
The existing AutosaveScope carries its original dataset generation; latest input
is persisted before publication. Draft CAS, clinical comparison, clinical write
and retirement execute synchronously and atomically. Replay cannot publish twice.
Deleted/foreign parents refuse publication. A closed captured encounter remains
historical context; reopening does not attach the lab to a newer admission.

Explicit conflict comparison shows both the current published values and the
stored raw draft. Keep mine rechecks that displayed basis before rebasing a whole
panel; it does not silently merge. Discard retires only the draft. Existing panel
source, encounter, per-value notes and unchanged sub-minute timestamp survive
ordinary edits. Replace-all edit history still soft-retains old value rows.

PromptModal has an optional paired controlled-input contract for the raw range
buffer; existing uncontrolled/secret consumers retain their contracts. Stale
range-session callbacks cannot alter a newer session. Pending clipboard work
blocks publication/exit/dialogs while preserving newer typing. Final submission
freezes input, keeps Screen/header/native Column ancestry stable, and closes only
its originating focused route. No dependency, route, permission, clinical formula
or backup-format/key change; version0.11.35/code51 identifies the artifacts.

## Executed software evidence

- A recovery witness failed before the change: reopened pending text became the
  original note. Additional timestamp/current-clinical-comparison witnesses failed
  before their corrections. Private evidence: validation-lab-drafts/.
- Real migrated SQLite tests cover exact raw recovery without clinical writes,
  CAS/replay, captured encounter, per-value metadata/history, deleted/foreign
  parents, same-id dataset replacement and explicit conflict comparison/rebase.
- SQL fault triggers independently fail value insertion and draft retirement on
  create/edit; every clinical/draft row rolls back. Full restore carries raw
  drafts; older table-absent restore clears them; invalid draft FKs roll back the
  entire import. Query observation covers all five joined tables.
- Real date/range widgets and Screen/Column/Scope tests cover invalid raw text
  acknowledgment before remount, background flush, write failure/exit refusal,
  explicit retry, latest-event Save, deferred/unfocused acknowledgment, stable
  native parent/header, completed-callback refusal and pending clipboard work.
- Four targeted suites/87 tests passed. Full `npm run check` passed: typecheck,
  lint, formatting, 128 suites/1,699 app tests and three workflow checks. Import
  ordering warnings from this change were subsequently corrected; the ordinary
  pre-push check must validate the final committed source too.

Two existing GPT-6.1 Sol/xhigh read-only reviewers inspected SQL and UI contracts;
the primary agent owns all edits/integration/checks. A later additional review
request did not run because of usage limits; it is not counted as evidence.

## Artifact and native acceptance

At this source checkpoint, exact-source hosted CI, APK identity/signature/library
inspection, in-place upgrade and real Android cold recovery/publication are still
pending. Component remount tests do not prove process-death recovery. Preserve the
.34 baseline rows/files and independently compare exported SQLite/media before
claiming native acceptance. Physical A52s, power/low-space, active recording,
pressure/24-hour performance and complete product acceptance remain open.

## Native checkpoint and header access correction

Source `1daa513091a9eaaea4c16153815eaad21c14233d` passed normal pre-push checks
without lint warnings. [CI37713171025](https://github.com/CodeinScrubs/medos/actions/runs/37713171025)
reports Success on GitHub's public run page. Local API connection/TLS errors are
preserved; the web page independently confirms this exact run/source.

Its signed/inspected x86_64 QA APK is54,581,738bytes, code51/name0.11.35,
target36/min24, SHA-256
`dc50e4a2edbddd229498db57091e34a3dacc35cbb4b3cadd03855f5164f30d9c`.
The actual installed APK matches; unchanged owner signer and required native
libraries passed inspection. Offline in-place upgrade preserves every original
4,049row/40table and25media hashes, adds only an empty draft table and reaches
23migrations; independently decrypted export has clean integrity/FKs.

Actual new manual raw entry survives force-stop and cold reopen, including the
open `135-` range buffer. Independent export confirms the exact incomplete
date/clock, ambiguous value, name/laboratory/notes, row/session identity and
captured encounter; no clinical row or unrelated data/file changed. This is
process-death recovery, distinct from the earlier component remount witnesses.

The attempted footer Save with IME open did not invoke Save: UIAutomator exposed
an occluded app button while Gboard received the tap and appended a character.
The process survived and no publication was claimed. Screenshot/window inset
evidence explains the setup failure and a real access issue: only a footer is
poor access for long forms. The known synthetic extra character must be corrected
before continuing. Earlier selector/cold-start setup failures are also preserved:
the date's label lies beside the calendar icon rather than over its input, and
an initial cold hierarchy was splash, not proof that recovery failed.

The corrected source retains one compact header publication/Close slot, following
the note editor's existing pattern. It calls the same validation, latest-input,
dataset/CAS and focused-navigation path as the footer, without another guard,
route or draft writer. Title and slot presence remain constant while pending and
completed. Two new/edit witnesses fail before correction; final checks and the
rebuilt exact-source keyboard-open native acceptance must follow separately.

No owner arm64 artifact or physical installation has yet been produced for this
checkpoint. The first QA APK above is a probe, not the final owner candidate.

### Header source native result and clipboard follow-up

Header source`b10b4c249d294f335d08eeb6313f443893a45e4b` passed the full/pre-push
check (128suites/1,701app tests and three workflows) and exact
[CI37716809376](https://github.com/CodeinScrubs/medos/actions/runs/37716809376).
Its inspected signed QA APK is54,581,966bytes, SHA-256
`402b9f979ec23250c513764cef4333ce9d1ada080ba8ff92ca3b07d8bf1d3394`;
actual installed bytes match. The original25media files and every4,050row in
41app tables survive the header-source replacement exactly (23migrations).

With actual IME shown, the observed header target lies above it. Actual Save
and native close retain one process with no new fatal. Independent export
confirms exactly one new panel/value and retirement of the original raw draft,
same captured encounter, correct value/range/metadata, all unrelated rows and
25media hashes unchanged (4,052rows). This is header-source acceptance, not
acceptance of a later source change or acoustic/physical/performance behavior.

Source review and two failing software witnesses then found another race:
delayed clipboard retrieval overwrote a manually typed or cleared value. The
corrected paste captures latest rows before retrieval and compares the arrival
snapshot before overwriting matching fields. It preserves intervening edits,
renames/removal and newly entered values, while permitting unrelated typing.
The existing alert reports values it preserved; no normal-path additional UI.
Four suites/54 checks pass, including persisted raw recovery and no clinical
write. Final-source full check/CI/artifact/native retest must still run.

A further witness retypes the original value during retrieval. Equality alone
overwrote that explicit input (one failure/two passes); comparing immutable row
identity within the native wait preserves it too. No edit counters/schema or
persistent keystroke history are added. Final checks follow this refinement.

## Final source and bounded native acceptance

Application source `d2bcbea7d5cdba0b01155935e8e12b831ec78d88` passes the normal
pre-push `npm run check`: typecheck, lint, formatting, 128 suites/1,704 app tests
and three workflow checks. Exact-source
[CI37718940223](https://github.com/CodeinScrubs/medos/actions/runs/37718940223)
completed successfully; its head SHA and conclusion were retrieved from GitHub.
No dependency, backup/key format, permission or clinical formula changed.

The final x86_64 QA APK is 54,583,262 bytes, version 0.11.35/code 51, target 36/min 24,
SHA-256 `1410d6917b141d0d20dc0454f908372de5d04f27218f7f9b35f02ab2a406b066`.
Signature verification, required native libraries and the single expected ABI
pass. Its signer is unchanged. After in-place installation, the actual installed
APK was pulled and independently hashed; bytes match this inspected artifact.
It remains a private emulator artifact and must never be copied to `dist/`.

Tests use only synthetic data on the API 36.1 x86_64 AVD, airplane mode enabled.
The initial .34-to-.35 migration and new-form raw/header trials are recorded
above under their exact intermediate sources. The following trials execute the
final source; they do not retroactively accept a different source.

| Trial | Observed native result | Independent database/media result |
| --- | --- | --- |
| Replace the earlier .35 probe in place | Installed APK hash matches final inspected bytes | All 4,052 rows/41 tables and 25 media hashes preserved; 23 migrations, integrity/FKs clean |
| Edit a historical panel, enter ambiguous `12,5` and pending notes, then force-stop/cold reopen | Exact visible value and notes recover; header Save shows refusal | Exactly one raw draft added; no clinical or unrelated row/media changes |
| Correct to `12.5`, focus notes, publish from header with actual IME shown | Observed header lies above IME; editor actually closes, same PID, no fatal for that PID | Original panel/source/closed encounter/time, units/ranges/per-value notes/order retained; old values soft-retained, replacement values and draft retirement correct |
| Create a notes-only raw form, force-stop and explicitly discard after reopening | Exact notes recover; observed confirmation and native close pass, same PID | Only original draft revision/soft-delete changes; raw body retained, no published panel/value removed or added |
| Force-stop and export once more | Cold startup/export succeeds offline | Every 4,057 row/41 table and 25 media hashes exactly match the preceding checkpoint; 23 migrations, integrity/FKs clean |

The IME state came from native dumpsys, and taps used fresh hierarchy bounds.
Editor-title absence confirms actual navigation, alongside PID/crash checks.
Crash-buffer history is retained; no new MedOS fatal/ANR was observed during these
bounded .35 trials. Final exit history shows the deliberate cold-test force-stops;
the prior .33 pressure ANR remains unresolved, as recorded in validation-0.11.34.md.
Checks were not run concurrently with a native build to claim pressure acceptance.

Private synthetic evidence lives in `private/validation-0.11.35/`: artifact and
installed-hash JSON, IME/window/hierarchy/process records, decrypted archive/SQL
comparisons and retained failed attempts. Final cold archive SHA-256 is
`0e3a86a01b292e1c93771fbf187f6152f4eca1ddc8cd36d728f5dc248f1b4cb2`.
Comparisons examine all application rows and original media hashes, not just
counts, success labels or a query against one edited panel.

One initial automated numeric replace yielded `2,5` instead of the intended
`12,5` and was rejected. A retry incorrectly expected an empty UI text node:
Android exposes the empty input's `—` hint as text. After observing that cleared
state, exact `12,5` entry was verified before cold recovery and publication
refusal. These attempts do not prove the cause of the partial injection or
certify rapid typing under load; they are not counted as successful trials.
The clipboard race is covered by software witnesses, not native clipboard fault
injection. Existing fixture value notes are null; non-null value notes,
sub-minute timestamp preservation, photo-only panels and SQL failure rollback
have separate software evidence rather than new native coverage here.

Remaining gates: physical A52s microphone/speaker/IME/camera/SAF and OEM reminders,
active/pre-journal recording interruption, power/low-space/native fault tests,
pressure/24-hour performance, companion/doctor raw recovery, safe orphan
accounting and complete product/clinical acceptance. These results accept the
bounded lab recovery/edit/discard path, not the entire app or every long shift.

## Owner APK and handoff

`npm run apk` builds the final application's signed owner artifact at
`dist/MedOS-0.11.35.apk` in 6m30s. Actual package inspection confirms only
arm64-v8a, version 0.11.35/code 51, target 36/min 24 and required native libraries.
Size: 52,974,935 bytes. SHA-256:
`845445767c12e3fe0b425fc9d5e5e599730714517163541c1e0eed5463fe0a5f`.
The unchanged certificate SHA-256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
This APK was not installed on a physical phone. The QA APK is a different ABI;
its successful native trials do not constitute physical acceptance of this file.
Only documentation changes follow the application source above; no source edit
was made after either bundle started. No owner .35 artifact existed during the
earlier internal probes, whose filenames/hashes identify their distinct sources.

A fresh GitHub open-PR inventory returns the same five head SHAs documented in
`reviews/2026-10-07/README.md`. Prior dispositions remain; no new merge, approval
or review comment was made during this slice. It is not a new review of changed
PRs, nor proof that the broader product is complete.
