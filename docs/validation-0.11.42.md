# 0.11.42 — recorded glucose units and numeric chart evidence

Source: `15f7c24921e1245e085f0257adbcba111106a3bc`, including the preceding
raw-vitals and bounded-timeline checkpoints. Evidence collected2026-10-09 by
GPT-6 via Codex, primary only. The later .43 trash source is not in this APK.

## Source checks and inspected artifact

Full local and normal pre-push checks pass148 suites/2,039 app tests and five
workflows, with typecheck/lint/format green. Exact-source hosted CI:
https://github.com/CodeinScrubs/medos/actions/runs/37859532861.
Independent migration generation reports no schema changes.

- QA APK:54,902,554 bytes; SHA256
  `8561fc425178284df77388eda39fcc1f9a4c3f2f28f0e34048c27bccdf01a4a2`.
- Actual package `com.shayan.medos`, version0.11.42/code58, minSDK24/target36.
- Actual x86_64 ABI, required JNI libraries and owner signing certificate pass.
- Generated release build completed in12m21s. In-place install preserved app
  data on the isolated API36.1 emulator. The pulled installed APK is byte-identical.

No .42 owner arm64 APK or physical-phone acceptance is implied. The QA APK
is private and was not copied to `dist/`.

## Native glucose witnesses

- The old version1 raw `12,5` recovered exactly, with no selected unit. Explicit
  publication refused the invalid number. Correcting to2.5 and selecting mmol/L
  survived force-stop/reopen before publication. Publication retained the original
  measurement time and encounter and retired the original draft once.
- A new3.5 reading without a unit was refused visibly. Explicit mmol/L selection
  published it. Separate100 and110 readings selected mg/dL explicitly. New forms
  did not silently select a unit.
- Actual native charts show only100/110 under mg/dL and2.5/3.5 under mmol/L;
  fractional axis labels remain distinct. Historic125.5 is labelled unit-unknown
  and is not plotted in either series.
- Editing only the historic reading's caption preserves125.5 and its unknown
  unit. This is independently checked in the cold encrypted archive.

## Independent archive witnesses

The upgrade export retains all4,109 prior application rows,49 application
tables and34 media entries/hashes exactly. The only added column remains null
for historic glucose. Integrity is OK and foreign keys are clean. SHA256:
`3f47d77aaed5dc0d46a8ef7ba5e6ee06afa26df4a48123e084fb8f755a386dbb`.

The cold export contains4,117 application rows:4,107 exact prior rows, two
intended prior-row changes (published old raw draft and historic caption), four
new clinical readings and four new retired drafts. Original time/encounter,
independent native REAL storage for2.5/3.5, schema migration count28 and all34
media hashes pass. Integrity is OK and foreign keys are clean. SHA256:
`44602f1ad66eeb02a22d5ea9ccaa26f452f23073f5835fe529fee570f6095122`.

Actual SAF restore of the .41 current archive retains all4,109 original rows
and34 media hashes, with the added glucose-unit column still null. The output
has schema migration count28, integrity OK and clean foreign keys. SHA256:
`fb08e2c06a17907d123f1d8e2718df92347dd1cfd719dc411b3c15461b06c438`.

Restoring the .42 current archive, force-stopping/reopening and exporting again
retains every application row/column in49 tables (4,117 rows) and all34 media
hashes exactly. Integrity and foreign keys pass. SHA256:
`d80d0d3146bf2f68c1df24b3ea10835c40fa1ad9dd816ed7fcc2f770c80e92a8`.
The final crash buffer has no entries; this does not rule out untested failures.

## Limits and rejected trials

A first normal push overlapped the native build and failed the ordinary5-second
limit in timeline/Today tests. Serial rerun passes without changing timeouts or
skipping hooks; resource contention is not a conclusively proven cause.
The build also reported daemon metaspace/long-path/deprecation warnings.

One private UI helper searched downward for a button above the current viewport;
it refused without repeating the completed publication. Bounded upward search
completed the remaining entries. Another trial typed only the first word of an
ASCII caption through ADB and failed its exact-input check; it did not publish.
A corrected single-token caption is the accepted witness. These are rejected
automation trials, not demonstrated app defects.

Chart test stand-ins and a non-advancing1e20 mathematical probe do not close
the older .33 focus/pressure ANR. Full timeline native pagination/every kind,
large-font/IME/pressure/full-shift, audio/power/Doze/provider/low-storage and
physical-phone gates remain distinct. There is no new clinical threshold,
unit conversion, inferred default or claim of clinical validation here.
