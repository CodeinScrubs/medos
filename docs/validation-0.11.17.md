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
workflows, including typecheck, lint and formatting. The normal pre-push hook
repeated that gate successfully. Application source is
`8dfa56eee651ccb45a8d401acfff5e53efd8601f`;
[its exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/37119017970)
completed successfully.

## Native and artifact gates

Both copies were built from the frozen application source, without intervening
source edits. Required native-library checks and `apksigner verify` pass; package
`com.shayan.medos`, version 0.11.17 / code 33. Both retain certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Owner APK, `dist/MedOS-0.11.17.apk`, arm64-v8a only | 52,804,559 | `c5223643243ca1693e0f54ef77202e5c7df144633fe8417800ba241ef4b5b8ac` |
| Private emulator APK, x86_64 only | 54,412,886 | `935f0de313a4a110bc0aad59ee62730ad3f88398d31cc0f2648e165e0d4667a9` |

The owned isolated emulator was upgraded with `install --user 0 -r`, without
uninstalling or erasing its accepted 0.11.16 dataset. The pulled installed base
APK has the exact emulator-artifact hash above. Airplane mode remained enabled.
No physical phone was operated in this slice.

- All ten prior patient voices remained visible after upgrade. Observed recording
  followed by manual Stop produced exactly one additional voice (11 total).
- Another observed recording followed by system Back left the patient screen
  after the route's save guard completed. Reopening showed exactly 12 voices.
- Only after observing that acknowledgement, force-stop/cold reopening retained
  12 voices. Native playback and Stop controls were observed for the new manual
  recording. Physical microphone/speaker audibility was not tested. This is
  post-ack persistence, not recovery from process death before acknowledgement.
- A manual full backup to the existing SAF folder reported byte-verified delivery.
  Automatic backup remained disabled; its daily interval and include-media choice
  were retained. This test did not attempt concurrent recording and maintenance.

Private UI helpers initially scrolled away from an above-viewport count and
sampled loading frames immediately after cold launch. Fresh settled hierarchies
showed the expected counts, later confirmed by archived SQL. Those helper misses
are not evidence of missing voices or an application failure.

Do not count a coincident backup/file-list change as concurrent maintenance: the
0.11.16 probe started/finished before observed recording. Native stop-error
injection, delayed/dropped terminal events, permission/hardware errors on a physical
phone, pre-ack process death/power/low-space and complete restore exclusion remain
separate gates even if ordinary successful recording passes.

## Independent native archive verification

The pulled full archive is 4,695,464 bytes, SHA-256
`8f567cf313064b31028d732bf6217cd02ae82b1e000500a44ba6496fbd9d624d`.
An independent Node scrypt/AES-GCM decoder authenticated all five chunks, checked
framing/EOF and entry lengths/hashes, then opened the archived SQLite database:
integrity `ok`, no foreign-key violations, 20 schema migrations.

Against the accepted 0.11.16 archive, 37 other application tables, all ten old
attachment rows and all eleven old media entries match exactly. There are exactly
two new live patient voice attachments and their two nonempty media files. All
12 referenced voices fully decode with FFmpeg; measured duration is within one
second of metadata where metadata exists. The original imported WAV remains
byte-identical. The prior empty unreferenced M4A is retained and is not claimed
as playable audio. No new orphan file or duplicate audio metadata was found.

## Still open

Durable stopped-voice UUID operations/recovery; the old empty unreferenced M4A;
dataset/ordinary-write/old-editor/photo work versus restore; raw drafts in other
manual forms; original-before-crop and wider clinical workflows. Completion and
its file-job lease are process-local, not a crash journal. Incomplete captures
are not acknowledged just because a cached URI exists.
