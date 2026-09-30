# Plan 005: Keep round navigation reachable without losing pending text

## Status and tradeoff

- Priority P2; effort M; risk Medium; confidence High for current layout.
- Depends on plan 003's touch sizing; planned on 2026-09-30 at app commit `7c8a1bd`.
- Status SOFTWARE VERIFIED (0.11.4); native acceptance pending. Native keyboard/safe-area behavior has not been verified for this design.

MedOS is a Persian RTL Android workspace for one physician. A round's next action
should remain available while reviewing a long patient card. A fixed footer consumes
some viewport height; preserve readable patient content, editing and safe navigation
rather than forcing the entire card to fit on one screen.

## Checked current state

All short paths are relative to `apps/mobile/src/`:

- `features/shifts/round-screen.tsx:172-212` places `<RoundCard />`, then
  `دیدم و بعدی` / `بعدی`, inside the same `<Screen scroll>`.
- Actions already use `scope.perform`; `RoundCard` is keyed by membership ID.
  `seen()` writes reviewed state then advances; `skip()` advances without marking.
- `components/autosave-scope.tsx:17-29` runs a `SaveGroup` and keeps the lifetime
  leave guard active. `lib/save-before-leave.ts:31-38` blocks concurrent actions and
  proceeds only after flush returns true. Resolving false must keep current input.
- `components/ui/layout.tsx:40-63` consumes the bottom safe edge and uses the
  existing `KeyboardAwareScrollView`. A second bottom consumer adds double padding.
- The round already has membership/read-error gates; latest note/consult reads
  and retry. Do not undo these while moving controls.

Read `AGENTS.md`, current handoff and architecture before edits. Header options must
remain `ScreenOptions`; do not conditionally remove `useSaveBeforeLeave` or remount a
loaded editor on a refresh error. Reviewed means visited, not patient tasks completed.

## Scope

- `apps/mobile/src/features/shifts/round-screen.tsx`
- `apps/mobile/src/features/shifts/round-screen.test.tsx` (new)

Existing tests `features/shifts/round.test.ts`, `features/read-errors.test.tsx` and
`lib/save-before-leave.test.ts` must still pass. Change them only for a demonstrably
necessary test integration and record it before editing. Do not change shared
`Screen`, AutosaveScope, round algorithm, SQL, membership order or clinical status.

## Implementation

1. For the normal active-round view, use one outer non-scrolling `Screen` with
   horizontal padding handled by its content, one existing
   `KeyboardAwareScrollView` for progress/card/errors, and a sibling action footer.
   Reuse the installed keyboard controller; no new dependency. Other loading/error/
   complete branches may keep their current simple screens.
2. Let the outer `Screen` own the bottom safe edge once; the footer must not also
   add the same inset. Keep adequate content end padding so the last field can be
   reached. Verify with both gesture and three-button navigation; hardcoded bottom
   heights do not prove safe placement. Maintain existing keyboard-aware focus and
   handled taps. At rest the footer remains visible after any card scroll.
3. Keep `دیدم و بعدی` primary and `بعدی` secondary, both at least 48dp touch targets.
   Give skip the concise explanation `بدون ثبتِ دیده‌شدن` where needed, including
   accessibility. Replace the repeated paragraph only if meaning stays clear.
4. Preserve `scope.perform` for both actions and the member-ID key. Display a local
   busy state during the action; the existing SaveGroup still owns duplicate-action
   protection. Both controls are unavailable when authoritative membership/shift
   progress is unreadable. A failed field flush or reviewed write must not advance
   the cursor, claim completion or discard the card.
5. Do not add a bespoke animated keyboard system. For the first bounded design the
   footer may hide while the software keyboard is visible, using React Native's
   existing keyboard events; it must return on keyboard dismissal with input intact.
   This preserves editing space. Advancing after dismissal still flushes pending
   fields; hiding a footer must never unmount the autosave scope/card. Record this
   tradeoff explicitly in the handoff so it is not mistaken for a rendering bug.

## Verification

Run from the root:

```powershell
npm run brief
npm run check
git diff --stat 7c8a1bd..HEAD -- apps/mobile/src/features/shifts/round-screen.tsx apps/mobile/src/components/autosave-scope.tsx apps/mobile/src/lib/save-before-leave.ts
npm run test --workspace=@medos/mobile -- --runInBand src/features/shifts/round-screen.test.tsx src/features/shifts/round.test.ts src/features/read-errors.test.tsx src/lib/save-before-leave.test.ts
npm run check
git diff --check
```

Expected: all exit zero and tests pass. Use the real query/component pattern in
`features/read-errors.test.tsx`; its hook stand-in is suitable for injected failures
but does not establish real `useLive` transition or native layout correctness.

New behavioral regressions: pending handoff/summary save is awaited before cursor
change; flush false retains exact text and patient; write rejection does not mark or
advance; repeated taps cause at most one reviewed write; skip leaves reviewedAt
unchanged; keyboard state hides only footer, not editor/scope; read failure does not
declare an empty/done round. Do not add snapshot or position-only tests as a substitute
for these behaviors. Existing pure next/start/progress tests remain unchanged.

## Native acceptance and stopping points

- Use synthetic multiple patients, long last-note/consult/task data and equal names.
  Scroll the entire card: footer remains reachable at rest and the last field is
  editable. Identity/allergies remain available; no clinical information is removed.
- Type into a low field, dismiss keyboard and immediately select primary/skip.
  Verify exact text persisted to that patient and only the intended cursor change.
  Reopen the round; skip must not be mistaken for reviewed.
- Check increased font size, RTL, light/dark and three-button navigation. Use UI
  bounds for taps. Test native write failure when a supported injection is available;
  otherwise label it unverified even if component failure tests pass.
- Record SOFTWARE VERIFIED vs NATIVE VERIFIED separately; update index/handoff
  and commit the focused layout change with rationale and actual Agent trailer.

Stop if the design needs a new keyboard library, a global Screen rewrite, changing
the round algorithm, discarding content, or moving/unmounting a card before a true
flush. Active-shift identity transitions remain a separate D08 thread in the wider
ledger; this layout change does not close that correctness issue.
