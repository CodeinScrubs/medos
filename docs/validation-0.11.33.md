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

## Actual native checkpoint — still failed (2026-10-08)

Exact source `94752a79b5f4a88693b105426686f27993cc6d37`, hosted CI
37700375596 passed. Both signed code49 APKs were built and inspected. Owner
arm64 SHA-256 `0f98d560541ead0f483e111058f6ed02c99b2a8a30a486eb0d0485200aa74e7c`;
QA x86_64 `987ae4ca56602500ad6f02a4baca2412d121cbac26fe7831b20573c240731649`.
The installed QA bytes match. In-place 0.11.32 to 0.11.33 upgrade preserved
4,039 rows across 40 app tables and 23 media files exactly.

After restoring the clean legacy draft baseline and cold reopening, actual
header Save still killed PID11370. Fabric again reported `addViewAt`: Text2432
still had parent2700 when inserted into2698 under the scroll host. Private
`legacy33-full-logcat.log` retains the full hierarchy. Thus the source header
regression was corrected, but the native crash was **not** resolved. 0.11.33
is not an accepted installation candidate.

The post-crash archive SHA-256 is
`64dc0136d2ac6290dab0aedef1f1887f376bb59104c5b860fe9c14b81db1e404`.
Independent decryption/SQLite/hash comparison proves exactly one new note,
version and attachment, soft-retired linked draft, unchanged legacy text/JSON/
file/time and unrelated rows, integrity/FKs clean. This is data evidence only.
Next correction targets the saving-dependent flattening of the main Column;
see validation-0.11.34.md. Do not repeat the earlier header-only causal claim.
