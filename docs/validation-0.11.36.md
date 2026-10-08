# 0.11.36 — reversible photo annotations

Native baseline checkpoint: `4c24534ca9c509ec1111d47016ab6d259daaa166`, following
`7d5b6d9` (foundation), `04cf61f` (share admission) and `9591ee0` (canvas frame).
Full software checks and bounded native acceptance pass on inspected installed
x86_64 bytes. Final application source is `f5cd5df3480ac0aefc057959890acf25f6d262e9`,
following history `0c7d788` and touch-down `427c6d5`. Final-source native evidence
is separated below from the earlier checkpoint. This is photo-workflow acceptance,
not complete product sign-off.

## Implementation

One viewer-to-editor path provides pen, translucent highlight, arrow, typed
Persian/English text, crop/rotate, erase and undo/redo. An immutable working image
and retained original stay separate from the versioned overlay. Save publishes
the overlay; it never burns edits into the source. History can load the original
view or a prior edit as a new version without removing subsequent versions.

Migration0023 adds three attachment columns and two tables for raw edit drafts
and immutable versions. One original dataset intent/AutosaveScope holds text,
pointer updates, background/leave flush and publication. CAS and a frozen source/
clinical basis reject stale editors. Publication/version insertion/draft retirement
are one synchronous transaction. Explicit compared conflicts retain both branches.

Photo copies verify size/hash; native picker cropping happens after import.
SVG rendering shares one source-space crop/rotation scene between editor,
thumbnail, viewer and PNG. Native shaped TSpan text uses the bundled Persian font.
PNG export waits for image readiness, limits the output long edge to 2400px and
checks complete chunks/dimensions and exact cache readback. Original sharing uses
the original MIME/file. See architecture.md for the pinned SVG cache-readiness
config plugin and rejected alternatives. No dependency or permission was added.

## Executed software evidence

- Checkpoint `4c24534` full/pre-push check: typecheck, lint and formatting;
  **134 suites/1,768 app
  tests and five workflow tests**. Root workflow tests include native patch source
  drift/idempotence. Migration generation reports no new schema diff.
- Real migrated SQLite: exact raw text, CAS/replay, atomic failure rollback at
  publication boundaries, retained versions/competing branches, deleted parents,
  original-source rebinding and same-ID dataset replacement fencing.
- Drafts/versions survive backup; old absent-table restores clear new tables and
  apply SQL defaults. Existing archive/passphrase formats remain unchanged.
- Real hooks/scopes cover latest-event Save, background/leave flush, failed writes,
  completed/unfocused acknowledgment, delayed dialogs and original generation.
- Actual registered pointer callbacks cover letterbox rejection, text taps,
  zoom/pan interleaving, denied strokes, crop, resize interruption, final release
  coordinates and sparse-segment erasure. Native export corruption, same-size
  changed readback and photo-copy truncation are refused.
- Final-release and sparse-erase witnesses failed before their corrections;
  the embedded draft-size witness also failed before matching the decode limit
  to encode. The corrected witnesses pass. Private logs remain under
  `private/validation-0.11.36/`.

Two GPT-6.1 Sol/xhigh reviewers were read-only; the primary agent owns all edits,
integration, executed checks, builds and native interaction.

## Native acceptance

Existing isolated QA AVD, API36.1/x86_64, airplane mode 1, preserved userdata;
no physical phone connected. QA APK stays under private/, never dist/.
Baseline QA package `com.shayan.medos`, version 0.11.36/code52, min24/target36;
54,666,654 bytes, SHA-256
`bb8b6cf53e63598861222fc0c6551bce2737e14c54f95e922c3f5d99d0f8cda1`.
Signature and essential JNI libraries inspected; the pulled installed APK hash
matches exactly. Both ABIs must retain the owner signer SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

All records/media in this QA dataset are synthetic. Full archives are decoded
independently with Node AES-GCM/scrypt and sql.js, not the application's decoder.
An emulator-only receiver copies the granted ACTION_SEND PNG bytes verbatim;
it has no network/permissions and is not part of MedOS. PNG CRCs, decompression,
dimensions and selected actual pixels are independently checked. Nothing was
sent to another person or remote service.

| Executed flow | Observed result |
|---|---|
| .35 in-place upgrade | All 4,057 prior rows/41 app tables and 25 media hashes preserved; two new empty tables and SQL defaults; 24 migrations |
| Checkpoint `4c24534` installed over an intermediate .36 | Exact 4,061 rows/43 app tables and 28 hashes preserved |
| Persian/English pending text, force-stop/reopen | Exact text/newline/Latin 12.5 recovered; repeated on checkpoint `4c24534` |
| Erase middle of a two-point highlight, Undo | Actual sampled pixels yellow→white→identical yellow |
| Native pen/arrow publication | Final stored pen point (600,550), arrow (720,479.63), matching requested native release coordinates |
| Cached editor reopen/share twice | Save readiness succeeds; repeated 800×600 PNG bytes identical |
| Crop plus 90-degree rotation | Actual 392×588 PNG; highlight/arrow pixels match transformed source coordinates |
| Original share | Actual 1600×1200 file bytes match the retained original SHA-256 |
| Load baseline, then reapply prior version | Baseline pixels equal source exactly; reapplied crop PNG bytes identical; six versions retained |
| Native Save/Back closes | Routes actually close, app remains visible, same PID through four checkpoint publications |
| .35 archive restored into .36 | All 4,057 old rows preserved; image drafts/versions empty and new columns default; all 25 old media hashes retained |
| New full backup restored, then cold reopened | Exact 4,070 rows/43 app tables and 28 hashes, including six versions and live pending text; integrity/FKs clean |

Checkpoint `4c24534` cold snapshot SHA-256:
`f8713df0111651ceb176fb8ab5489b4875efd69f19debff6bf3aa1c4e401a8e4`.
Its new-image metadata, six versions and pending text match the pre-restore
snapshot. The source/original/thumbnail and all 25 prior media remain unchanged.
All 4,058 application rows outside the new image draft/history tables are
unchanged except the intended overlay revision/body/timestamp on the one edited
attachment.

Checkpoint native crash buffer/event scan contains zero MedOS fatal records and zero
MedOS ANR events. Intentional force-stops are recovery probes, not crashes.

## Rejected probes and remaining limits

- Earlier native PNG exposed a truncated pen endpoint despite passing earlier
  software checks. That artifact is superseded; final release handling and
  independent persisted-coordinate/native PNG probes pass.
- One early cold snapshot was taken before the editor loaded. Another baseline
  sharing probe retained the viewer's deliberately selected original mode and
  produced 1600px rather than 800px. Neither counts as acceptance. Fresh loaded
  input/explicit edited-mode checks correct the probes; evidence is retained.
- System UI showed an ANR during boot under concurrent build/check host load.
  The cause was not proved. Acceptance resumed after the host was idle; this
  does not resolve the earlier .33 pressure ANR or establish pressure safety.
- Old restore retains three unreferenced synthetic media files instead of
  sweeping them. Safe orphan accounting and a durable photo-import journal
  remain open; interruption/SQL failure can leave copied orphan files and a
  multi-photo import can commit partially.
- Acknowledged drafts recover; active pointers/keystrokes before persistence are
  not power-loss evidence. Photo captions and imaging metadata still need raw
  form recovery. Companion/doctor raw forms and remaining lab UI gaps also remain
  in IMPLEMENTATION.md.
- Physical A52s camera/gallery gestures, HEIC/other actual source formats,
  low storage, power loss, pressure/24-hour use, performance and full product
  acceptance were not run. Software fault tests are not those device trials.

## Lightweight history follow-up

The original history queries selected every complete image/raw document on
editor open and every refresh. A real SQLite witness returned 424,070 characters
for two versions. History now projects only id/revision/date; selecting a row
reads one body with matching attachment and readable version/retired-draft state
within the original dataset admission. Nothing is pruned. The same witness now
returns less than 1,000 characters, preserves the complete chosen body/raw text,
and refuses foreign/deleted/active/committed rows. All 19 focused SQL tests pass.

## Final touch/history source acceptance

Native `427c6d5` corrected the initial crop/arrow coordinate but exposed a further
failure: a stationary pen tap created no mark, despite `minDistance(0)`. This
probe is rejected. Final `f5cd5df` uses exclusive pan/tap recognition with separate
source-coordinate intents, capturing both Down and Up without adding a duplicate
dot after a stroke. Two dot witnesses fail before correction; all 21 pointer
tests pass afterwards. Resize and initial letterbox intent remain guarded.

Final full check passes **134 suites/1,780 app tests and five workflow tests**,
including typecheck, lint and formatting. Installed final QA APK: 54,670,074 bytes,
SHA-256 `146d32129d9d191f588abe4606625e200a7634604834833264c1dc31fbabd847`.
The pulled installed bytes match; package/signature/essential x86_64 libraries
were inspected. Same preserved isolated AVD and offline synthetic dataset.

| Executed final-source flow | Observed result |
|---|---|
| In-place final upgrade | All 4,071 rows/43 app tables and 28 media hashes match the pre-upgrade experimental dataset exactly |
| Stationary pen/highlight taps | Exactly one mark each; actual source points (325.02,259.92) and (349.93,259.92); exported blue/translucent-yellow pixels independently verified |
| Crop and arrow Down/Up | Crop (100.28,100,600,400), arrow (300.28,279.89)→(500.28,279.89), matching requested native touches within rounding |
| Publish and actual PNG capture | 400×600 PNG, 24,976 bytes, SHA-256 `3ef820e43d7dc229db20367da59a07c2bdd1ea7e58a224ce28fce3fa6fdbdbb2`; nine marks |
| Lazy-load baseline from history | Actual 800×600 pixel buffer equals the immutable source exactly |
| Lazy-load and publish version 6 again | PNG byte hash identical to version 6; publication revision 8 retains all nine versions (0–8) |
| Native Save/Back closes | App remains visible and PID stays unchanged through all three final-source publications |
| Restore the canonical six-version dataset, cold reopen/export | Exact 4,070 rows/43 app tables and 28 hashes match the earlier canonical snapshot; schema 24, integrity/FKs clean |
| Final cold editor reopen | Exact pending Persian/English text, newline and suffix recovered; no MedOS fatal/ANR event observed in this bounded run |

Independent SQL checks also retain all 4,058 other application rows (except the
intended three overlay fields on the edited attachment), prior versions/drafts
and all source/original/thumbnail/old media bytes. The nine-version experimental
archive is retained privately; restoring the canonical dataset is an explicit
replacement, not automatic history pruning.

Final canonical cold snapshot SHA-256:
`b697c524dfba7524fb0860daffc280fb3784318201dd2ec9d4f2e465ea965b97`.
The regular idle-based QA dump timed out while restore was still working; a
separate fresh hierarchy subsequently observed actual completion. One fast dump
also failed to pull its temporary XML; a new successful dump was used. Neither
failed automation read counts as application acceptance or a completed restore.

## Owner artifact

`npm run apk` builds the signed owner artifact at `dist/MedOS-0.11.36.apk` from
application source `f5cd5df`. Actual package: `com.shayan.medos`, .36/code52,
arm64-v8a only, min24/target36; 53,061,747 bytes; SHA-256
`2af6e2018b17d22f281319fdea4f98c8148d0738101bee26afe0c4cfb03aa449`.
Essential native libraries and the unchanged owner signer are inspected. Actual
bundles extracted from both APKs are identical: 5,762,252 bytes; SHA-256
`c9d2cc1f2569bdfde058bda0bc2a2a99c7b79f65626fe9e9fa3da5100d04b7cf`.
Byte equality supports application-source identity, not physical arm64 behavior.
The owner APK has not been installed on a physical A52s during this acceptance.

Normal pre-push checks pass all 134 suites/1,780 app tests and five workflows.
Exact application [CI37773234503](https://github.com/CodeinScrubs/medos/actions/runs/37773234503)
for `f5cd5df` succeeds, including schema/migration consistency and Android
bundling. No QA x86_64 artifact should be installed on the owner phone or copied
into dist/.
