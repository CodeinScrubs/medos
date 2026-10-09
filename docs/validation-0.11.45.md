# 0.11.45 — coherent current encounter on the native SQLite runtime

Source: `94e5d6cc16cf3e92ac4a1f710e3daa7b8d78df90`. Evidence collected
2026-10-09 by GPT-6 via Codex, primary only. This cumulative APK includes
the .44 note-read correction. The emulator contains fabricated QA data only.

## Source checks and installed artifact

Full local and normal pre-push checks pass153 suites/2,079 app tests and five
workflow checks, with typecheck/lint/format green. Exact-source hosted
[CI passed](https://github.com/CodeinScrubs/medos/actions/runs/37868595712).

- QA APK:54,908,854 bytes; SHA256
  `0ca2431438ee75c09e929f932c43ba09afc7817768e9ee736c4cb6354c5fc962`.
- Actual package `com.shayan.medos`, version0.11.45/code61, minSDK24/target36.
- Actual x86_64 ABI and required JNI libraries pass inspection. Signing
  certificate SHA256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Build completed in21m4s, from the frozen clean source above. In-place
  installation preserved data. The pulled installed base APK has identical bytes.

There was no intermediate .44 native build. No .45 owner arm64 or physical
phone acceptance is implied. The QA artifact remains private, outside `dist/`.

## Native note and tied-episode witnesses

An existing note's title, newer body and one-voice count are visible. Opening
and closing its unchanged editor returns to the record with the same process
and no fatal crash for that process. This is not audible playback evidence or
native SQL failure injection; read failures/retries are separate component tests.

An isolated encrypted fixture adds eight synthetic rows to the accepted base:
one patient, three encounters and four orders. Two live encounters have the
same admission time, inserted in reverse ID order; the third is historical.
The orders belong respectively to each encounter or have no encounter.
Every original row and media file remains intact before native import.

After actual document-picker import/restore:

1. The patient list shows the selected admission's ward/bed, consistently
   with the deterministic admission-time-descending/id-ascending fallback.
2. The actual kardex shows exactly two orders: that admission's order and
   the standing order. The other active and historical encounter orders
   are absent. The visible current count is two.
3. A full actual UI backup independently confirms all4,125 application rows
   in49 tables: the original4,117 plus exactly eight fixture rows, with their
   original associations. All34 media hashes remain exact.

This validates the bounded window query on native Expo SQLite and the coherent
kardex projection. It does not resolve duplicate active encounters clinically
or prove every clinical publication/rounds workflow on a device.

## Independent archives and fixture cleanup

Independent decoding uses a separate Node AES-GCM/scrypt reader and compares
all application row columns and media hashes, not just record counts.

- Exact .43→.45 upgrade,4,117 rows/49 tables/34 files:
  `00837caf77c27f6360f469d4e10b403c510fa84cf797f23d22a656d2de368559`.
- Isolated input fixture:
  `d6152b2396af2e41c456c2aad140e1db806b30bc3027065455acf6fd2fdfe905`.
- Actual post-witness full archive,4,125 rows/34 files:
  `534f0948636259296384ebe9f7d1dd2f56f1aaeb7b25d8945783555daa0d2c1a`.
  Its private filename contains `cold-before`, but no cold restart preceded
  that particular archive; the filename is not cold-recovery evidence.
- Base restored through the actual UI, then force-stop/reopen/full export:
  `f7b530970b3ec09ac1b07f70e4e40598c6f1e9e9ec3cf13da797b3e86775bb67`.
  The4,117 rows and all34 media hashes exactly match the .43 base. The eight
  fixture rows are gone. Existing note text and one-voice count survive reopening.

All archives report28 migrations, integrity OK and clean foreign keys. The
final crash-buffer read succeeds with no fatal MedOS entry. This does not close
the earlier focus/pressure ANR or establish crash freedom.

## Rejected automation, performance observation and open gates

- One package-inspection helper treated a single returned path as a character
  after installation. It was corrected to retain an array, then the actual
  installed base bytes were independently compared. Installation itself succeeded.
- The first eight-dump restore completion helper timed out while key derivation
  continued. A later fresh hierarchy captured actual completion and acknowledgment;
  no force-stop or second restore interrupted that operation.
- The first cleanup pass visibly reported a wrong passphrase. It is rejected
  as a successful restore. The staged base bytes and independently supplied QA
  passphrase decode correctly; the next UI attempt completes, and the cold archive
  proves exact cleanup. The cause of the rejected input is not established.
- The loaded emulator spent roughly four minutes between fixture key-start
  and observed completion. A Fabric soft exception and skipped-frame messages
  were also observed; there was no fatal crash. Neither observation establishes
  the cause of that delay or the older ANR. The installed scrypt callback cadence
  submits about10,923 progress callbacks at this cost; bounding display updates
  is separate subsequent work, not a measured .45 performance improvement.

Remaining software/product gates include seven manual raw forms, further
clinical trash/correction, visual rich text, shift context and follow-up stages.
Long-chart pagination/full-shift/large-font/IME/pressure, native failures and
physical audio/power/Doze/provider/low-space gates remain open. Do not label the
phone as the sole remaining work.
