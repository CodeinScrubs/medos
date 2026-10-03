# Validation scope: 0.11.21

Version 0.11.21 / Android code 37 introduces pre-commit database-write admission
and immutable editing-intent generations. No migration, archive/key scheme,
dependency, permission or new route changed. Read architecture's matching decision
for the intentional post-commit admission boundary and remaining manual forms.

## Reproduction and software evidence

A new test on the previous source entered `recordVital` from actual archive
unpacking progress. The write was acknowledged and later erased by replacement:
the expected rejection failed (one failure, 28 skipped cases). On the new source
the ordinary write rejects before clinical metadata changes, while the explicitly
trusted snapshot/settings/import path succeeds.

Real migrated SQL tests cover lazy and already-prepared Drizzle mutations,
returning queries, synchronous transactions, raw batches, public `$client`,
read availability, revocable trusted authority across awaits, active-writer
refusal and reservation release. The installed Expo Drizzle driver is also
exercised with contract-preserving native prepare/execute stand-ins, including
PRAGMA preparation and statements prepared before admission closes.

Mounted actual note/order editors keep old local input when a real attached
database import replaces same-ID records or removes the note. Old save handlers,
timers/unmount flush and confirmed draft discard cannot mutate restored rows;
a new empty editor cannot insert its first draft after replacement. Live-query
timing is a synchronous stand-in, not native rendering evidence.

Mounted navigation and voice controls cover confirmed local-only stale exit,
generation change during a clean flush, delayed voice-delete/recovery dialog
confirmation, and stale recorder handoff/discard rejection. Native recording
and navigation dispatch are stand-ins. Autosave retains stale pending input
without automatic retry and holds admission through rejected async writes.

The first full typecheck exposed a test-helper return type that dropped a
protected Drizzle member; the helper now preserves the database's original type
and the production database declares its public connection surface explicitly.
Scoped lint rejected render-time ref reads in retained EditGate input; the
initial seed now uses a conditional, one-time state adjustment. No lint rule
was suppressed for those problems.

Full `npm run check` passed typecheck, lint without warnings, formatting,
107 suites / 1335 app tests and all three workflow tests. The normal source push
repeated the full gate. Exact application commit
`4ecb0d7ee2a55edfc16005617ac824d79e60b66e` passed hosted CI
[37143560846](https://github.com/CodeinScrubs/medos/actions/runs/37143560846),
including unchanged regenerated migrations and Android bundle export.
Native acceptance is recorded separately below. Partial targeted runs are not
release acceptance. Two read-only reviewers
informed implementation; their final review
attempts could not run because their account usage limit was reached. The primary
agent owns source review and all checks/builds/native operations.

## Signed artifacts

Both packages were built after application source stopped changing at `4ecb0d7`.
An initial Windows `EBUSY` prevented prebuild from clearing generated Android;
stopping the matching Gradle daemon and running prebuild from the repository
parent resolved it. No application data/source was removed. Generated build
directories use verified junctions to private QA storage. Prebuild changed no
tracked files. The completed arm64 build took 12m44s; the separately app-cleaned
x86_64 build took 9m26s.

Native-library/ABI inspection, manifest identity and signature verification
passed for both. Each is `com.shayan.medos`, version/code 0.11.21/37, min SDK 24,
target SDK 36, with release certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/MedOS-0.11.21.apk`, arm64 only | 52,845,023 | `546a2caff2db93347416d9adf8df47684ad0d30738feecdbadd2700b801dfd52` |
| Private emulator APK, x86_64 only | 54,453,350 | `1626717ba848d8d4ec269da30f48745add5bef871e6a2c6331637c7b8d397054` |

The isolated modern emulator was upgraded from installed 0.11.20 with `-r`,
without clearing app data. Its pulled installed base APK matched the inspected
x86_64 SHA-256 exactly. Airplane mode remained enabled. No physical phone was used.

## Bounded native restore and stale-note acceptance

The actual existing phone-follow-up editor was opened and its body changed to
synthetic text. The original screen remained on the stack while Backup was opened.
The real Android document picker selected the accepted 0.11.20 full archive,
with the original QA passphrase entered in the actual prompt. Native restore
reported completion with one patient and 18 media files, without housekeeping
warnings. This exercised native snapshot/marker/import through trusted admission.

Back from Backup returned to the same old editor. Its locally edited text was
still visible, the short replacement notice appeared and native header Save was
disabled. System Back offered local-only closing; choosing review retained the
text, then confirmed close returned to the patient. A private screenshot was
visually inspected. This covers an actual loaded same-ID note, not all routes,
pending voice/native confirmations or a directly injected pre-commit write race.

A subsequent full SAF export reported destination-content verification. Independent
Node AES-GCM decryption authenticated all seven chunks of the 6,514,897-byte
archive, SHA-256 `b2021d80bc295f54d7325709632318410b0962997104980dca61320bfa2e9ec7`.
Real SQLite comparison against accepted source archive SHA-256
`931982e5b461b995ff45e8d3dc2f284c729ae199c9939a186c532aaa1cc60ada`
preserved **all 39 application tables exactly**, with no reminder-field repair.
Audit, backup-run, device-setting and migration bookkeeping tables were explicitly
excluded. SQLite integrity was `ok`, with no foreign-key violations. All 18 media
paths/sizes/hashes and all 14 voice attachments were unchanged; no extra file or
clinical row was introduced by the old editor's close/cleanup. Existing known
unreferenced QA files remain included; this does not claim orphan cleanup.

After force-stop, the same note reopened with the restored original body and an
enabled Save for the fresh intent. The final application crash buffer was empty.
The emulator's cold boot separately showed a **System UI** non-response dialog;
the observed Wait action resolved it. This is recorded separately from application
behavior. The owned emulator was shut down without wiping its data.

## Remaining boundaries

- Other manual forms, raw-draft comparison/load/discard handlers and ordinary
  async continuations do not yet all carry the original generation.
- New intents may write after SQL commit while restore housekeeping continues.
  The file-maintenance lease remains held; whole housekeeping is not atomic.
  Source review found pre-transaction awaited row snapshots in search rebuilds,
  awaited per-row lab reflagging and baseline-version check/insertion; these need
  real-SQL race witnesses and atomic read/write boundaries before new edits can
  safely overlap the corresponding repair pass. This is not a reproduced native
  corruption claim or a completed repair.
- Stale input retention is in process. It is not independent backup, durable
  recovery export, process-death or power-loss evidence.
- Draft-note and quick-capture voice still need durable pre-ack journals;
  active/pre-journal recording and originals before crop remain separate work.
- No physical-phone claim, complete clinical review, low-space/provider failure
  guarantee or proof that every product requirement is finished.
