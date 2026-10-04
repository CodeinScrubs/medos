# 0.11.24 — Preserve original patient and draft mutation intent

Status: final software, exact-source CI, signed artifacts and bounded native
restore/preservation/fresh-intent gates passed. Broader feature and phone gates remain.

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

## Exact-source signed/native acceptance — 2026-10-04

Application source was frozen at `f055cbcf9a35f163563e177e7eb40514ec300e0f`.
Hosted CI `37201713147` passed. The ordinary push hook independently reran the
full source gates successfully. No application source changed during either build.

Both inspected packages report `com.shayan.medos`, version 0.11.24 / code 40,
min SDK 24 / target 36, their respective single ABI and required native libraries.
APK signature v2 verified with the existing release certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
The isolated retained Android 36.1 emulator (`emulator-5556`) was upgraded with
`adb install --user 0 -r`; its pulled installed base APK hash matched the inspected
x86_64 artifact. App data was not cleared/uninstalled. Connectivity reported
airplane enabled and Wi-Fi disabled before the synthetic native sequence.

Actual native observations, using fresh hierarchy bounds:

1. Open the patient's overview with the consultation composer still closed.
   Push the backup route and restore the accepted 0.11.23 SAF archive; verify
   its device hash before selection. Completion reports one patient / 18 files.
2. Return to that retained root. Open the consultation composer only now, after
   replacement. Type service and question into the actual native fields.
   Publication refuses the old intent with the dataset-changed message. After
   dismissing it, both typed fields remain. This covers the late-child ownership
   case; it is not native coverage of every draft conflict/load/discard variant.
3. Tap the existing task checkbox on the same retained root. It refuses without
   removing the task. Consultation input remains after dismissal and another
   trip to the backup page.
4. Produce a full SAF export before any fresh clinical write. An independent Node
   AES-GCM/scrypt decoder authenticates all seven chunks. Compare all 39 application
   tables and all 18 media entries against the selected source: every compared row,
   timestamp, version and file hash is exactly preserved. No reminder-field repair
   or extra-file allowance is used. SQLite integrity is `ok`, foreign-key checks
   empty. Audit/backup/device-settings/migration bookkeeping are explicitly excluded.
   Fourteen voice attachment rows are preserved; their individual playability was
   not tested in this session.
5. Confirm the existing Start fresh action. Native targeted replacement clears the
   old composer and stale notice. Open a fresh composer, publish once and mark the
   consultation requested. Force-stop/reopen: the real overview shows that one new
   consultation and its waiting-response status. These deliberate later mutations
   are outside the unchanged-data comparison in step 4.

The final application crash buffer was empty. Cold boot initially displayed a
System UI ANR; it was dismissed before acceptance. One busy restore hierarchy read
could not reach idle; a later actual hierarchy confirmed completion. The first
attempt to tap publication after hiding the keyboard was refused by the QA helper
because its observed button bounds were clipped. A fresh bounded scroll revealed
the button, then the actual tap was performed. No outcome was inferred from either
failed UI-tool attempt.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Signed x86_64 QA APK | 54,460,426 | `8e5ebfb046a0596aec5b9bcafcdfd8d00b4cf422b21ffd144ed5af74ecbec93d` |
| Signed arm64 owner APK, `dist/MedOS-0.11.24.apk` | 52,852,099 | `717d63cc61f7f34d09c3ad2a0353519201ed1ccf9ef148ca819b883cdd372d4d` |
| Source 0.11.23 SAF archive | 6,518,993 | `06dc816ba7836d4ed9f748c45e76c6e87f54c27bc62ff8375cef33216c617d81` |
| 0.11.24 preservation export | 6,518,993 | `6b0d3488df508d92d4be8d6f4c1de0b618e1ee1b5debcb7a016cdda4f1c0e954` |

The signed x86_64 build completed in 4 min 6 s; the arm64 owner build completed
in 1 min 22 s after the emulator was stopped. Native checks passed after each ABI
switch without requiring a generated-app clean. CMake path-length, Gradle
deprecation, Metro color-environment and signature-tool Java native-access warnings
were recorded. The matching Gradle daemon was stopped afterwards. Signing material,
archives, XML, screenshots and logs remain ignored in private/validation-0.11.24/.

This establishes bounded modern-emulator acceptance of late consultation intent,
task refusal, explicit renewal, fresh consultation persistence and exact archive
preservation. It does not establish physical-phone/API 26 behavior, every card/form,
camera/voice interruption, power-loss durability, performance at scale or full
product completion. The next integrity patch should start with note-card actions
and FollowUpCard.perform, preserving outcome input and its complete native lease.
