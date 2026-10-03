# Validation scope: 0.11.17

Application 0.11.17 / Android code 33 confirms native recording completion before
copy/metadata acknowledgement. No dependency, schema, archive/passphrase or
permission change. Prior acceptance is pinned to 0.11.16, not this new source.

## Reproduction and software checks

The clean 0.11.16 source/evidence gate passed 98 suites / 1229 app tests + 3
workflows. Four new real-handler witnesses failed with 24 existing cases passing:
resolved Android stop with a terminal error, resolved stop without confirmation,
late terminal error and a previous-file completion all still handed the cached
URI to the parent. These model the installed SDK contract; they are not a forced
native MediaRecorder failure.

After implementation, recorder/completion/file-job/staging/backup checks pass
5 suites / 90 tests. The SDK stand-in retains its initial listener, emits native
terminal events independently of stop-Promise settlement and still models rejected
stops. Coverage includes native error with/without URL, foreign/missing/unfinished
status, late confirmation, timeout/retry, no second stop, retained duration,
maintenance exclusion, acknowledgement failures and unmount settlement. Explicit
discard requires confirmation, releases the failed capture without metadata and
allows a new recording. Pure completion tests require no remaining timers; the
component fake-clock fixture drains queued microtasks without cancelling deadlines.

Full current-source `npm run check` passed 99 suites / 1249 app tests + 3
workflows, including typecheck, lint and formatting. Hosted/native/artifact
acceptance is pending.

## Native and artifact gates

Build signed arm64/x86_64 copies from the frozen source; inspect ABI, native
libraries, package/version/code/signature and actual installed hash. Upgrade the
owned emulator without resetting its accepted dataset. Observe successful native
terminal acknowledgement on manual Stop and active system Back, then cold reopen,
playback and independent full SAF archive/data/audio preservation.

Do not count a coincident backup/file-list change as concurrent maintenance: the
0.11.16 probe started/finished before observed recording. Native stop-error
injection, delayed/dropped terminal events, permission/hardware errors on a physical
phone, pre-ack process death/power/low-space and complete restore exclusion remain
separate gates even if ordinary successful recording passes.

## Still open

Durable stopped-voice UUID operations/recovery; the old empty unreferenced M4A;
dataset/ordinary-write/old-editor/photo work versus restore; raw drafts in other
manual forms; original-before-crop and wider clinical workflows. Completion and
its file-job lease are process-local, not a crash journal. Incomplete captures
are not acknowledged just because a cached URI exists.
