# 0.11.24 — Preserve original patient and draft mutation intent

Status: final software gates passed. Signed/native acceptance remains pending
until actual device and artifact evidence is recorded below.

## Reproduction and change

Baseline source `4eb2374` passed 109 suites / 1378 app tests plus 3 workflow tests.
Its application source is `645a2f3`. Before production changes, 33 valid new
witnesses failed: 14 direct patient actions, nine Scope/schedule cases and ten
task/consult draft cases. They execute actual handlers and real migrated SQLite
replacement, preserving the same ids and revisions. Fresh ordinary actions passed.

The first combined draft run also contained four harness TypeErrors: comparison
buttons were sought before their renderer committed. Those harnesses were corrected
and the ten valid task/consult failures rerun on unchanged production source.
They are not counted as product bugs. Later Undo-after-unmount, media acknowledgment
and lab-source witnesses were added after the fix; no old-source failure is claimed
for those additional cases.

Changes:

- Scope exposes its original generation. Late children inherit it through
  useDatasetIntent; explicit tokens take precedence and remain immutable. Fresh
  independent scopes still capture current authority.
- AutosaveField and quick task/consult/schedule savers receive that token. Manual
  publish/comparison/load/adopt/discard acquires admission before any cancel/reset
  or mutation, even when the saver is already clean. Schedule opening and native
  reminder retry also retain original ownership.
- Direct order, task/Undo, consult, patient star/contact, imaging, lab panel and
  inline media actions retain their original token. Native photo/lab capture keeps
  admission through picker, file work and metadata acknowledgment.
- Existing input, conflict handling and normal one-tap actions remain. No new UI,
  navigation guard, dependency, migration, permission, clinical formula or archive/
  key scheme. Version 0.11.24 / Android code 40.

## Evidence limits and remaining work

Tests use actual migrated SQL/import logic; native services, navigation and removal
guards are stand-ins. Observer hooks publish test evidence in effects after commit,
not by render-time global mutation. Synthetic data/private logs stay under
private/validation-0.11.24/. Source reviewers ran no tests/builds/native tools.

Admission is process-local and retained raw input is not crash recovery. Reminder
retry fencing does not change the existing native failure/retry contract. Unchanged
note-card pin/delete, follow-up card actions, media viewer delete/caption, lab entry
and patient/admission/follow-up/consult-answer form lifecycles remain separate work.
Durable capture/note-draft stopped voices, interruption/low-space, phone/API 26,
large datasets and validated clinical tools remain open. Do not report whole-product
completion or protection of every descendant.

## Final software gates

- `npm run check` passed: typecheck, lint without warnings, formatting, 111 suites /
  1421 application tests plus three workflow tests. The first full run stopped at
  typecheck because the new lab fixture omitted its required source; fixing that
  fixture did not relax the production type contract. Final full run passed.
- Nine targeted suites / 131 tests passed, including the affected voice/read-error/
  patient-root neighbors. Diff whitespace check passed. Package-lock edits change
  only its three application version fields; generated/signing files stay ignored.
- Two independent source reviews found no blocker in the integrated patch and
  documented the remaining unfenced workflows above. Neither reviewer ran checks.
- App configuration differs only in version/code. A guarded private script updated
  those two stamps in generated Android configuration; no full prebuild was needed.
  Build acceptance is still required; that stamp alone proves no APK contents.
