# 0.11.33 — preserve the native note header's mounted ancestry

## Problem and bounded correction

Solo continuation from application `f1a7e03` (0.11.32/code48). Native review
found and repeated an Android closing crash that the previous 1,668 green app
tests did not detect. Saving a recovered legacy draft commits the correct data
but then exits the process with Fabric `addViewAt` / "child already has a parent".
See validation-0.11.32.md for upgrade, archive and failed native evidence.

The completed note editor retained its header title and right-slot presence,
but changed `Screen` from scrolling to plain. The actual `Screen` puts children
under a keyboard-aware scroll host only in the first branch. Changing that host
remounts `ScreenOptions`, creates a new header slot and calls native `setOptions`
again during Back. Identical options do not protect a remounted component.

The correction keeps `Screen scroll` in the completed/read-only branch. It does
not change the note writer, transaction, recording journal, autosave guard,
dataset admission, navigation-focus checks or visible editing workflow. No
new dependency, permission, route, schema or recovery framework. Version is
0.11.33/code49 so the previous crashing artifact cannot be mistaken for this one.

## Software regression evidence

The existing media-editor suite now uses the **real** `Screen` and
`ScreenOptions`. Only native keyboard-aware scrolling is replaced with a
native-scroll stand-in; database/editor/publication handlers remain real.
Publication and discard each expose a second native header-options write before
the correction. After it, the same mounted header instance and single options
write survive completion, while the existing failure/retry, editing freeze,
late-focus, dataset-admission and voice-publication checks continue to pass.

- Before: two header-remount witnesses fail (expected one `setOptions`, got two).
- After: two suites / 15 checks pass, including both corrected completion paths.
- Full `npm run check` passes: typecheck, lint, formatting, 127 suites / 1,670
  app tests and three workflow checks. Hosted CI and rebuilt artifact/native
  acceptance remain pending at this source checkpoint. Software witnesses alone
  do not prove that the Android exception is gone.

Private reproduction logs live under `private/validation-0.11.32/`; post-fix
checks and artifacts under `private/validation-0.11.33/`. Synthetic data only.

## Acceptance and remaining work

Use the exact rebuilt source on the same independent offline API36.1 QA AVD;
inspect the APK and installed bytes. Reopen the old JSON draft, publish with
native Save, check the process/crash buffer, and independently compare all rows
and media. Then accept the new stopped-draft voice, cold reopen, atomic final
publication, seeded ready recovery without source cache and explicit discard.
Do not count a spinner or an early UI-dump timeout as an absent record, nor
an export that passes after a process restart as a crash-free run.

Physical A52s microphone/speaker, audible player progress, active/pre-journal
recording interruption, low storage, power loss, native fault injection, OEM
reminders, performance and a 24-hour native soak remain separate gates. Safe
orphan-media accounting, raw manual lab/contact recovery and the remaining
async forms are still open. This patch is not complete product/P0 acceptance.
