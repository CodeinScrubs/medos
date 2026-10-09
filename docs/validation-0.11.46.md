# 0.11.46 — paged long notes on native Expo SQLite

Source: `8d9de144c144128d68526e5956b8799f10efd873`. Evidence collected
2026-10-09 by GPT-6 via Codex. The emulator contains fabricated QA data only.
The subsequent .47 source changes were not in this installed APK.

## Source checks and artifact

Full local and normal pre-push checks pass155 suites/2,095 application tests
and five workflow checks, with typecheck/lint/both formatting checks green.
Exact-source [hosted CI passed](https://github.com/CodeinScrubs/medos/actions/runs/37875100103).

- Private QA APK:54,916,346 bytes, SHA256
  `9d79e69200259b2ca108d38ed1bd1b6c28b73b103dc3caf9d5699fccf1ff9ac8`.
- Actual package `com.shayan.medos`, version0.11.46/code62, minSDK24/target36.
- x86_64 and required JNI libraries pass APK inspection. Certificate SHA256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Build completed in11m11s from frozen clean source. In-place installation
  succeeded; the pulled installed base APK has identical bytes and hash.

The artifact stays private, outside `dist/`. No owner arm64 or physical-phone
acceptance is implied.

## Actual note-page and full-document witnesses

An independently prepared encrypted fixture adds95 rows to the accepted base:
one patient, one admission,90 notes and three voice associations. Each note's
original body has32,036 characters and a unique final marker. Notes were inserted
in reverse order. Two older notes are pinned; five others are operation notes.
The three voice associations reuse existing media without changing its bytes.

The actual document picker and restore engine import this fixture; completion
and its acknowledgment are observed. On the installed native runtime:

1. The first page starts with the two pins, then notes000–037; the next page
   contains038–077; the last contains078–082 and085–089. Actual scrolling
   hierarchies collectively contain all90 unique titles. The final page has
   no older-page action. Returning to a newer page returns the expected records.
2. Visible voice counts are one for note000 and two for note038, including
   the second page. This is metadata evidence, not audible playback evidence.
3. The operation filter shows exactly the five operation notes, although all
   were beyond the initial unfiltered page. Returning to All resets to the
   first page with the two pins first.
4. Opening note083 and scrolling its full editor exposes all32,036 characters
   and its final marker. Opening operation note089 from the last page does
   likewise. Closing089 unchanged returns to the patient record with the same
   process, a visible MedOS page and no fatal entry for that process.

No note text was edited or published during these witnesses. The source tests
separately cover2,000 long documents, pin/date/ID ties, bounded projections,
read failures/retries and retained dataset ownership. Neither test set measures
phone latency or a complete clinical shift.

## Independent archives and exact cleanup

Actual UI exports are decoded with a separate Node scrypt/AES-GCM reader.
Comparisons cover every application-row column and every archived media hash;
counts alone are insufficient. Phone settings, audit, backup-run bookkeeping
and migration bookkeeping are excluded from the application-row comparison.

- .45→.46 in-place upgrade,4,117 rows/49 application tables/34 media files:
  `7473f4b2b2bb2e4a8da9a3d3ff71b4768633c98f2cdfd39ac5335e868ada5071`.
- Isolated fixture input:
  `cddbe996ff209fb66f9e10d9c4e408d348ecca7b90913807da6b35aef8a9dcf2`.
- Actual post-witness full archive,4,212 rows/49 tables/34 files:
  `4eb980d4c1d975aa408d812b262448bd8e804575e3e13f0d5344e996131d849a`.
  All original4,117 rows, all95 additions, their associations and media hashes
  exactly match the independent fixture oracle.
- Actual base restore, followed by acknowledged completion, force-stop/reopen
  and full UI export:
  `1aa6151c1d9a7eb4b4be65d598c76ab6e3c49a6a94153e2758c39fec0322451c`.
  The4,117 original rows and34 media hashes exactly match the accepted .45 base;
  all95 fixture rows are removed. The staged base archive's hash is checked
  before selection, independently of its filename.

All accepted archives report28 migrations, integrity OK and clean foreign keys.
The final crash-buffer read succeeds with no fatal MedOS entry. This does not
prove crash freedom, continuous operation or resolution of the older pressure ANR.

## Interruptions and rejected automation

- The original083 close observation was interrupted when the emulator process
  disappeared between work sessions. Its cause is unknown; uninterrupted close
  is not accepted for that attempt. The same owned AVD is reopened without
  wiping data. The fixture persists, and the later089 close is observed directly.
- On that reboot, an actual System UI ANR dialog appears. Wait is selected from
  its fresh bounds. This is not counted as an application pass or a diagnosis
  of the older MedOS pressure/focus ANR.
- An initial full083 probe inspected only the top SOAP fields and failed.
  Actual scrolling then locates the complete body; a clipped viewport does
  not establish that the stored or editable source is truncated.
- During cleanup, UI hierarchy reads fail or cannot reach idle. The first
  submission helper fails before pressing Restore; the completion probe is
  therefore not a successful restore. A later fresh hierarchy still shows
  the password dialog. Restore is then pressed from fresh bounds. A subsequent
  observation captures actual completion before any force-stop or cold export.
- A non-idle hierarchy helper reports a successful instrumentation run but
  provides no file at its expected path. It is rejected as UI evidence.
  Page-scroll helper step counters are not timing or performance measurements.

Remaining work includes eight manual raw-form recovery paths, permanent clinical
correction history, further trash/restore, visual rich text, shift context and
follow-up stages. Broad native timeline/IME/large-font/long-shift/pressure and
physical audio/power/Doze/provider/low-space acceptance remain open. The phone
is not the sole remaining work.
