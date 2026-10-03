# Validation scope: 0.11.20

Version 0.11.20 / Android code 36 excludes whole photo jobs from file maintenance.
It also contains lab-picker rejection, guards duplicate lab chooser callbacks,
and checks live targets before expensive work. No schema, dependency, permission,
archive, key scheme or new route changes.

## Reproduction and software evidence

The initial two targeted suites had 10 failures and four passes on the previous
source. Review identified a witness-cleanup weakness; pending operations now
settle in `finally` even when an assertion fails. A new real-SQL wrapper pauses
metadata acknowledgement after its insert. The finalized 15 cases were rerun
against the unmodified `a78215c` photo/lab handlers: 11 failures, four passes.
The current handlers passed all 15 cases. The source baseline was restored in
`finally`; no build/native QA overlapped that probe.

Cases cover reservation before camera permission/picker, denied permission,
cancel, direct multi-photo storage, captured target/source values, rejection
before native work during maintenance, retired targets, picker/copy/SQL failure
release, and retained exclusion after SQL commit while acknowledgement is pending.
The actual lab button callback covers its picker/panel/attachment sequence,
visible picker failure, busy refusal, cancellation and duplicate callback.
The live-query stand-in is synchronous: this is callback/query evidence, not
native picker or refresh/render timing evidence. Native calls are stand-ins;
metadata and patient/panel queries run against the real migrated database.

The first full check caught a test fixture's overly broad MIME string type; its
typed return now preserves the native `image/jpeg` contract. The final full gate,
including a subsequently corrected test formatting issue, passed typecheck, lint,
formatting, 103 suites / 1317 app tests and all three workflow tests. A test-only
import-order warning was corrected before the final normal push gate.
Exact-source CI, signed builds and native acceptance are recorded after execution.
Read-only reviewers found no source blocker; they ran no tests/build/native tools.

## Acceptance gates and remaining work

Hosted, artifact and native application gates are pending in this implementation-stage entry.
0.11.19 native old/current restore and exact modern preservation are recorded in
[validation-0.11.19.md](validation-0.11.19.md); that does not validate this APK.

Still open: physical phone/native picker permission/return/cancel behavior,
durable photo interruption/recovery, empty panel after photo-storage failure,
original-before-crop, ordinary clinical writes during restore, and stale loaded
editors after dataset replacement. A temporary file busy check is not a dataset
generation fence. Draft/quick-capture voice targets and broader clinical/manual
form/performance gates remain in `IMPLEMENTATION.md`.
