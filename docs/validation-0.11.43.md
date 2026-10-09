# 0.11.43 — trash restore and retained clinical context

Source: `9e7f083556145538ad4848941b3e6553b3bf56bd`. Evidence collected2026-10-09
by GPT-6 via Codex, primary only. The later .44 notes-read source is not in
this APK. The isolated emulator holds fabricated QA records only.

## Source checks and actual artifact

Full local and normal pre-push checks pass150 suites/2,058 app tests and five
workflow checks, with typecheck/lint/format green. Exact-source hosted CI:
https://github.com/CodeinScrubs/medos/actions/runs/37863018305.

- QA APK:54,908,190 bytes; SHA256
  `734c0f84f4ba70447e0f662008610360846beeecc20c79d8956f95cf58759d22`.
- Actual package `com.shayan.medos`, version0.11.43/code59, minSDK24/target36.
- Actual x86_64 ABI, required JNI libraries and owner signing certificate pass.
- Release build completed in13m56s. In-place installation preserved app data.
  The pulled installed base APK is byte-identical to the inspected artifact.

No .43 owner arm64 APK or physical-phone acceptance is implied. The QA APK
remains private and was not copied to `dist/`.

## Native delete/restore witnesses

An existing synthetic note with one voice and its existing patient were deleted
through the actual UI. The new trash shows both with their deletion dates.

1. Restoring the note before its patient is visibly refused. The first archive
   confirms that both remain deleted, with no restoration audit or duplicate.
2. Restoring the patient removes only its trash card. Its separately deleted
   note remains in the trash, with the same content and original context.
3. Explicitly restoring the note clears its card. After force-stop/reopen, its
   original text and one-voice count appear on the original patient's notes tab.
   The existing patient retains its recorded admission status.

No restoration success modal interrupts the list. These are bounded two-record
witnesses; they do not establish native overflow performance, every restore kind,
failure under low storage, concurrent replacement or physical voice playback.

## Independent encrypted archive checks

Independent decoding and SQLite comparison retain4,117 application rows in49
tables and all34 media entries/hashes throughout. The upgrade export is exact
against the accepted .42 current dataset, including all row columns. SHA256:
`aead70d46707fdd3214121a7a2fb01b0c1b3e1b3714ce490f88e5860452d59e1`.

For the three UI checkpoints, every unrelated row is exact (4,115 rows). Only
the two intended existing patient/note deletion/update timestamps change; their
other content, ids, clinical time and encounter association remain exact.
Each successful delete/restore has exactly one corresponding id-only audit.
The refused restore has none. No application row is added or lost.

- Both deleted, after refused child restoration:
  `bd0e7aea86d22500d009291bebe287140a9b408d2a9034628bc81d91dc8ab599`.
- Parent restored, child still deleted:
  `1e630b5294cc618f6d87afedf03fa2f9827c1611f2752b99f3656331820640ec`.
- Both explicitly restored, after cold restart:
  `b3148cb30500620edc8325601ab4c4447520b32b6b7f0fab84cb95ad484c9189`.

Every archive reports28 migrations, integrity OK and clean foreign keys. Media
hashes remain exact. The final crash buffer is empty; that is not proof that
untested paths cannot crash, and does not close the earlier focus/pressure ANR.

## Rejected automation and remaining gates

The first private row-button helper refused before any tap because Fabric
flattened layout-only rows, leaving two restore buttons under each ancestor.
Using fresh observed anchor/button bounds with a unique vertical overlap
completed the witness. No guessed coordinates, duplicate restore or app-data
reset was used; this was an automation limitation, not a demonstrated app bug.

Remaining software/product gates include seven other manual raw forms,
appropriate further clinical trash, visual rich text, shift context and
follow-up stages. Native pagination/large font/IME/full-shift/pressure and
physical audio/power/Doze/provider/low-storage gates remain separate.
