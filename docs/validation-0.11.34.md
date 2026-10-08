# 0.11.34 — retain the native note form parent during Save

## Reproduction and narrow correction

The preceding validation-0.11.33.md records an actual repeated Fabric closing
crash despite the correct SQL transaction and corrected header ancestry. Its
native log locates the attempted Text reparent under the scroll content.

The installed RN 0.86.3 ViewShadowNode makes `pointerEvents="none"` a stacking
context, unlike `auto`. The note's layout-only Column switched this property
while saving, allowing Fabric to move its children. Installed screens 4.26.2
starts removal transitions on outgoing children; local Android API36 source
retains their parent until transition ends. A removing/reparenting transaction
can therefore encounter the old parent. This local source/log match motivates
the correction; it is not by itself native acceptance.

Both editable and completed Columns now have `collapsable={false}`, retaining
the same native stacking parent from initial render through saving/close. The
UI still freezes while publishing and stays editable after a failure. No global
layout patch, navigation timer, dependency, permission, SQL/schema or product
feature was introduced. Version0.11.34/code50 distinguishes these artifacts.

## Software evidence

The existing media-editor suite now uses the real Column and its React Native
View as well as real Screen/ScreenOptions. Deferred real publication/discard
acknowledgments expose the pending phase independently of completion. Checks
retain the same host/header, require an unflattened parent in idle/pending/
completed phases, and cover failure followed by correction and successful retry.
The unchanged parallel test guards edits during pending acknowledgment.

Before the correction, both host witnesses fail (undefined collapsable versus
required false); after, two suites / 15 tests pass. These are React/native-boundary
contract tests under native mocks, not Fabric execution. Full `npm run check`
passes: typecheck, lint, formatting, 127 suites/1,670 app tests and three workflow
checks. CI and native artifact/upgrade/voice acceptance follow separately.

Two read-only GPT-6.1 Sol/xhigh agents independently inspected the cause and
reviewed the exact fix/tests. Primary agent made and owns all edits and acceptance.
Private synthetic evidence lives under private/validation-0.11.34/.

## Acceptance remaining at source checkpoint

Repeat the exact legacy recovered-draft Save with the installed APK verified by
hash; inspect process/crash evidence and independently compare every app row and
media hash. Then test new journaled draft voice stop/cold reopen/publication,
cacheless ready recovery and explicit discard. Preserve original data and report
failures even if final SQL is correct. No physical A52s or 24-hour/performance/
power-loss/low-space acceptance is implied. Raw lab/contact recovery and the
other execution-ledger gates remain open.

## Exact source, artifacts and native acceptance (2026-10-08)

Application source `730b4d95c20b9e86ad32ba586f046dc3a3cd5629`; normal pre-push
check passed. [Hosted CI 37706082664](https://github.com/CodeinScrubs/medos/actions/runs/37706082664)
passed type/lint/format/tests, migration comparison and Android bundle on this
exact source. The signed QA x86_64 APK is 54,545,786 bytes, code50/name0.11.34,
target36/min24; SHA-256
`5d1693daa4804519959ac4ea91804bb7b101c5177de63e9f551e9234bdf76930`.
Required native libraries and unchanged owner signer were inspected. Pulling the
actual installed APK verifies identical bytes.

The exact-source signed owner APK `dist/MedOS-0.11.34.apk` also built successfully
and passed package/signature/native-library inspection: 52,937,459 bytes,
arm64-v8a only, code50/name0.11.34, target36/min24; SHA-256
`13331ceba59044b1356c650fabf3aabfe3f24cc18dce991c3fb25aa06d679d12`.
The unchanged signing certificate SHA-256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
This owner package was not installed on a physical phone; native acceptance
below belongs to the separately inspected x86_64 QA artifact.

On the independent offline API36.1 QA AVD, actual UI Save/Discard handlers and
native process return were observed. No fixture was injected into a real phone.

| Check | Observed result |
|---|---|
| In-place .33 to .34 upgrade | All 4,039 original rows/40 app tables and 23 media files unchanged; 22 migrations, integrity/FKs clean. |
| Exact legacy crash reproduction | Restore clean JSON voice draft, cold reopen, header Save; same process survives and leaves editor. Exactly one note/version/attachment, unchanged original text/JSON/file/hash/time; unrelated rows/files unchanged. |
| New stopped draft voice | Actual record/Stop saves one draft/journal/attachment and one verified file, with no clinical note yet. |
| Cold publication with keyboard open | Actual IME shown; original text recovered, publication and native close pass. Same attachment/file/hash/time, one note/version and retired draft. |
| Seeded ready voice protection | Save and whole-draft discard both refuse; no note/attachment appears and the ready copy/metadata survive. |
| Explicit discard branch | User confirms disposal of only the pending copy, then whole draft. Native close succeeds; draft/job soft-retired, original 24 files unchanged, no note/attachment created. |
| Cacheless ready recovery branch | Restore the isolated seed again, edit raw text, retry using verified copied bytes without the deliberately unavailable original URI. Exactly one canonical attachment appears; newer text remains. |
| Recovered voice publication | Cold reopen preserves newer text; Save-close succeeds, same attachment/path/hash/time moves to one note/version. |
| Playback | Actual elapsed marker advances from 0:02 to 0:05 and Pause returns to Play. This is native state/progress evidence, not acoustic output. |
| Final cold reopen/export | All 4,049 rows/40 tables and 25 media hashes exactly unchanged; integrity/FKs clean. |

Final archive SHA-256
`e59ac861fc53f5533265018ebffc14fa85ea2b79f11862ba9911c13b00700f81`.
Each comparison independently decrypts the exported archive with Node's
scrypt/AES-GCM, strictly parses its container and queries real SQLite; it does
not trust an in-app success label or mere counts. Original media hashes are
compared across all files. Seeds model stopped ready work, not native SQL or
power fault injection. All data/evidence files remain private and synthetic.

No fatal/ANR was observed during these .34 trials. The previous .33 Fabric
exceptions stay in the crash buffer; acceptance checks the actual current PID
and UI return rather than clearing that evidence. Native exit history shows
intentional force-stops used for cold recovery, not new .34 crashes.

## Preserved failed setup trial and evidence limits

Before .34 installation, the .33 app also suffered an input-focus ANR after
returning from the file picker while full native build/checks competed for host
resources. The focus event eventually completed in 9.674 seconds, but Android
later killed the process. Guest CPU/I/O pressure and delayed DocumentsUI are
recorded; main-thread stacks were not captured. Pressure is a plausible
contributor, not a proven sole cause, and no persistent deadlock was witnessed.
The setup XML was launcher, not restore confirmation; the later upgrade export
proved no application-row/media change from that attempted setup. This failure
remains open for pressure/phone acceptance, not silently relabeled as success.

Standard UI dump can fail to reach idle during changing playback progress. The
old fast helper also aborted on API36's missing test-base class despite printing
an apparent `OK`; no XML existed and it was rejected. Actual progress evidence
uses the observed platform test-base jar and freshly generated nonempty XML,
at the platform's nested dump path. Failed tool attempts were preserved, never
counted as playback or missing-data results.

Physical A52s microphone/speaker, active/pre-journal interruption, power loss,
low storage, native fault injection, reminders under OEM limits, performance and
a 24-hour native soak remain unverified. This correction closes the bounded
note-close and stopped draft-voice acceptance; it is not whole-product sign-off.
Next source priority is recoverable raw lab entry, then contact/doctor forms and
other original-intent gates. Safe orphan accounting and playback across restore
need their own witnesses before changes.
