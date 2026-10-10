# Original-context Kardex recovery — 0.11.54/code70

This is a separate continuation on `codex/kardex-form-recovery`, based on PR6's
delivered `e68e6a4`. That exact parent passes CI38029238968; .53 native and owner
artifact evidence remains attributed to its frozen `e357dbf` application source.

## Reproduction and implementation

A private probe runs the original `e68e6a4` OrderFormScreen with only its relative
imports redirected to their identical feature locations. Typing unfinished notes
and allowing the persistence interval to elapse produces no raw draft. The
expected-acknowledgment assertion fails in 3.721 Jest seconds. This is an observed
absence of persistence before manual Save, not a physical power-loss experiment.

The existing shared lifecycle now enforces each port's immutable parent key.
Kardex's key is a canonical patient/episode JSON tuple. Strict raw fields preserve
incomplete names/doses, whitespace, notes and invalid visible dates. The original
Order's complete basis and raw revision are compared before synchronous domain
publication, draft retirement, receipt and audit commit together. Failure rolls
them all back. Explicit adoption never publishes until a separate Save.

Recovery stays in the existing editor and Kardex; three links with cursor pages
include the patient's older episodes. The default new form does not silently
take an older episode's input. A short Jalali episode label shows association.
Read-only pager state resets when patient/notebook or dataset changes. Forms keep
their own original dataset/removal guard and native stacking parents.

No new route, dependency, permission, clinical formula or backup/KDF scheme.
The typed text kind expands using the existing raw table; regenerated SQL must
remain unchanged. Version edits are scoped to the four metadata locations and
three allowed lockfile version fields.

## Checks executed so far

Initial integration passes the existing editor/read/context/pilot tests after
updating their feedback text and moving the pending-write probe to the new
transactional publication boundary. The pending test still pauses acknowledgment,
checks duplicate presses/locked callbacks and verifies focused-route ownership.
Fixture mistakes (future start relative to a fixed now and a wrong replacement
API) are corrected; they are not attributed to application bugs.

Three final focused suites pass 49 tests in 9.202 Jest seconds, without act
warnings. Cases cover exact raw remount/background/Close recovery; invalid date
refusal; unknown start; original null/empty/historical episode; patient ownership;
complete-basis conflict; explicit adoption; atomic audit failure; receipt replay;
stale save/discard callbacks; future-body copying; and scoped recovery paging.
Existing .53 association/discharge checks are retained.

A further staged-mount case fails against the initial .54 candidate in 4.343
Jest seconds: a recovered child first appearing after replacement displays the
replacement allergy beside old raw words, although publication stays blocked.
The parent intent now carries its originally read allergy into that late child;
ordinary same-dataset corrections remain live. Its stale episode label also
avoids reading replacement details. The regression retains old input read-only
and checks that no clinical row is published. This finding belongs to the
uncommitted candidate, not a claim about the delivered .53 native artifact.

The complete current-source `npm run check` passes: typecheck, architecture lint,
formatting, 166 app suites/2,388 tests in 155.608 Jest seconds and five workflow
checks. Its output contains no act warnings. This includes the corrected
late-mount regression. Migration regeneration reports no SQL changes.

Hosted CI for this incremental branch remains pending at this checkpoint.
The native and artifact acceptance below is attributed to frozen d69163d.

## Frozen native acceptance

Application source is `d69163da78e2e1d936617945a1fa401036c807d5`.
The tracked tree and HEAD remain unchanged throughout both builds; later
documentation commits do not change the application tested here. QA uses the
owned x86_64 read-only AVD; no real patient information or physical phone.
Installed APK bytes are pulled back and match the inspected package exactly.

An independent Node AES-GCM/scrypt decoder authenticates each complete export.
The oracle compares schema and every field in all 50 application tables,
excluding settings, backup/audit bookkeeping and migration metadata. It compares
all 34 media hashes and checks integrity/FKs. These are complete intended-state
comparisons, not selected-row or count-only checks:

| Stage | Application rows | Result |
|---|---:|---|
| In-place upgrade | 4,117 | Every prior row and media byte exact |
| Independent initial fixture restore | 4,119 | Only the synthetic patient and episode added |
| Cold raw recovery | 4,120 | One raw draft; no clinical Order |
| Separate publication | 4,121 | One original-episode Order and its retired raw receipt |
| Independent replacement fixture | 4,119 | Original retained form cannot mutate the imported dataset |

The actual editor accepts synthetic name, dose, notes with trailing spaces and
an invalid visible Jalali date. After observed raw acknowledgment, force-stop
ends PID4146. Cold reopening in fresh PID7706 displays all four exact fields.
The independent export confirms the original patient/episode key and no Order.
This is process-death recovery after acknowledgment, not proof of durability
for every keystroke or a physical power-loss test.

Pressing clinical Save with that invalid date produces the observed refusal.
Choosing Today and pressing separate Save publishes once into the original
episode. PID7706 survives the action and its crash buffer contains no fatal for
that checked process. The receipt revision moves from7 to9: date correction
then publication. Every unrelated field/media byte stays exact.

A new unfinished form remains mounted through an actual replacement restore
whose original patient key is reused with different allergy/ward information.
The original raw words remain visibly read-only, the original allergy remains,
replacement context is not shown beside them and clinical Save is disabled.
The complete authenticated final state exactly matches the replacement fixture;
no stale draft or clinical Order appears in it.

Authenticated archive SHA-256 values:

| Stage | SHA-256 |
|---|---|
| Upgrade | `5d50f55ee9d69cb962aef51f33bdff4efa4652b1813ee35227b046b0826b9e1e` |
| Initial fixture | `a3cc93e912225d2eec2a04e31f815c46047446243ed264d830dd404f4c118d51` |
| Cold recovered raw | `821945ba8a6fd2bbe5e99faddfd41f50cf76571582333679dc7df5dfc1f0e609` |
| Published Order | `7b9864c85d134853160ead272afdc0a2ff67b3aac5b986d1e9dcba7ab533b075` |
| Replacement fixture | `4e97f866beafd21d81f761109148220db624a5aeb7c8e5e3eb37b896f5e7031b` |

The initial observation is blocked by a System UI ANR and a UI-automation
connection timeout. The actual system dialog's Wait action restores observation.
Private harness attempts also fail before their assertions: one scroll direction
is wrong; a flattened calendar glyph interrupts generic label association;
end/delete does not clear the RTL date; actionable-only selectors reject disabled
read-only controls. Corrections use fresh observed bounds, the device's documented
Select All key combination and read-only geometry checks. Those attempts are not
application passes or new application defects.

Windows prebuild first encounters a locked generated dex file. After verifying
the idle MedOS Gradle daemon and generated untracked directory, only that daemon
is stopped and the locked generated directory is parked privately. A fresh
prebuild succeeds. No source, app data or shared ADB server is removed.
Existing path-length and future-Gradle warnings are not claimed repaired.

The read-only emulator acknowledges shutdown and its SDK processes exit.
Original userdata and encryption QCOW2 hashes are byte-identical afterward.
All archives, fixture contents, UI dumps and harnesses stay private.


## Inspected packages

Both come from frozen d69163d, identify com.shayan.medos, 0.11.54/code70,
minSDK24/target36, retain signer SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
and contain their essential JNI libraries. The owner artifact is inspected; it
is not run on a physical phone. The generated app build is cleaned per ABI.
The QA build succeeds in10m23s and the owner build in7m54s.

| Package | Bytes | SHA-256 |
|---|---:|---|
| Private x86_64 QA | 55,023,782 | `4d6e5b83794d7bee5cbe7989bb69874228565b11d3fcd5cb1fef164175b56b22` |
| `dist/MedOS-0.11.54.apk`, arm64-v8a only | 53,415,455 | `5ce4ca6c7f2fa4c1b11298ed7c4435ef5caaf6c42c7e04fe00670040f5824653` |

## Remaining gates

Five manual forms remain: specialty profile, prescription, place, extension and
credential. Order correction history/trash, other P0/product/performance gates
and physical-phone acceptance remain in IMPLEMENTATION. This milestone is not
complete paper replacement or proof of a crash-free final application.
