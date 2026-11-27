# Validation: age certainty for imported birth identity (0.11.65)

Frozen source `58642e8a63c31fbff590479e9bbd2bd91fd36407`, .65/code81 on
`codex/age-certainty`, based on94b43c0 (PR15). Draft PR16 is not merged.
No schema, migration, dependency, route, permission, clinical tool, archive or key
change. Raw identity records remain unchanged; only derived age is withheld when
its date/clock cannot establish it. The .64 menu/edit repair is inherited.

Normal patient publication already rejects a future birth date with
`validateDateInput(...allowFuture:false)`. Base snapshots explicitly retain
historically future dates. Do not claim the ordinary form permits that input.
The defect concerns imported/display/calculation: a future date shows0 days and
negative whole years; an invalid supplied clock shows0 days and NaN whole years.
Independent split witnesses against94b43c0 fail four/pass one (initial grouped
cases fail two/pass one). No actual patient harm or phone crash is inferred.

The helpers now check existing civil-calendar day difference. Future DOB or an
invalid calculation clock returns the existing unknown display/null calculation;
no fallback silently contradicts a present future DOB. A later unknown hour on
the same birth date remains0 days/year0. Gregorian leap-day birthday behavior,
recorded manual-age fallback without DOB and existing months/days stay unchanged.
No data is erased, corrected or automatically diagnosed because of this display.

After repair the private five witnesses pass. Integrated five related suites
pass119 tests: Jalali, patient identity/header/drafts and extension actions. The
requested doctors/occasions test filename was absent; only those five ran. The
actual doctor/occasion reminder suites then pass35 tests separately. Four new
age/boundary cases preserve previous assertions. Full `npm run check` passes197
suites/2,949 app tests and five workflow checks, typecheck/lint/format, zero lint
warnings; Jest289.219 seconds and checked bytes unchanged. Normal push repeats
the full check, with Jest381.533 seconds. The
[exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/38196394695/job/114639885436)
succeeds, including migration regeneration and the Android bundle.

## Actual artifacts

Both signed APKs were built from the frozen source and inspected for package
`com.shayan.medos`, version0.11.65/code81, minSdk24, targetSdk36, their sole
intended ABI, signer and essential JNI libraries. Installed x86 bytes were
pulled back and matched the inspected artifact's hash. The owner artifact is
local and gitignored, not a published GitHub release or physical-phone result.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/MedOS-0.11.65.apk` (arm64-v8a) | 53,575,347 | `e1885895e3a734d9269363d894d3bdee1f2e58aa9d77c63999dfb9ede210601c` |
| Private x86_64 QA APK | 55,183,674 | `1f4c1d4c69ab2318f2997180a795ba858918c80454611211f7e97cc01e061396` |

Both retain certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
The resumed QA build initially fails with native clang's "No space left on
device" after11m50s.159 historical private APK copies are relocated only after
destination length/hash verification, recovering8,336,517,496 bytes; the private
manifest retains both paths and hashes. Current artifacts, backups, media,
databases, keys and AVD bases are preserved. QA retry succeeds in3m26s
(834 tasks:70 executed/764 up-to-date); owner Gradle succeeds in10m2s
(910 tasks:148 executed/762 up-to-date). These are build timings, not app latency.

## Native and independent complete-state acceptance

The owned read-only x86_64 AVD starts from .50/code66. Installation uses `-r`
with the existing signer; there is no uninstall, data wipe or phone operation.
Its first two native app-produced encrypted archives establish the actual
.50-to-.65 upgrade:

- 53 old tables become55; all tables are inspected and49 remain identical.
  The two added history/form tables start empty. The three exact migration
  receipts are verified against the known .63 ledger.
- All41 prior synthetic patients and248 notes remain unchanged; all34 media
  paths, sizes and byte hashes match. Existing257 audit rows remain unchanged.
- The remaining changes are enumerated migration/backup receipts and exact
  backup/restore settings, not a blanket exclusion of technical tables.

A separately authenticated .63-derived fixture retains its own baseline
records/media and adds one synthetic patient with a future DOB and conflicting
manual age. App restore
acknowledges42 patients and34 files. Independent reading checks all55 tables:
52 are unchanged; raw identity, note bodies and all34 media hashes are retained.
Device-local backup receipts and merged pre-restore audit are checked separately.
No private archive, passphrase, database body or image is committed.

Actual UI acceptance on the installed .65 bytes then verifies:

- The inherited .64 three-choice extension menu dismisses with Android Back
  and with an observed tap above the dialog, without choosing an operation.
- Edit opens the original shown extension and parent. Exact visible field
  values and their observed label/bounds association are checked; no correction
  is submitted. Closing the unchanged form returns to the original list.
- The synthetic future DOB with conflicting manual age shows sex-only metadata
  in both patient header and filtered deck, without an invented newborn age or
  manual-age substitution. Invalid-clock behavior remains software evidence.
- An intentional app-only force-stop creates a distinct cold PID. The header
  age display and menu dismissal still work. Both original and cold action
  intervals retain their PIDs and have no matching app fatal in the crash buffer.

Complete app-created encrypted archives before these actions and after cold
start authenticate16 chunks each, pass SQLite integrity/foreign-key checks and
independently compare all55 tables.52 remain identical, including42 patients,
248 notes, raw birth identity and notebook drafts. All34 media byte hashes and
269 prior audit rows remain unchanged. The only differences are the exact
backup completion/new-run receipt, one backup-created audit, two backup settings
and startup's zero unresolved-media setting. A matching counter alone is not
the acceptance oracle.

## Failed probes and limits

Earlier owned host processes disappear without completion receipts; the cause
is unknown. Their partial logs are not accepted builds/tests. Both departed
read-only runs preserve the base image hashes. The final AVD is shut down
normally; its owned PID/serial disappear and both base image lengths/hashes
match the recorded pre-launch values.

System UI's own ANR dialog is observed around boot and handled through its
actual Wait button. No causal claim or blanket Android stability follows.
Initial null-root snapshots, provider-search class/fallback-file inventory and
flattened field-association probes fail and are retained separately. A tap at
the far screen edge does not dismiss the menu; the observed above-dialog tap
does. The first restore observer expires before actual success; it is not
rewritten as a pass. The final restore acknowledges completion in96,431
observer-inclusive milliseconds. That does not measure cryptography alone or
predict phone performance.

No standalone .64 APK/native pass is claimed: its inherited repair is accepted
on .65. Prior .63 diagnostic/recovery/report-reader evidence remains attributed
to57ae67e. Source, documentation and unrelated WIP stay frozen during their
respective required checks/builds/native acceptance; this later documentation
checkpoint changes no installed application bytes.

Physical phone, timed full40-patient shift, rich text, other notebook/doctor
recovery, broader outpatient/follow-up use, selected local coding-agent evidence
and clinical review gates remain open. There is no perfect/crash-free claim.
