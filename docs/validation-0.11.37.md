# 0.11.37 — companion recovery and manual form integrity

This is a bounded integrity release. It does not declare all requested modules
or full product acceptance complete. The newest HANDOFF records final source,
artifact identity and verification. Native/artifact work is pending until
explicitly recorded below.

## Implemented

- Additive migration0024 stores exact companion raw input separately from
  published patient contacts. Publication, committed token and soft retirement
  share one transaction; retries cannot create a second contact.
- Original intent, retained form, visible read failure/retry, competing-draft
  comparison, explicit guarded Load/Keep/Discard and focused Close. One
  AutosaveScope protects background/leave flush; unknown bytes stay intact.
- Directory/profile/rating manual forms retain loaded input and original intent
  through restore/deletion/read failures. Synchronous latest/acting/completed
  refs prevent duplicate submission and stale event publication; delayed
  acknowledgment cannot pop a newer route. Profile/rating parent checks and
  profile upsert run synchronously. Only locally changed directory/profile
  fields enter a basis-checked patch; specialty fields are a conflict group.
- Persist the imported photo checksum and original MIME already returned by
  storage. Old null metadata is left unguessed.
- Add custom lab unit input to the existing recoverable raw lab document.
  Keep Remove available beside invalid/H/L markers. Flowsheet/history show each
  recorded unit; no numerical unit conversion or new clinical formula.
- Version0.11.37/code53. No dependency, permission or route added.
- A stable header uses the existing publication/Close handler for companion,
  directory, profile and rating forms, keeping it reachable above the keyboard.
  Slot/title/scroll/native parent remain mounted through acknowledgment.

## Software evidence

- Baseline was clean `a08bc18`; `npm run brief` and `npm run check` passed
  134 suites/1,780 app tests and five workflow tests before production changes.
- New photo witnesses first failed because checksum/original MIME became null;
  the direct-query and picker-to-SQLite witnesses pass after correction.
- New lab witnesses first failed for missing Unit and missing Remove with
  `5,8`, low and high values. The fixed photo/lab group passes83 tests.
- Integrated contact/doctor/occasion/flowsheet group passes111 tests.
  Migrated SQLite tests cover raw bytes, partial phone, parent deletion,
  publication/retirement rollback, replay, CAS, third writes, original dataset
  fencing and old/current backup table discovery. Real Screen/Column/View
  witnesses retain scroll/native parent/header during acknowledgment.
- Final full `npm run check` passes137 suites/1,851 app tests and five workflow
  tests, including typecheck, lint and formatting. An earlier integration attempt
  failed formatting in the three doctor screens; those files were formatted
  from the root and the affected helper dependency was corrected. Do not count
  that rejected attempt as successful verification.

Ignored detailed logs are under private/validation-0.11.37. Test counts are
executed scope counts, not separate certifications of every screen or device.

## Native and artifact evidence

Only isolated emulator-5556/API36.1/x86_64 is connected. The first inspected
source856ef8d/code53 APK installed in place with byte-identical installed copy.
Independent full-backup decryption/SQLite/hash comparison preserves all4,070
old rows/43 old app tables/28 media files exactly, adding one empty draft table
and migration0024 (25 migrations total); integrity/FKs are clean.

Actual partial phone/name/notes/relation survive force-stop/cold reopen. Native
radio state is `selected`, not `checked`; the first relation assertion used the
wrong field and is not evidence of a product failure. Fresh state confirms all
four exact fields without a clinical contact being intentionally published.
The final archive oracle still needs to verify that last assertion independently.

The first native invalid-Save trial instead exposed an actual usability defect:
the IME covered footer Save, and tapping its underlying UI-dump coordinates
inserted a keypad digit rather than publishing. Do not count that trial as a
passing validation refusal. A header correction is being rebuilt and must pass
actual IME-open refusal/publication/Close before acceptance. Four corresponding
source witnesses fail before correction; the corrected two-suite group passes
50 tests. Final full `npm run check` passes137 suites/1,855 app tests and five
workflows, including typecheck/lint/formatting. Owner APK and rebuilt native
continuation are pending.

The first QA Gradle invocation used the mobile directory rather than generated
android/. That invocation failed without building an artifact. The corrected
invocation succeeds in11m48s after prebuild regenerated native code. Rejected
trials/logs remain private; no app data was wiped or orphan media swept.

## Still open

- Durable raw recovery for doctor/profile/rating and photo-caption/imaging
  forms. The manual helper intentionally guards submission only; unsubmitted
  doctor text remains process-local.
- Durable photo batch journal, atomic batch/new lab-panel publication and safe
  orphan inventory. A failed second import may leave the first attachment
  committed and copied files unlinked; never sweep those files as a fix.
- Physical A52s camera/gallery/HEIC, real voice/reminders/SAF grants, power and
  low-space behavior, a full heavy shift, pressure/performance and the earlier
  0.11.33 pressure ANR. A bounded passing emulator trial cannot close them.
- Sourced clinical score/algorithm validation and physician review remain
  per-tool gates; no chat-generated formula or treatment guess was introduced.
- Five open PR heads are unchanged from the earlier review. None was merged
  or commented on in this scope; mergeability is not correctness evidence.
