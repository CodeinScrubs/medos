# Validation: clipboard laboratory units and reference compatibility (0.11.38)

This report records the evidence for this change, not full product acceptance.
Version0.11.38/Android code54; no migration, dependency, permission or route added.
Application source and actual artifact identities are recorded after native QA.

## Defects and final behavior

An explicit `Hb\t140\tg/L` paste into a `g/dL` row previously kept the old label
and bounds, silently describing the source value in a different unit. The paste
now keeps140 andg/L together and clears both incompatible reference bounds.
Pasting into a unitless row also clears bounds whose unit cannot be established.

A newly pasted known analyte previously received its preset range regardless of
an explicit differing unit. An adult `FBS\t7\tmmol/L` could consequently be marked
low against70–100, whose preset unit ismg/dL. Only a matching unit label can now
receive the preset range; differing labels retain the source value/unit with no
guessed bounds or flag. The numeric preset values themselves are unchanged.

Trend grouping previously lowercased unit labels, mergingmg/dL withMg/dL and
mmol/L withMmol/L. The [BIPM SI prefix table](https://www.bipm.org/en/measurement-units/si-prefixes)
defines lowercasem and uppercaseM as different prefixes. Unit labels now match
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
- Chart witnesses distinguishmg/Mg andmmol/Mmol, while outer whitespace matches.
- Before correction: final clipboard witnesses4 failures/29 passes; new chart
  witnesses2 failures/63 passes. Private earlier trial with a discarded skip-row
  expectation is not the final behavior contract.
- After correction: the two focused suites pass98 tests.
- Full `npm run check` passes137 suites/1,864 app tests and five workflow tests,
  with typecheck, lint and formatting green. Logs are private; no synthetic
  fixtures or owner/device details are added to public source output.

## Native and artifact evidence

Pending on this source checkpoint. The0.11.37 emulator acceptance and owner APK
do not prove0.11.38 behavior. The next checks use an inspected/byte-verified
x86_64 APK, real native clipboard input and independent backup comparisons;
the separately built signed arm64 owner artifact must have the same actual JS.

## Still open

Durable doctor/profile/rating and photo-caption/imaging raw input, photo batch
publication/journal and orphan inventory remain open. No existing unlinked
original is deleted. Physical A52s camera/HEIC/audio/reminders/SAF, low-space/
power behavior and a complete heavy shift remain separate. The earlier0.11.33
pressure ANR is unresolved. Clinical tools still require per-tool sources,
boundary evidence and physician review. No formula from a chat was introduced.
