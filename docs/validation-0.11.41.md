# 0.11.41 — exact source and bounded native evidence

Source: `760fc6752bfcea596aadb76f243b6b7cd716f68b`, including raw-vitals
checkpoint `05b6ca3`. Evidence collected2026-10-09 by GPT-6 via Codex, primary
only. The later glucose-unit source change is not included in this APK.

## Source checks

Full local check and normal pre-push check:147 suites/2,006 app tests and five
workflow checks, with typecheck/lint/format green. Exact-source hosted CI:
https://github.com/CodeinScrubs/medos/actions/runs/37851017509.

SQL/component witnesses cover2,000 long notes,360 tied events through keyset
pages without loss/repetition, later insertion, recent discharge of an old
admission, bounded lab previews, partial-read recovery and actual handler guards.
These are not native performance or clinical acceptance results.

## Inspected emulator artifact

- QA APK:54,899,310 bytes; SHA256
  `9da30fb76d6895b54824200a59ab4a223262b4e9d2acab459ebdb4d3ce7394df`.
- Actual package: `com.shayan.medos`, version0.11.41/code57, minSDK24/target36.
- Actual ABI: x86_64; required JNI libraries and owner signing certificate pass.
- Fresh prebuild and generated app clean/release build completed in12m50s.
- In-place install on isolated API36.1 emulator; app data was preserved. Pulled
  installed base APK is byte-identical to the inspected artifact.

No .41 arm64 owner APK was built. The QA artifact is private and is never copied
to `dist/`. There was no physical phone connected.

## Native witnesses

- Raw BP `120/x` and pulse `8,0` were acknowledged, survived force-stop/reopen,
  and remained visible. Explicit clinical publication refused both inputs.
  Correcting to `120/80` and `80` produced exactly one clinical row and retired
  its draft. The original measurement time and encounter remained attached.
- A second125.5 glucose observation was published using the old unit-free
  interface, intentionally preparing the later unit migration witness.
  Independent decoding confirms native SQLite retained the fraction as REAL.
- A separate unsubmitted raw glucose `12,5` was kept by Close and survived a
  cold encrypted export. Its version1 body has no unit field, as expected.
- All six timeline filters were visible without horizontal discovery. Tapping
  the actual imaging event opened the existing study editor, showing its stored
  body region. Back returned to the timeline with the same process. Selecting
  the empty consult filter showed a kind-specific empty result.
- Crash-buffer inspection after these interactions produced no crash entries.
  This does not rule out crashes in untested paths or prove ANR resolution.

## Independent encrypted archive checks

Upgrade export retained all4,104 prior application rows exactly, with49
application tables, the added empty `vital_form_drafts` table and all34 archived
media entries/hashes unchanged. Archive SHA256:
`5e3a1f0d9b7c47b9ff4377e375ecb3d53177aa788f1c6b6d1b40bd26b7601686`.

Cold export retained the same4,104 rows exactly and added only two clinical
vitals and three drafts (two retired, one exact invalid open draft):4,109 rows.
Original encounter/time, native fractional storage and all34 media hashes pass
the independent oracle. Integrity is OK and foreign keys are clean. SHA256:
`f17a77b895ff47013722fee710e83e81031bfe923e6dbfe059dbcf05e6c8c932`.

Actual SAF restore of the .39 current archive retained all4,104 original rows,
left the added raw-vitals table empty and retained all34 media hashes. SHA256:
`6c5b0680537d55474698977ae1da408b3bb2d18cc950305cfe22c84c55949a5f`.
Restoring the .41 current archive, force-stopping/reopening and exporting again
retained all4,109 application rows in49 tables and all34 media hashes exactly;
schema migration count27, integrity OK and foreign keys clean. SHA256:
`56d136840c8a25e163866f2cda26c7b1d80125803ebd24ef6fd71440bcb97044`.

## Limits and rejected trials

The initial QA input helper invocation reversed its value/label arguments and
refused to type; the corrected named-argument trial is the witness above. The
first cold oracle incorrectly assumed there were no unrelated older vitals;
the corrected oracle preserves every prior row and separately checks the two
intended additions. Neither rejected trial is acceptance evidence.

Native timeline pagination/direct access for every
record kind, large-font/IME/failure/pressure and full-shift acceptance remain
separate gates for this source. Physical phone, audio, Doze/reboot, power interruption,
provider denial/low storage and the older .33 focus/pressure ANR are not closed.
