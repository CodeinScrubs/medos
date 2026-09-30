# Plan 004: Put shift entry earlier and make preview overflow reachable

## Status and tradeoff

- Priority P2; effort M; risk Medium; confidence High for current behavior.
- Depends on plan 001's filtered patient-list route contract.
- Planned on 2026-09-30 at app commit `7c8a1bd`; status SOFTWARE VERIFIED (0.11.4); native acceptance pending.

MedOS is a personal offline Android clinical workspace. Today should lead to current
shift work without requiring a scroll through several patient cards. Short previews
reduce vertical clutter only when their full counts and all remaining records are
one tap away. A full follow-up list is a direct destination, not a new bottom tab.

## Checked current state

Short paths below are relative to `apps/mobile/src/`:

- `features/today/today-screen.tsx:133-146`: up to eight admitted cards precede
  `<ShiftCard />`. The admitted heading counts everyone but has no view-all action.
- Its future follow-ups are filtered then `.slice(0, 5)`; line 160 displays
  `upcoming.length` as the count. More than five are neither counted nor reachable
  together from that section. Due follow-ups currently render without a preview limit.
- `features/followups/queries.ts:28-44` already supplies living patient joins:
  pending due results sorted by explicit priority/date, all pending sorted by date.
- `FollowUpCard` already has explicit complete/postpone actions with outcomes and
  truthful reminder recovery. Reuse it; navigation must not complete a follow-up.
- `features/capture/inbox-section.tsx` and `features/tasks/tasks-section.tsx` already
  use count + preview + full destination patterns. Do not build a generic dashboard engine.

Read `AGENTS.md` and current handoff/architecture. Time-dependent logic receives
`now`; UI uses `useNow`. Counts and visible rows must share the same predicates.
Read failures remain visible with retry; do not substitute zero for unknown.

## Scope

- `apps/mobile/src/features/today/today-screen.tsx`, `today-screen.test.tsx`
- `apps/mobile/src/features/followups/list-logic.ts`, `list-logic.test.ts` (new)
- `apps/mobile/src/features/followups/follow-up-list-screen.tsx`, `follow-up-list-screen.test.tsx` (new)
- `apps/mobile/src/app/followups.tsx` (new: re-export the screen only)

Do not change existing follow-up SQL/status definitions, reminders, completion
handlers, tab navigator, restoration warnings, backup format or clinical schema.
Do not reorder the patient's actual round membership as part of screen ordering.

## Implementation

1. Keep actionable read/restore/data-safety warnings visible. Move the single existing
   `ShiftCard` before stats/long lists so shift entry is encountered earlier. Keep
   due work immediately accessible; secondary calls/inbox/personal sections follow
   current-shift and due-work sections. Do not duplicate the shift card or add widgets.
2. Add an admitted-heading action `همه` to `/patients` with explicit
   `{ status: 'admitted', starred: '0' }`, using plan 001. Its count remains the full
   admitted count, not eight; unknown on read failure. Keep the eight-row preview.
3. In `followups/list-logic.ts`, define validated modes `due` / `upcoming` and the
   upcoming predicate `followUp.dueAt > endOfDay(now)`. Select upcoming from the
   existing pending results. Supply the full result to counting before slicing the
   preview. The same helper and current time must be used on Today and the full list.
   Do not infer clinical urgency from free text or change which statuses are pending.
4. Create `/followups?mode=due` and `/followups?mode=upcoming` using the existing
   query objects and `FollowUpCard showPatient`. Validate the mode, use a virtualized
   `FlashList`, and keep one scroll owner. A deleted patient stays excluded. Expose
   loading, initial error, loaded refresh error and retry. Avoid a new patient picker,
   workflow engine or calendar implementation. Returning reaches the original Today.
   Use a local date key for midnight re-querying; do not re-query every clock tick.
   If the route mode changes on a mounted screen, do not relabel retained rows as
   the other mode's complete list. Key the read-only result region by mode or retain
   the previous label until its replacement result is ready. An active outcome prompt
   must not silently lose its text through this transition.
5. Make the future heading count all selected upcoming rows and open their full list.
   It previews five. Due follow-ups may now preview five only after the full due path
   exists; keep the complete count and explicit overdue count visible and preserve
   query priority ordering. The due stat tile opens due mode. A preview is not a claim
   that only five actions exist or that urgent work has completed.
6. Preserve the narrowly worded no-follow-up state. Do not upgrade it to "all work
   complete" based on follow-up/admitted queries alone: tasks, consults, drafts and
   captures have separate state. Preserve the existing floating capture entry.

## Verification

Run from the root:

```powershell
npm run brief
npm run check
git diff --stat 7c8a1bd..HEAD -- apps/mobile/src/features/today apps/mobile/src/features/followups apps/mobile/src/app/followups.tsx
npm run test --workspace=@medos/mobile -- --runInBand src/features/today/today-screen.test.tsx src/features/followups/list-logic.test.ts src/features/followups/follow-up-list-screen.test.tsx src/features/followups/queries.test.ts src/features/followups/follow-up-card.test.tsx src/features/read-errors.test.tsx
npm run check
git diff --check
```

All commands must exit zero; the new files must exist before their focused run.
Plan 001 deliberately changes Today navigation first; reconcile that expected drift.
Use the real SQLite/component pattern in `features/read-errors.test.tsx` and
`followups/follow-up-card.test.tsx`, with queries mocked only through the migrated
test DB. Pure date selection tests receive fixed `now`, never the host clock.

Test zero, one, five, six and many rows; more than eight admissions; complete counts
vs previews; overdue/priority order; end-of-day/midnight change; tomorrow vs today;
deleted patients; invalid route mode; failed initial/refresh reads; actual retry;
opening a full list makes no clinical write. Existing complete/postpone tests remain.

## Acceptance and boundaries

- Native, synthetic forty-patient workload: shift entry is before long preview lists;
  tapping it enters the existing shift/round. No new top-level navigation destination.
- An admitted patient beyond position eight and a follow-up beyond five are each
  reachable through one full-list action. The displayed full count matches the list
  in a stable dataset. Keyboard, Back and three-button navigation remain usable.
- One scroll owner and virtualization in the full follow-up page; no claimed speed
  improvement until measured on the same device/build/scenario.
- Mark SOFTWARE VERIFIED until native acceptance; update index/handoff and commit
  with reason and actual Agent trailer.

Stop if there is no truthful full-list path, if counts require a different clinical
predicate or if this expands into a global merged queue. Unbounded due tasks/consult
sections are separate follow-up work; this plan does not claim to solve every large
list or all Today performance. Do not remove requested personal modules as "clutter".
