# Plan 003: Make routine controls easier to tap and small text readable

## Status and tradeoff

- Priority P2; effort M; risk Medium because primitives affect many forms.
- Confidence High for source sizes/colors; native tap bounds unverified.
- Depends on none; planned on 2026-09-30 at app commit `7c8a1bd`; status SOFTWARE VERIFIED (0.11.4); native acceptance pending.

MedOS is a Persian RTL clinical Android app used during busy ward work. Slightly
taller controls consume space but reduce precise aiming; readable secondary text
can remain visually secondary through typography and grouping. Preserve navigation
and information rather than shrinking important text to fit more on one screen.

## Checked evidence and standard

All short paths are relative to `apps/mobile/src/`:

- `components/ui/chips.tsx:144-148`: `height: 36`, no `hitSlop` on the Pressable.
- `components/ui/field.tsx:313`: segmented option `height: 38`.
- `features/patients/patient-list-screen.tsx:174-179`: filter chip `height: 36`.
- Task checkbox: 24px icon plus 8px hit slop; shift-review checkbox: 26 plus 8.
  Those nominal expanded sizes are 40/42, still below 48, and ancestor bounds can
  further limit them. The native effective bounds were not measured in this audit.
- `theme/tokens.ts:67,105,185-187` uses `textFaint` for small text. Calculated
  sRGB contrast: light `#8A9AA4` on white 2.90:1, background 2.68:1, surfaceAlt
  2.55:1; dark `#6B7E8A` on surface 4.01:1, surfaceAlt 3.57:1.
- Patient-record tab labels use tiny type and one line in a four-column grid.
  Its discoverable destinations should remain visible, adapting to larger fonts.

[Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps)
recommends a focusable target at least 48 by 48dp and 4.5:1 for small text.
The colors above were calculated from this repository, not measured from a screenshot.

## Scope

- `apps/mobile/src/theme/tokens.ts`, `tokens.test.ts` (new)
- `apps/mobile/src/components/ui/chips.tsx`
- `apps/mobile/src/components/ui/field.tsx` (segmented controls only)
- `apps/mobile/src/features/patients/patient-list-screen.tsx`
- `apps/mobile/src/features/patients/patient-record-screen.tsx` (grid layout/label wrapping only)
- `apps/mobile/src/features/tasks/task-row.tsx`
- `apps/mobile/src/features/shifts/shift-screen.tsx` (review checkbox layout only)

Read `AGENTS.md`, current handoff and architecture first. Use `MIN_TOUCH` and theme
tokens; no color literals outside theme, new UI library or dependency. Do not change
clinical status, task completion, autosave, route guards, font scaling or data schema.

## Implementation and checks

1. Replace fixed 36/38 heights with `minHeight: MIN_TOUCH`; ensure minimum width
   also accommodates 48dp. Use modest vertical padding and let larger text wrap or
   grow. Do not fix clipping with `allowFontScaling={false}` or an arbitrary font cap.
2. Give task and review checkboxes a 48-by-48 centered Pressable. Retain their
   smaller icon, role, checked/disabled state and action. Avoid overlapping hitSlop
   into adjacent record-opening controls; parent touch areas must not steal taps.
3. Keep all eight record destinations directly visible. Use content-driven minimum
   cell height and wrapping; at larger font scales, two columns may replace four
   if measured width requires it. Preserve patient-tab autosave/URL behavior. Do
   not remount an editor when display dimensions or font scale change.
4. Adjust `textFaint` light/dark tokens for at least 4.5:1 on background, surface,
   surfaceAlt and surfaceSunken, where this small text is used. Keep other palette
   roles unchanged unless an actual used pair fails. Document which pairs were
   checked rather than claiming every semantic color was validated.
5. Add a small independent sRGB luminance/contrast test in `theme/tokens.test.ts`
   for those foreground/background pairs in both themes. Test the minimum ratio,
   not fixed hexadecimal replacements. Do not apply text thresholds to intentionally
   subtle borders or decorations. No snapshot/style-counting suite is required.

From the repo root, before edits and after the relevant steps:

```powershell
npm run brief
npm run check
git diff --stat 7c8a1bd..HEAD -- apps/mobile/src/theme apps/mobile/src/components/ui apps/mobile/src/features/patients apps/mobile/src/features/tasks/task-row.tsx apps/mobile/src/features/shifts/shift-screen.tsx
npm run test --workspace=@medos/mobile -- --runInBand src/theme/tokens.test.ts src/features/patients/patient-record-screen.test.tsx src/features/tasks/tasks.test.ts src/features/shifts/shifts.test.ts
npm run check
git diff --check
```

Expected: all named tests and checks pass. Earlier plan 001 may have changed the
patient list; preserve its route/filter implementation when reconciling drift.

## Native acceptance

Walk patient filters, medication/lab option chips, record tabs, task completion and
shift review in both themes, at default and increased font sizes (including 2x when
supported). Check long Persian labels and English clinical values. Selected state
must still be discernible without color alone. Check TalkBack roles/labels and native
bounds: dp = physical bounds / the device density. A Jest style check is not evidence
that Android delivered a 48dp tap target.

Tap the boundary between checkbox and record title; only the intended action should
run. Use actual UI bounds and test three-button navigation. Do not call this NATIVE
VERIFIED until the native scenarios have been observed; SOFTWARE VERIFIED is valid
after the tests pass. Update index/handoff and make a focused Agent-trailed commit.

Stop and report if resizing requires changing generic screen safe-area behavior,
introducing a new component library, hiding destinations or disabling font scaling.
Those are different design decisions, not routine fixes for small controls.
