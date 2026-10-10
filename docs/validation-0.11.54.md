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

Hosted CI, native process-death/replacement recovery and inspected .54 owner APK
acceptance remain pending at this source-freeze checkpoint.

## Remaining gates

Five manual forms remain: specialty profile, prescription, place, extension and
credential. Order correction history/trash, other P0/product/performance gates
and physical-phone acceptance remain in IMPLEMENTATION. This milestone is not
complete paper replacement or proof of a crash-free final application.
