# 0.11.31 — durable stopped quick capture and original inbox intent

## Scope and witnessed failures

Solo continuation of the owner's release/heavy-shift review. Baseline `059696a`
records the native acceptance of application `eb1979a` (0.11.30/code46).
No PR was remotely merged, approved or commented on.

Before editing the production paths, actual-handler/migrated-SQLite witnesses
failed on the baseline:

- Seven query/writer checks: capture creation accepted a retired patient;
  empty cleanup retired a stopped recording's parent; filing preceded its
  acknowledgment; old writer creation/update/cleanup crossed identical-ID restore;
  capture-kind failure did not roll back journal/media; a filed capture accepted
  a new recording. The other 54 checks in those suites passed.
- Three screen checks: first native IO saw zero journal rows, a retained recorder
  callback wrote after replacement, and copying held no dataset writer admission.
- Three card checks: retained task/note actions and delayed trash confirmation
  changed restored rows. Four existing card checks passed.
- Five picker checks failed across Today/full inbox: old assign/note callbacks
  changed restored rows, and the full inbox closed its picker on write failure.
  The existing Today retry/duplicate behavior passed.

These are defect witnesses, not invented test counts or native failure injection.

## Implementation

Stopped quick-capture voice now uses the existing `recording_jobs` journal. The
one CaptureWriter creates/owns one parent and retains its original generation.
Text/selected patient flush before journal reservation; reservation commits before
the first native fingerprint/copy. Source/hash/verified-copy recovery, stable UUID,
atomic metadata acknowledgment and explicit discard reuse the existing engine.
Capture kind, attachment/checksum and job's saved state now commit together.
A failed publication leaves a ready journal that can recover without its cache.

The screen retains one always-on AutosaveScope with its existing recorder and
text saver. It does not recursively flush the group inside a recorder callback.
New typing during copying must flush before acknowledgment/close. Original dataset
admission covers native waits; original navigation focus owns any delayed close.
Photo choices and Done have the same immutable intent/mutex boundaries. Stale
text/patient identity remains readable; explicit stale close discards only local
input after confirmation. SelectField can now disable its existing press/clear
controls accessibly; no normal-path dialog was added.

Creation resolves the active shift and validates its patient in one synchronous
transaction. Empty cleanup reads text/media/pending recording state and retires
the row atomically. Copying/ready/discarding jobs protect their parent. Filing
refuses pending recordings; after recovery the existing note/task flow works.
No new recording may start on an already filed capture.

Today/full inbox capture cards, patient choices and recovery actions retain the
parent's generation from before reads. Old deletion/filing/assignment callbacks
cannot acquire fresh authority after restore. Picker failures retain selection;
duplicate choices wait for the first acknowledgment. Delayed filing cannot
navigate over a newer route. A failure-only action opens the current inbox after
explicitly closing any previous choice, rather than silently remounting input.

0.11.31/code47 changes only scoped application/lock version fields. No migration,
dependency, permission, route, native service, archive/key scheme or clinical
formula is added. Draft-note voices remain a separate pending target contract.

## Verification

Initial extended targeted gate passed six suites / 122 checks; card/picker/read
recovery passed three suites / 58 checks. Existing media-editor navigation/file
stand-ins initially omitted the newly used contracts: the first full checks had
one failure with 1,623 other checks passing. The stand-ins now supply focused
navigation and verified journal-copy semantics without dropping their metadata,
same-file retry or failed-close assertions; both media/screen suites pass.
Final-source `npm run check` passes: typecheck, architecture lint, formatting,
126 suites / 1,635 app tests and three workflow tests. This includes the additional
capture-kind rollback and deferred inbox-navigation checks.

Exact-source CI, signed artifacts and native upgrade/recording/recovery acceptance
are pending at this source checkpoint. Record them
separately after they actually run; do not use the 0.11.30 APK as current evidence.

## Limits and next work

The durable boundary starts after the capture row and pending fields can commit
and the journal is reserved. Active/unconfirmed recording, failed initial SQL,
pre-journal interruption or cache eviction before a verified copy are not covered.
Software fingerprints stand in for native files; they do not prove a phone stop,
power-loss recovery or storage-provider behavior.

Next P0: draft-note stopped voice must preserve draft revision/publication/conflict
semantics, then manual lab/contact raw recovery and remaining async forms.
Physical A52s performance/owner shift, OEM reminders, power/low-space behavior,
remaining dependencies/clinical validation and wider product acceptance stay open.
The native 0.11.30 round completed 40 correct identities without an observed MedOS
crash, but emulator jank was 89.61%; that is not a smooth-performance sign-off.
