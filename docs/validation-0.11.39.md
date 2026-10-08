# Validation: raw forms and atomic photo batches (0.11.39)

Application source: `d21ca0e3464e34d446366b1f5b94ef8915229f33`.
Version0.11.39/Android code55. Migration0025 adds four raw/journal tables.
No dependency, permission, route or clinical formula added. This report records
bounded acceptance of that source; later working-tree edits are not in these APKs.

## Software and hosted evidence

- Full check:144 suites/1,957 application tests plus five workflow tests;
  typecheck, lint and formatting pass. Migration regeneration has no diff.
- The first concurrent clean native build/full check produced a Jest worker-exit
  warning. Focused85 UI checks with open-handle detection exited cleanly, and
  both the pre-push full run and the next session's baseline full run exited
  without that warning. This does not prove a cause for the earlier warning.
- Exact-source [hosted CI](https://github.com/CodeinScrubs/medos/actions/runs/37828724705)
  passes install, check, migration regeneration and Android JS bundle generation.
  It does not test phone hardware or validate medical practice.

## Native acceptance

An API36.1/x86_64 emulator, synthetic records and airplane mode were used.
Installation was in place; no application data was cleared. Pulling the installed
base APK proves byte identity with the inspected QA artifact.

- Directory: incomplete name refuses clinical publication; force-stop/reopen
  restores the exact raw name. Completing the name publishes exactly one doctor.
- Private profile: invalid Jalali date refuses publication and survives cold
  reopening with the exact hometown. Correcting the date preserves all untouched
  private fields and updates the intended existing profile only.
- Rating: reasoning-only raw input survives cold reopening; publication keeps
  unscored axes null and adds one rating, without invented scores.
- Imaging: invalid raw date survives cold reopening and refuses publication.
  A corrected date publishes one study bound to the originally captured encounter.
- Caption: leading/trailing spaces, Persian/English and Latin `12.5` survive
  cold recovery exactly. First Back hides the IME. Publication trims the clinical
  caption only; image originals, edits, version and all other metadata remain exact.
- These publication/Back paths were checked with font scale1.6 and an open
  software keyboard. Recorded PIDs remain unchanged without a fatal for those PIDs.
- The actual Android picker selected two synthetic PNGs together. One saved
  journal, one photo lab panel and two attachments publish together. Both source
  PNGs retain their exact original bytes/dimensions. Six source/full/thumbnail
  files independently match journal and attachment sizes/hashes. No numerical
  lab results are invented from the images.

The doctor notice initially inserted Discard above the fields on the first
autosave acknowledgment, moving the active input. A later source change moves
that action below the fields; that later fix is not acceptance of these .39 bytes.

## Independent archive comparison and restoration

Archives were authenticated/decrypted by a separate Node implementation, then
compared using migrated real SQLite and independent file fingerprints.

| Check | Exact application rows | Application tables | Media files |
|---|---:|---:|---:|
| In-place .38 to .39 upgrade |4,092 unchanged|44 old +4 empty new|28 unchanged|
| Deliberate .39 QA publications |4,090 unchanged +2 intended edits +12 new|48|28 unchanged +6 new|
| Cold reopening, before restore |4,104 unchanged|48|34 unchanged|
| Restore .38 in .39 |4,092 restored; four new tables empty|48|28 restored +6 retained current-only|
| Restore .39, then force-stop/reopen |4,104 restored exactly|48|34 unchanged|

The two intended old-row edits are the profile's hometown/date and the photo's
caption/time. Every other old column is exact. All five raw drafts are retired
and bound to their intended publications. Integrity is OK and foreign keys are
clean in every compared archive.

Restore deliberately retains files absent from an older archive. The six later
photo files become unreferenced after old restore and are rebound after current
restore. They were specifically accounted for, not ignored as arbitrary extras.
Inventory is read-only; safe storage reclamation remains separate work.

## Artifact identities

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| QA x86_64 APK |54,850,354|`21c4098877ef316faaf246c87baf272faa18e261748f909677958c451a90a51c`|
| Owner arm64 APK |53,242,027|`0a5b138a6678e4af20dc7b5d84d70d3f21246ce5f876e254bf697ee0037038f7`|
| Identical actual JS bundles |5,942,532|`450b08c07762063e8663f08fb5eee67e7f6f2055150fe7d022900f30e303907b`|

Both APKs: package `com.shayan.medos`, version0.11.39/code55, minSDK24,
targetSDK36. Signing certificate SHA-256:
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
Essential native libraries were independently inspected for the respective ABIs.
The owner artifact was built/inspected, not run on the physical phone.

## Rejected trials and limits

- A blank birth field exposes its hint in UIAutomator's `text`; an empty-string
  harness assertion failed. The final accepted witness uses an explicit valid date.
- Imaging has a date control without a time editor; an attempted clock witness
  was rejected. No native imaging clock acceptance is claimed.
- One field assertion ran while a date-error dialog covered it; the dialog was
  acknowledged before the final cold recovery/publication witness.
- After emulator restart during the next baseline check, Android System UI showed
  its own ANR dialog. The first cold-export attempt was rejected; after explicit
  acknowledgment, the actual cold/restore archives above passed. This is not
  attributed to MedOS, nor used to close the older .33 focus/pressure investigation.
- Native interrupted/failing photo import with an expired picker cache was not
  exercised. The real-SQL/byte-preserving software fault matrix is distinct.
  Picker activity death before a batch journal exists is also a remaining boundary.
- No physical A52s, acoustic playback, power-loss, low-space, provider-loss,
  reboot/Doze, whole-shift performance or clinical validation claim is made.
- Vitals/other remaining manual raw forms, clinical trash, bounded timelines and
  visual rich text still require implementation/acceptance after this checkpoint.

Ignored logs, UI hierarchies, screenshots, synthetic fixture IDs, archives,
independent decoders/oracles and native helper apps remain under `private/`.
