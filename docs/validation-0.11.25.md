# 0.11.25 — Keep note, follow-up, viewer and lab-entry intent

Status: final software, exact-source CI, signed artifacts and bounded offline
native gates passed. Broader product and physical-phone gates remain open.

## Reproduction and scope

Baseline `db3cb09` passed 111 suites / 1421 app tests plus three workflows.
Production remained unchanged while each ownership gap was reproduced against
actual migrated SQLite and real restore/import, with the same ids and revisions.
Thirty valid witnesses failed before fixes: eight NoteCard, ten FollowUpCard,
seven media viewer and five lab entry cases. Fresh ordinary cases passed.

The first viewer acknowledgment witness sought Input after the old prompt had
already closed, causing a harness lookup error. It was changed to inspect optional
rendered controls and release acknowledgment before asserting; the corrected
failure was rerun before production changed. The synchronous useLive lab stand-in
needed an explicit same-screen refresh to reproduce a missing restored panel.
That valid failure was also rerun on unchanged production. Neither initial harness
behavior counts as a distinct app bug.

Changes use inherited immutable dataset tokens and whole-operation writer leases:

- Note pin/unpin and final nested delete include history/audit acknowledgment.
- Follow-up completion, postponement, status/delete, reminder retry and native
  dialing retain original ownership. The existing actual completion prompt stays
  busy until native acknowledgment and retains outcome text on failure.
- Viewer caption/delete/share reject stale intent. Caption failure keeps actual
  typed text; successful acknowledgment closes it. Synchronous guards suppress
  duplicate Submit and cancellation while pending. Native share is awaited and
  its failure caught; returning from the sheet is not proof of delivery.
- Lab EditGate retains its seed and raw input when replacement removes the panel.
  Creation, update and clipboard use the same original token. Save/Paste mutexes
  prevent double Save and premature publication while clipboard reading is pending.
  Functional clipboard merge preserves unrelated edits made during the read.
  Save locks existing fields until acknowledgment; failure unlocks them for retry.

Version 0.11.25 / Android code 41. No new dependency, migration, permission,
navigation guard, dialog, clinical formula/reference range or archive/key scheme.

## Software evidence

Four mounted suites / 43 tests passed. They exercise real Scope/EditGate, actual
caption/completion PromptModal, real queries and SQL import. Native services,
navigation, removal hooks and live observers are stand-ins, not device evidence.
Additional post-fix tests cover SQL failure/retry, native share/clipboard failure,
pending clipboard/current edits/early Save and fresh ordinary publication. No
pre-fix failure is claimed for those added cases.

Two read-only source reviews found no concrete blocker; root owns integration and
all executed checks. Private synthetic logs are under private/validation-0.11.25/.

Final `npm run check` passed: typecheck, zero-warning lint, formatting, 114 suites /
1462 app tests and three workflow tests; whitespace diff passed. Its first attempt
stopped at a test-only readonly-tuple Jest typing error, corrected to named case
objects without relaxing production types. The NoteCard scope observer now records
its evidence in an effect instead of mutating a global during render. Version/
package-lock edits are limited to application fields; generated native version/code
stamps were guarded against any other app configuration change before source froze.

## Signed/offline native acceptance — 2026-10-04

Application source stayed frozen at `eb150a53868c5887dd42c9bc35e51267325605ad`
through both builds and the native sequence. Hosted CI `37213357700` passed for
that exact SHA; the ordinary push hook independently reran the full source checks.
The first CI watcher lost its network connection; a subsequent direct GitHub API
result confirmed completed/success for the exact source, rather than inferring it.

Both packages report `com.shayan.medos`, 0.11.25 / code 41, min SDK 24 / target 36,
their respective single ABI and required native libraries. Signature v2 verified
with the existing certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/MedOS-0.11.25.apk` (arm64-v8a) | 52,854,791 | `d349df7bd4854ec79a0cda03709cf94770560ad235b1b90ba5260387a1aca9bf` |
| private `MedOS-eb150a5-x86_64.apk` | 54,463,118 | `c4300bcf5ec239b053dab17e0dffb99d9b0b54ff42da01b0a9a8897effc249e1` |

The owned isolated Android 36.1 emulator was upgraded using `adb install --user 0 -r`
without clearing/uninstalling data. The pulled installed base APK hash matched
the inspected x86_64 artifact. Actual connectivity reported airplane enabled and
Wi-Fi disabled. Every action used current hierarchy bounds; another session did
not drive this AVD. Arm64 built after the emulator stopped.

Four separate retained-intent scenarios used the accepted 0.11.24 synthetic SAF
archive. Its host/device hash matched
`6b0d3488df508d92d4be8d6f4c1de0b618e1ee1b5debcb7a016cdda4f1c0e954`.
Each native restore acknowledged one patient and 18 files:

1. The retained note list refused pin and final nested deletion after restore.
2. The retained follow-up card refused completion, keeping the actual typed
   outcome in its open prompt after the error was dismissed.
3. The lab form was opened and typed before restore. Its actual note text remained
   after return; old Save refused and retained input after error dismissal.
4. The viewer was opened before restore. Its subsequently opened caption prompt
   refused publication and retained actual typed text. Old viewer deletion and
   sharing also refused. This does not prove actual native share delivery or a
   native caption typed before restore; those ownership/ack variants have software
   witnesses, with native service stand-ins.

Pending prompts were explicitly canceled only after their retained text was
verified. Fresh processes separated the scenarios; no automatic rebase is claimed.
Before any fresh clinical mutation, native full SAF export was independently
authenticated/decrypted across seven chunks. Exact comparison preserved all 39
application tables and all 18 media entries/bytes, with no reminder repair or extra
file allowance. Audit, backup bookkeeping, settings and migration bookkeeping were
excluded. Integrity was ok and foreign keys empty. Export: 6,523,089 bytes, SHA-256
`6a650dd06a01bc77307ca158231bfca1e517a686566863911a69cefe567c01d7`.

Fresh ordinary native intents then pinned the note, completed the follow-up with
typed outcome, saved the photo caption and edited the lab note. After force-stop/
reopen, the actual lab note and viewer caption were visible. A second independently
decoded export confirmed the note pin, exactly one added note version with matching
clinical contents, one completed follow-up/outcome, caption and lab note; active lab
clinical values were unchanged and old values soft deleted. The other 33 application
tables and all 18 media files matched the prior export exactly. Integrity and foreign
keys passed. Fresh export: 6,523,089 bytes, SHA-256
`0ad9bcf07b9440e82f5d30fb8cf104ee52ba411c97f167b182daa37f300974c4`.

Final application crash buffer was empty. Emulator cold boot showed a System UI
ANR; its observed Wait action was handled before acceptance. One restore UI dump
could not become idle while work was active; a later fresh dump confirmed completion.
A fresh follow-up helper initially found the task checkbox's identical description;
the class-specific tap refused before input, and the target was then selected using
the visible follow-up reason. No task was toggled; independent export confirmed it.
These helper/boot events are not passing app scenarios or hidden app fixes.

The x86_64 build took 4m 5s and owner build 1m 25s. Recorded warnings include Gradle
deprecations, CMake path lengths, Metro terminal-color and Java native-access warnings.
No application source changed to address those warnings during this delivery.

## Limits and next work

Retained mounted input, caption/outcome and writer admission are process-local.
This does not establish raw lab draft crash recovery, native reminder delivery,
physical phone/API 26, every form's intent, camera/voice interruption, low space,
power loss, large datasets or validated clinical-tool acceptance. Remaining
unscoped patient/admission/follow-up/consult-answer forms and durable stopped voices
for capture/note drafts remain prioritized in IMPLEMENTATION. Do not claim whole-
product completion or zero bugs from these bounded gates.
