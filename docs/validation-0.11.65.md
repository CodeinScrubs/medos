# Validation: age certainty for imported birth identity (0.11.65)

Candidate .65/code81 on `codex/age-certainty`, based on94b43c0 (PR15).
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
warnings; Jest289.219 seconds and checked bytes unchanged. Normal push/source
CI and final artifact/native acceptance remain pending at this source checkpoint.

To avoid rebuilding a transient intermediate version, .64's menu Back/outside/
edit/cold acceptance will run on the frozen .65 APK, with attribution to these
inherited source changes. No standalone .64 APK or native pass is claimed.
Prior .63 diagnostic/recovery/archive proof stays attributed to57ae67e. Current
source/docs and unrelated WIP stay frozen through each required check/build.

Physical phone, timed full40-patient shift, rich text, other notebook/doctor
recovery, broader outpatient/follow-up use, selected local coding-agent evidence
and clinical review gates remain open. There is no perfect/crash-free claim.
