# Validation: clipboard laboratory units and reference compatibility (0.11.38)

This report records the evidence for this change, not full product acceptance.
Version 0.11.38/Android code 54; no migration, dependency, permission or route added.
Application source: `cf5c57113839f524ab3836f750749d1a80282616`.

## Defects and final behavior

An explicit `Hb\t140\tg/L` paste into a `g/dL` row previously kept the old label
and bounds, silently describing the source value in a different unit. The paste
now keeps `140` and `g/L` together and clears both incompatible reference bounds.
Pasting into a unitless row also clears bounds whose unit cannot be established.

A newly pasted known analyte previously received its preset range regardless of
an explicit differing unit. An adult `FBS\t7\tmmol/L` could consequently be marked
low against 70–100, whose preset unit is `mg/dL`. Only a matching unit label can now
receive the preset range; differing labels retain the source value/unit with no
guessed bounds or flag. The numeric preset values themselves are unchanged.

Trend grouping previously lowercased unit labels, merging `mg/dL` with `Mg/dL`
and `mmol/L` with `Mmol/L`. The [BIPM SI prefix table](https://www.bipm.org/en/measurement-units/si-prefixes)
defines lowercase `m` and uppercase `M` as different prefixes. Unit labels now match
after outer trimming only. Different labels are excluded from the current unit
series; existing visible unlabelled assumptions remain counted. There is no
guessed conversion or alias mapping.

The existing brief paste acknowledgment also counts incompatible ranges not
applied. Same-unit pastes retain the row's recorded bounds; a paste without an
explicit unit keeps the existing row's unit/range. The awaited-read protection
for intervening edits is unchanged. Historical stored rows are not rewritten:
review their source before correcting an earlier incompatible import.

## Software evidence

- Real migrated SQLite screen witnesses: changed-unit existing row, unitless
  existing row, two new differing explicit units and same-unit outer whitespace.
- Chart witnesses distinguish `mg`/`Mg` and `mmol`/`Mmol`, while outer whitespace matches.
- Before correction: final clipboard witnesses 4 failures/29 passes; new chart
  witnesses 2 failures/63 passes. Private earlier trial with a discarded skip-row
  expectation is not the final behavior contract.
- After correction: the two focused suites pass 98 tests.
- Full `npm run check` passes 137 suites/1,864 app tests and five workflow tests,
  with typecheck, lint and formatting green. Native fixtures, archives, logs and
  owner/device details remain private; no real patient data is in the repository.

## Native evidence

Only emulator-5556/API 36.1/x86_64 is connected. It uses synthetic QA records and
airplane mode. No physical phone was tested, and no app data was cleared.
The inspected APK was installed in place; pulling the installed base APK proves
its bytes match the inspected file, not merely its displayed version.

An ignored, emulator-only native Activity supplied exact base64-decoded UTF-8
clipboard text. This uses the actual Expo Clipboard read/button, not a mocked
callback or direct database write. The helper adds no MedOS dependency,
permission or product UI and is never an owner artifact.

- In-place 0.11.37→0.11.38 comparison preserves all 4,079 application rows in 44
  tables and 28 archived media hashes exactly, with 25 migrations and clean
  integrity/foreign keys. The preexisting incomplete companion remains intact.
- Existing historical Hb 12.5 g/dL has recorded bounds 10–15. Actual `Hb\t14\t  g/dL  `
  paste retains those bounds. Actual `Hb\t140\tg/L` paste changes the displayed
  unit to g/L, shows no reference and acknowledges one incompatible range.
- After acknowledged raw autosave, force-stop/cold reopening recovers 140 g/L
  without reference bounds. An independent archive oracle proves 4,080 rows:
  exactly one new open raw draft, unchanged clinical results and unrelated data/
  media. Its original basis still retains 12.5 g/dL and 10–15 for conflict review.
- Native publication produces 140 g/L, null bounds and null flag. The original
  three value rows remain soft-deleted; the newly published copies of the other
  two values, panel metadata, collected time and unrelated records are preserved.
  The oracle proves 4,083 rows.
- A real new adult `FBS\t7\tmmol/L` paste shows no reference and acknowledges
  the incompatible preset range. Native publication yields 7 mmol/L, no bounds/
  flag and one retired/committed raw draft. The oracle proves 4,086 rows. No
  numeric conversion or reference guessed from another unit is performed.
- Two new synthetic prefix witnesses have 3.1 mg/dL at 00:00 and 4.1 Mg/dL at 01:00.
  Actual trend UI uses the latest `Mg/dL` label, excludes one differently labelled
  result from its numeric series and retains both exact labels/numbers in the
  history. It correctly refuses a two-point chart when only one point has the
  current unit. Screenshots and native hierarchy agree; archive verification
  confirms exact labels, one-hour ordering, one publication per draft and all
  prior rows/media, totaling 4,092 rows.
- Three captured publication returns (new FBS and two prefix panels) retain
  PID 22225 with the app visible and no fatal for that PID. Subsequent cold
  reopening retains the grouping; independent final comparison preserves all
  4,092 rows/44 tables/28 media hashes exactly, with clean integrity/FKs.
- Five live PR heads match the previously reviewed heads. None was merged or
  commented on; GitHub mergeability alone is not correctness evidence.

The independent archive checks ignore operational audit/settings/backup-run
rows, compare application rows by all columns, and compare all archived media
hashes. They do not infer hardware or power-loss durability from counts.

### Rejected driver expectation

The first publication script incorrectly waited for a completed Close button.
A focused lab Save automatically returns using the existing navigation contract;
that script failed after finding the patient root. It is not Close acceptance
or a product failure. Fresh UI and the independent archive confirm the focused
publication. Later trials explicitly capture/check its expected process return.

### Inspected and installed QA artifact

- Application source: `cf5c57113839f524ab3836f750749d1a80282616`.
- Build succeeds in 10m55s; APK 54,726,938 bytes, x86_64 only, outside dist/.
- SHA-256: `57cdbc62b69d90e6f0f31090f9d703c9dee7cdec2b9a0cb144e9c72453c99600`.
- Package `com.shayan.medos`, version 0.11.38/code 54, minSDK 24/target 36.
- Actual required Expo/SQLite/React Native/Reanimated/Worklets/Hermes libraries
  are present. Signature verification passes with unchanged owner certificate
  SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Installed base APK bytes match this inspected artifact. Normal font/hardware-
  IME settings are unchanged; airplane mode remains on. App stopped before the
  owner build to avoid mixing a native trial with host build pressure.

### Signed owner artifact

`npm run apk` succeeds in 7m41s and inspects required native libraries before
copying `dist/MedOS-0.11.38.apk`. A separate inspection confirms arm64-v8a only,
53,118,611 bytes, the same package/version/code/minSDK/targetSDK and verified
owner certificate as the accepted QA artifact.

- APK SHA-256: `c96496eb36d12640a6db8a2ce646b9eb98c85a0dbdff6bc68904154126cf20b1`.
- Actual embedded JS bundle: 5,819,116 bytes.
- Bundle SHA-256: `830d2831e96eaaaddcb8788999b1e3839dcf3061bfdf5989d2d54765b9a1e3b0`.
- Actual owner and accepted QA bundle bytes are identical. A displayed version
  or successful build alone was not used as equivalence evidence.
- The signed arm64 APK has not been installed or tested on a physical A52s.
  Emulator behavior does not prove HEIC/audio/SAF/reminder or power-loss behavior.

### Hosted delivery

Normal push and hosted CI are next on the delivery commit. No earlier run or
APK identity substitutes for its checks; record the actual run before checkout.

## Still open

Durable doctor/profile/rating and photo-caption/imaging raw input, photo batch
publication/journal and orphan inventory remain open. No existing unlinked
original is deleted. Physical A52s camera/HEIC/audio/reminders/SAF, low-space/
power behavior and a complete heavy shift remain separate. The earlier 0.11.33
pressure ANR is unresolved. Clinical tools still require per-tool sources,
boundary evidence and physician review. No formula from a chat was introduced.
