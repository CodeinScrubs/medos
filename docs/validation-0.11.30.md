# 0.11.30 — native findings before senior-developer handoff

## Scope and reproduction

Continuation of the owner's heavy-shift/release review, baseline `1fb86ff`
(0.11.29/code45). Work is solo. No PR was remotely merged/approved/commented on.
The full 0.11.29 software, signed-build, native upgrade and 40-patient archive
evidence is in [validation-0.11.29.md](validation-0.11.29.md).

Native review found excessive vertical space before the first shift patient:
the screen added top safe area below an already-inset native header and displayed
three large administrative action rows. The fix is deliberately local: shift
and round screens omit the duplicate top edge but retain Screen's bottom edge;
round/add-patient remain direct; bulk-add/end-shift are inline under one labeled
options control. Filtering/reorder and their original autosave scope are unchanged.
The existing unsaved handoff/reorder integration now also exercises opening and
closing these controls without losing pending text.

A second finding appeared when a native reminder/permission acknowledgment
finished after another deep link had opened. Calling global router.back from the
old form popped the newer route. A migrated-SQLite/actual-handler witness held
scheduleReminder, changed the original navigation focus, then released the native
promise: the pre-fix test failed (one unexpected back; nine other checks passed).
The form now checks its originating navigation's isFocused before a delayed
close, retains its completed read-only state when unfocused, and offers one close
when revisited. Publication remains atomic/idempotent and original dataset
admission is unchanged. A redundant second Close button was removed.

Version is 0.11.30/code46, with only the scoped package/app/lock version fields
updated. No schema/migration, dependency, permission, route, native module,
archive/key scheme or clinical formula change. AGENTS records the difference
between dataset ownership and navigation ownership for subsequent agents.

## Software evidence

The pre-fix navigation witness failed as expected; after correction all four
targeted suites / 40 checks passed (occasion handlers/drafts and shift/round).
An additional completed-editor/restore check preserves one usable stale Close
without modifying restored rows; the occasion suite then passed all 11 checks.
The first full run had two failures in editor-recovery because its existing
navigation stand-in omitted the newly used isFocused API (123 suites / 1609
checks passed). That stand-in now supplies a focused navigation; the existing
read/failure/duplicate assertions were retained. Full final-source check and
exact-source CI are recorded below once they run. A software navigation stand-in
is not native route acceptance. Final `npm run check` passed 124 suites /
**1611 app tests**, three workflow tests, typecheck, zero-warning lint and
formatting. The source was frozen after this check; source CI/builds follow.

## Artifact and native evidence

Pending at this source checkpoint: signed arm64/x86 builds, in-place synthetic
upgrade/archive comparison, compact shift layout and save/close/round native
acceptance. Do not use 0.11.29 APKs as evidence for the 0.11.30 source.

## Release decision and remaining work

The repository can be handed to a senior developer with AGENTS, HANDOFF,
architecture, review-guide and the prioritized IMPLEMENTATION ledger. That is
review readiness, not a signed-off paper replacement. An installable APK is not
a guarantee of zero crashes or a smooth physical-device shift.

Remaining gates include physical A52s timing/scrolling and an observed owner
shift, OEM reminders after reboot/permission changes, power/low-space/provider
failures, durable pre-ack stopped audio for new note/capture, manual lab/contact
raw recovery, the remaining everyday product flows, outstanding dependency
reachability review and independent clinical review. Some other asynchronous
forms still require the same navigation-ownership audit. Read the ledger rather
than assuming that this bounded fix or a test total closes those gaps.
