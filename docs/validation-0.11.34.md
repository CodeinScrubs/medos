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
