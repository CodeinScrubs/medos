# 0.11.37 — companion recovery and manual form integrity

This is a bounded integrity release. It does not declare all requested modules
or full product acceptance complete. The newest HANDOFF records delivery and
remaining work. Application source is `5924bd1`, including `856ef8d` and
`f1ae818`; later documentation does not change the application bundle.

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
- Initial integrated `npm run check` passes137 suites/1,851 app tests and five workflow
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
Independent raw archive comparison subsequently confirms that assertion.

The first native invalid-Save trial instead exposed an actual usability defect:
the IME covered footer Save, and tapping its underlying UI-dump coordinates
inserted a keypad digit rather than publishing. Do not count that trial as a
passing validation refusal. The header correction subsequently passes actual
IME-open refusal/publication/Close on `f1ae818`. Four corresponding
source witnesses fail before correction; the corrected two-suite group passes
50 tests. Final full `npm run check` passes137 suites/1,855 app tests and five
workflows, including typecheck/lint/formatting.

The first QA Gradle invocation used the mobile directory rather than generated
android/. That invocation failed without building an artifact. The corrected
invocation succeeds in11m48s after prebuild regenerated native code. Rejected
trials/logs remain private; no app data was wiped or orphan media swept.

Sourcef1ae818/code53 rebuilt in2m53s and installed with byte-identical inspected
copy. Actual IME-open invalid contact Save refuses publication. Full archives
prove exact partial raw recovery (4,071 rows), one contact plus soft-retired token
(4,072), and an independent soft-discard preserving the contact (4,073).
The native process stays14990 through Save/Discard; no fatal for that PID.

Directory/profile/rating header Save/Close and lab custom unit/invalid/H/L Remove
pass native interaction. Independent archive comparison then caught a QA-driver
mistake: duplicate "Notes" captions selected Tags. That trial does not prove
doctor-note persistence. Tags were restored and the actual Notes field exercised
again; corrected archive comparison passes all4,078 rows/44 tables/28 media,
exact doctor/profile/rating text, one lab value+mg/dL and unchanged unrelated data.

The actual flowsheet also exposed inherited mono line-height overflowing its
fixed row. Explicit value/unit line metrics and font-scaled row/column/header
geometry correct it; two real-Text/theme witnesses fail before, then pass at
font scales1/1.6. The nine-test table group passes. First full layout check fails
only because an older intent-test Theme double omitted typography; that double
now preserves the real typography contract. Related group26 tests passes; final
integrated `npm run check` passes137 suites/1,857 app tests+5 workflows with
typecheck/lint/formatting. Do not count the rejected check as green.

Final `5924bd1` QA APK rebuilt in1m51s and installed in place. The installed APK
is byte-identical to the inspected file. Actual screenshots and independently
checked native hierarchy bounds confirm that the original12.4 value and mg/dL
unit fit their own aligned row/cell without overlap at font scales1 and1.6.
The row grows from100px to152px; font scale was returned to1. No clinical value
or unit was converted. In-place archive comparison preserves all4,078 rows/
44 application tables/28 media hashes exactly. An initial deep link raced font
configuration recreation; that bounded driver attempt is rejected, followed by
a fresh route and actual successful export. No data was wiped.

A new incomplete companion (`03` plus exact name/notes) survives acknowledged
autosave and force-stop/cold reopen. The independent archive oracle confirms
4,079 rows, three draft rows (one open), unchanged published contacts and all
unrelated rows/media. This is raw recovery, not clinical publication.

Actual current0.11.37 restore completes. The previously mounted companion form
retains its exact input read-only, refuses publication and requires explicit
old-form Close. Native PID remains unchanged through that Close, with no fatal
for it. Cold reopen returns editable exact input; independently decrypted archive
comparison preserves all4,079 rows/44 tables/28 media hashes exactly, with clean
SQLite integrity/foreign keys.

Actual0.11.36 restore also completes. The old mounted form remains read-only
until explicit Close, without a native process exit. Independent comparison to
the original archive preserves all4,070 old rows/43 old tables/28 media hashes;
the new contact draft table is empty and the installed schema keeps25 migrations.
Intermittent fast-hierarchy file-pull failures are rejected QA observations;
a fresh normal hierarchy confirms the actual success dialog. Never infer success
from a missing hierarchy. Returning to the current0.11.37 snapshot also succeeds;
force-stop/cold reopen restores the exact editable raw fields. Final independent
archive comparison preserves all4,079 rows/44 application tables/28 media hashes,
with clean integrity/FKs. The archive SHA-256 is
`3d661c96bd95a4275ce135e7a1adcec957dc24707790f424670a7d768d073b6f`.
The original final raw checkpoint is
`d16b9121df3e0a9e2a38d0b10c77ec7712aa780bd131906140249b807753ba27`.
Archive hashes differ because metadata/encryption are fresh; actual compared
application rows and media bytes are identical. The prior hardware-IME setting
was restored and the app stopped before the owner build. No physical-device
claim follows from these emulator checks.

### Final QA artifact

- Source: `5924bd137e61d81aa9c8537b1a71a66ed2f89fba`.
- APK:54,726,550 bytes, x86_64 only; not copied to owner dist/.
- SHA-256: `444f9316c98187e2c814ecba00e030a8622a010af4cd2e10ac2f020abb9c8caa`.
- Package `com.shayan.medos`, version0.11.37/code53, minSDK24/target36.
- Required Expo/SQLite/React Native/Reanimated/Worklets/Hermes libraries present.
- Signature verified; unchanged owner certificate SHA-256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Airplane mode enabled. This proves bounded emulator behavior, not A52s hardware.

### Signed owner artifact

`npm run apk` succeeds in8m6s after the ABI switch, including required native
library inspection. The separately inspected owner APK is
`dist/MedOS-0.11.37.apk`,53,118,223 bytes, arm64-v8a only. It has the same verified
certificate/package/version/code/minSDK/targetSDK as the QA artifact.

- APK SHA-256: `2939d2832bdb0feae1480b4f642bfa07c765a3852f681545e910ae326675b817`.
- Actual embedded Android bundle:5,818,728 bytes.
- Bundle SHA-256: `e55fede30dc4c2fba0ac3cc35211419ab4e8e9a3958ebe50493181bdb1b6b835`.
- Actual QA and owner embedded bundle bytes are identical; neither version names
  nor build success alone were used as equivalence evidence.
- Only emulator-5556 is connected. The owner arm64 APK has not been installed or
  tested on the physical A52s. x86_64 acceptance is not hardware acceptance.

Hosted CI remains a separate delivery check, recorded after the actual run.

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
