# Plan 001: Open the list or consult the user selected

## Status and purpose

- Priority: P2 within the UX batch; effort M; change risk Medium; confidence High.
- Depends on: none. Planned on 2026-09-30 at app commit `7c8a1bd`.
- Status: SOFTWARE VERIFIED (0.11.4); native acceptance pending.

MedOS is one physician's offline Android workspace, with Persian RTL menus and
Latin clinical fields. A tap on "admitted" or "starred" should produce that list;
a tap on an open consult should open that consult. Remove these detours using
existing routes and queries, without changing clinical facts or adding a top-level tab.

## Checked current state

- `apps/mobile/src/features/today/today-screen.tsx:103,109` uses the same action
  for two differently counted tiles:

  ```tsx
  onPress={() => router.push('/patients')}
  ```

- `features/patients/patient-list-screen.tsx:34-46` initializes `tab` to `all`.
  That means current statuses when not searching; name search reaches discharged
  and archived patients. The screen does not read route filters.
- `features/patients/queries.ts:23-54` already accepts `statuses`, `search` and
  `starredOnly`, and excludes deleted patients. Today's starred count uses
  `patientListQuery({ starredOnly: true })`, including all living statuses.
- `features/consults/open-consults.tsx:35` sends the user to the patient root.
  `consults-section.tsx:59-60` already opens `/consult-answer` with `consultId`;
  `answer-screen.tsx:20-44` keys its loader by that ID and has read/retry handling.
- `patient-record-screen.test.tsx:129-143` pins an important route pattern: manual
  selections update the URL so an external link to the same value can apply again.

Paths in this plan beginning `features/` are relative to `apps/mobile/src/`.
Read `AGENTS.md` and the latest handoff first. All SQL remains in queries; use
`useLive`, `ErrorNotice` and existing normalized search. No schema changes.

## Scope

Modify only these app files, plus plan status/handoff required by `AGENTS.md`:

- `apps/mobile/src/features/today/today-screen.tsx`
- `apps/mobile/src/features/patients/patient-list-screen.tsx`
- `apps/mobile/src/features/patients/list-route.ts` and `list-route.test.ts` (new)
- `apps/mobile/src/features/patients/patient-list-screen.test.tsx` (new)
- `apps/mobile/src/features/consults/open-consults.tsx` and `open-consults.test.tsx` (new test)
- `apps/mobile/src/features/today/today-screen.test.tsx` (new; plan 004 may extend it)

Do not change patient/encounter status, query ordering, notification handling,
consult publication, global navigation or the search-index version. No dependencies.

## Implementation

1. Add a pure route parser in `list-route.ts`. Contract: `status` is `current`,
   `all` or a whitelisted `PatientStatus`; `starred` is exactly `1` or `0`.
   Missing/invalid/array values fall back safely to current scope and no star filter.
   Do not coerce an arbitrary string to `PatientStatus`.
2. Define scopes clearly: current + empty search uses `CURRENT_STATUSES`; current
   + nonempty search reaches all living statuses, preserving the existing behavior;
   explicit all has no status restriction; a specific status stays restricted during
   search. Starred is an independent boolean. Today's starred tile explicitly opens
   `{ status: 'all', starred: '1' }`; admitted opens
   `{ status: 'admitted', starred: '0' }`. This makes list and tile counts compatible.
3. Make route filters the source of truth for scope/star selection. Manual selections
   must update them with `router.setParams`; do not repeatedly overwrite `search`
   from an effect. Keep a visible selected/clearable star filter and a comprehensible
   scope label. An ordinary return from a record preserves search and filter.
   Match the patient-record route tests for repeated external destinations.
4. Keep the search input mounted while list filters change. A small results child
   keyed by canonical scope/star values can prevent `useLive`'s intentionally retained
   old data appearing under a new filter. Do not key the entire screen per keystroke
   or change the shared `useLive` contract. Retained content must never be called
   a complete result for another filter. Expose read and location retry; suppress
   "no patients" and definitive counts when their read is unreliable.
5. Send an open-consult row directly to `/consult-answer` with that row's `consultId`.
   Preserve the existing gate and visible patient identity. Opening an editor must
   not request, answer, complete or otherwise mutate the consult.

After the parser and each wiring step, run the relevant tests below. A useful failing
regression is the current starred tile producing current nonstarred rows instead.

## Commands and tests

Run from the repository root:

```powershell
npm run brief
npm run check
git diff --stat 7c8a1bd..HEAD -- apps/mobile/src/features/patients apps/mobile/src/features/today apps/mobile/src/features/consults/open-consults.tsx
npm run test --workspace=@medos/mobile -- --runInBand src/features/patients/list-route.test.ts src/features/patients/patient-list-screen.test.tsx src/features/patients/queries.test.ts src/features/consults/open-consults.test.tsx src/features/today/today-screen.test.tsx
npm run check
git diff --check
```

Expected: every check exits zero; all named tests pass once the new files exist.
Drift is a review command, not proof that the live code still matches the excerpts.

Use the render/router pattern in `patient-record-screen.test.tsx`. Query integration
patterns are in `patients/queries.test.ts`: real migrated SQLite via
`jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'))` and
`useTestDatabase(await createTestDatabase())`. Do not invent a separate SQL mock.

Cover: missing/invalid/array params; current empty-search vs archive name-search;
admitted while searching; starred discharged and archived patients; deleted records
excluded; manual filter -> same tile again; clearing star; route change while tab is
already mounted; failed initial/refresh read with retry; consult ID matches the row
and navigation makes no clinical write. Test behavior, not snapshots or literal styles.

## Acceptance and stopping points

- Automated regressions and `npm run check` pass.
- Native: start with an already-mounted patient tab, change its filter, tap Today's
  same tile again, and verify the selected scope. A starred discharged synthetic
  patient is reachable. Return from their record preserves the search field.
- Native: an open-consult tap shows that consult and patient directly; Back does
  not build duplicate patient/list screens. Count equality assumes no concurrent edit.
- Status is SOFTWARE VERIFIED until these native interactions are observed.

If a proposed fix requires changing query semantics, schemas, clinical status or
shared live-query behavior, stop and report the mismatch instead of widening scope.
Reconcile expected predecessor changes before replaying a drifted plan. Commit a
focused reason with the actual Agent trailer; record what was and was not verified.
