# 0.11.30 — native findings before senior-developer handoff

## Scope and reproduction

Continuation of the owner's heavy-shift/release review, baseline `1fb86ff`
(0.11.29/code45). Work is solo. No PR was remotely merged/approved/commented on.
The full 0.11.29 software, signed-build, native upgrade and 40-patient archive
evidence is in [validation-0.11.29.md](validation-0.11.29.md).

Native review found excessive vertical space before the first shift patient:
the screen added top safe area below an already-inset native header and displayed
three large administrative action rows. The fix is deliberately local: shift
and round screens omit the duplicate top edge but retain Screen's bottom edge;
round/add-patient remain direct; bulk-add/end-shift are inline under one labeled
options control. Filtering/reorder and their original autosave scope are unchanged.
The existing unsaved handoff/reorder integration now also exercises opening and
closing these controls without losing pending text.

A second finding appeared when a native reminder/permission acknowledgment
finished after another deep link had opened. Calling global router.back from the
old form popped the newer route. A migrated-SQLite/actual-handler witness held
scheduleReminder, changed the original navigation focus, then released the native
promise: the pre-fix test failed (one unexpected back; nine other checks passed).
The form now checks its originating navigation's isFocused before a delayed
close, retains its completed read-only state when unfocused, and offers one close
when revisited. Publication remains atomic/idempotent and original dataset
admission is unchanged. A redundant second Close button was removed.

Version is 0.11.30/code46, with only the scoped package/app/lock version fields
updated. No schema/migration, dependency, permission, route, native module,
archive/key scheme or clinical formula change. AGENTS records the difference
between dataset ownership and navigation ownership for subsequent agents.

## Software evidence

The pre-fix navigation witness failed as expected; after correction all four
targeted suites / 40 checks passed (occasion handlers/drafts and shift/round).
An additional completed-editor/restore check preserves one usable stale Close
without modifying restored rows; the occasion suite then passed all 11 checks.
The first full run had two failures in editor-recovery because its existing
navigation stand-in omitted the newly used isFocused API (123 suites / 1609
checks passed). That stand-in now supplies a focused navigation; the existing
read/failure/duplicate assertions were retained. Full final-source check and
exact-source CI are recorded below once they run. A software navigation stand-in
is not native route acceptance. Final `npm run check` passed 124 suites /
**1611 app tests**, three workflow tests, typecheck, zero-warning lint and
formatting. The source was frozen after this check; source CI/builds follow.

## Artifact and native evidence

Frozen application source: `eb1979a7503c280edaae9f2fa8278c7d56bf20d1`.
[Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/37656747034)
completed successfully. Both signed packages were built after that source freeze:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Owner arm64 `dist/MedOS-0.11.30.apk` | 52,924,739 | `e3ccd1172fd01e0b2de7b500d08b7dabae8a67dd9dcc66ddd62ee1ba5ea52039` |
| Private emulator x86_64 | 54,533,066 | `5e1a30321d99af2c2c31d311bd7036085698caa2ee42d1d7ab6c77204ec300c7` |

Manifest version/code (0.11.30/46), package, actual ABI, essential native libraries
and the unchanged release signer were inspected. Pulled installed x86 APK hash
matched. Owner APK was rehashed after the x86 build: unchanged. The x86 artifact
is private and was never copied to `dist/`.

The owned API 36.1 emulator was upgraded in place, offline, without uninstall or
app-data clearing. Independent AES-GCM/scrypt decoding and real SQLite comparison
of full exports before/after upgrade preserved all **40 application tables /
4,023 rows and 18 media files** exactly (operational settings/audit/backup runs and
migration journal excluded). Integrity was `ok`, foreign-key violations zero.

Native acceptance on this exact APK:

- First patient starts at Y1129 with default font rather than about Y1730 on 0.11.29.
  Font scales 1.3 and 1.5 retain readable, reachable round/add/options and patient
  controls. Inline administration opens/closes without a new route.
- Force-stop/reopen recovered the upgraded occasion's exact unfinished raw
  `1405/12/` and title. Correcting it to `1405/12/29` and pressing Save returned
  to its originating completed-round screen; publication occurred once and the
  same draft was retired. This is normal native Save acceptance; the deferred
  focus race is separately reproduced by the software witness above.
- Search for patient 39 hid patient 40 while its handoff editor stayed mounted.
  The new handoff survived a subsequent force-stop/reopen. ADB field-clearing
  attempts did not reliably clear the query, so native clear/re-show is not
  claimed; software handler coverage remains separate.
- Reorder moved patient 40 below 39 and back, using observed accessibility bounds.
  Final SQL order was exactly the original order.
- A continuous round used Skip on patient 40, then Reviewed on 39 through 1 and
  finally 40: **40 reviewed actions, every expected identity, one process ID**.
  Completion and cold shift `40 of 40 reviewed` were observed. Summary 21 and
  handoff 40 were edited during the run. Footer remained above the system bar.
- Final full archive comparison checked **4,024 rows / 40 application tables**:
  only 40 reviewed stamps, the two intended texts and the one occasion/draft
  publication changed. **37 tables and all 18 media hashes were unchanged**;
  scheduled messages remained zero, integrity/FK clean. No message was sent.
  Archive SHA-256: `bfbac599de7e22bbec2b049774a27f4478d5802463727adc2c9fd036ef080bd6`.
- No MedOS crash or app ANR appeared in the bounded round's crash/events logs.
  PSS moved from 225,993 to 252,332 KB; this is one round, not a memory-leak proof.

Performance is **not accepted**: software-rendered emulator gfx reported 975 of
1,088 frames janky (89.61%). UIAutomator action timings include automation delay,
not physical A52s latency. Early emulator boot also showed a System UI ANR that
recovered after Wait; it was not a MedOS crash and stable boot is not established.
Cold-read polling/top-target and ADB query-clear harness failures were retained
in private evidence, not counted as passes. All decoded data/media, QA passphrase,
screenshots and build/signing logs remain ignored under `private/`.

## Release decision and remaining work

The repository can be handed to a senior developer with AGENTS, HANDOFF,
architecture, review-guide and the prioritized IMPLEMENTATION ledger. That is
review readiness, not a signed-off paper replacement. An installable APK is not
a guarantee of zero crashes or a smooth physical-device shift.

Remaining gates include physical A52s timing/scrolling and an observed owner
shift, OEM reminders after reboot/permission changes, power/low-space/provider
failures, durable pre-ack stopped audio for new note/capture, manual lab/contact
raw recovery, the remaining everyday product flows, outstanding dependency
reachability review and independent clinical review. Some other asynchronous
forms still require the same navigation-ownership audit. Read the ledger rather
than assuming that this bounded fix or a test total closes those gaps.
