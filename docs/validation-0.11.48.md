# 0.11.48 — native exit ownership and live extension parents

Source: `ac4d3358f541e9da420d5d29f764136360230c2f`. Evidence collected
2026-10-09 by GPT-6 via Codex on the owned x86_64 emulator using synthetic data.

## Checks and installed artifact

Local and normal pre-push checks pass157 suites/2,168 application tests and
five workflow checks. Typecheck, lint and both formatting checks pass without
warnings. Exact-source [hosted CI passes](https://github.com/CodeinScrubs/medos/actions/runs/37943876384).

- Private QA APK:54,927,294 bytes, SHA256
  `3896b2e73618d133c2f84f0762cca8b664a4e001ad050830e6b4d2a4d5724021`.
- Package `com.shayan.medos`, version0.11.48/code64, minSDK24/target36,
  x86_64. Required JNI inspection passes.
- Certificate SHA256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Frozen-source build completes in13m48s. In-place installation succeeds;
  the pulled installed base APK matches the inspected bytes and hash.

This APK stays private, outside `dist/`. Native dependency deprecation warnings
are separate from the warning-free source lint. Owner arm64 and physical-phone
acceptance are not established by this build.

## Actual native actions

An independently prepared fixture adds two places and one extension: a live
place, a deleted place and an existing live extension under the deleted place.
The actual document picker and restore engine import it. Completion is observed
before these actions; bounds come from fresh UI hierarchies.

1. An existing note remains mounted across restore. System Back offers the
   old-form close; explicit local close returns to MedOS with the same process
   and no fatal entry. A fresh editor then exits normally with the same process.
   This is an old-generation/normal-exit witness, not a native delayed-notification
   or pending-save race test.
2. A new extension aimed at the deleted place refuses Save and retains the
   entered department and extension number. Selecting the actual live place
   and saving creates exactly one extension and closes the form.
3. The existing extension under the deleted place refuses Save and retains its
   original number. Returning keeps the same process with no fatal entry.

No real calls or messages are sent. No clinical recommendation is exercised.

## Independent archives and cleanup

Actual UI exports are decoded by a separate Node scrypt/AES-GCM reader. All
columns in49 application tables and all34 media hashes are compared. Settings,
audit, backup-run and migration bookkeeping are excluded from the all-row
comparison. Each accepted archive has28 migrations, SQLite integrity `ok` and
no foreign-key violations.

- .47→.48 upgrade: all4,117 original rows and34 media hashes unchanged,
  `2154fc8abfd42b4d670d40270638c02b16a10a2f59cd5709b99fe6935c64e7a4`.
- Three-row fixture:
  `64424527f88cf3ad588890558dff96d134a312a6dbb5a7a66562f254a75c8112`.
  The staged document-provider bytes match this input.
- Actual post-action archive:4,121 rows/49 tables/34 media,
  `1bc81330ea98235f99eb2f03f2c5f77b05810af843a60f2e25921070ac7702ab`.
  The oracle permits only one independently specified live extension with
  constrained generated ID/time. Every other column, including all original
  notes/drafts and the deleted-parent extension, remains unchanged. The refused
  creation leaves no invisible child.
- Actual base restore, observed late completion, force-stop/reopen and ready
  full export:
  `fd898b17a70943817d5e4b7a9618d1686bb566362ca2b42f419ee6acba156ffa`.
  All4,117 original rows and34 media hashes match the accepted .47 cold base;
  all four test additions are absent.

## Rejected attempts and additional finding

Initial cold deep links missed the intended backup page; no archive was created.
A later locator had scrolled below the export button and only searched forward.
Fresh observation and scrolling back to the top precede the accepted exports.
These attempts are not accepted evidence or an established app defect.

One refusal-report script assigned PowerShell's reserved `$Error`, emitted errors
and produced an unreliable result. That report is rejected. Fresh observation
with terminating errors verifies the actual refusal and retained values.

The base-restore completion observer timed out after eight probes. The following
saved hierarchy contains the completed-restore dialog before force-stop, but its
acknowledgment was not tapped. The dependent cold-stop should have waited for
explicit inspection of that completion. The accepted cold archive proves the
resulting data; it does not convert the timed-out observer into a successful run
or prove interrupted-commit recovery.

A separate read-only probe opens a note through another patient's route. Its
94-character source body is below the initial viewport; scrolling exposes that
exact body in an editable field. No typing or saving occurs. This confirms an
unscoped note reader, not a cross-patient write: existing draft publication checks
the patient. The note/history scope and delayed history actions require a further
source correction. Closing the probes retains the process; the final observed
crash buffer has no MedOS fatal entry. This is not a crash-freedom claim.

Full-shift timings, pressure/boot ANR cause, low-space/provider/interruption,
eight remaining manual-form recoveries, clinical review and physical-device
acceptance remain open. The phone is not the sole remaining gate.
