# Validation scope: 0.11.22

Version 0.11.22 / Android code 38 makes search, lab reflagging and legacy note
history repair read/write units synchronous and transactional. No dependency,
permission, migration, route, archive/key scheme or visible feature was added.
See architecture's matching decision for the responsiveness tradeoff and scope.

## Reproduction and software evidence

`features/search/repair-races.test.ts` runs on real sql.js SQLite migrated with
the application's bundled migrations. A spy observes a completed real SELECT
and queues a genuine SQL edit; it supplies no replacement SQL results. This
pins the JS yield between the old snapshot read and its stale write. The patient
witness calls the actual patient update query. Other fixtures acknowledge a
correction and its correct index/flag through real SQL.

The finalized 21 witnesses all failed on pinned previous commit `02d2432`:

- Twelve search rebuild entry points overwrote an acknowledged newer index.
- Five related-name paths used an old specialty, teacher or place name.
- Lab reflagging applied the old value/range verdict to a corrected value.
- A later lab SQL failure left earlier flags changed; version remained unset.
- Parallel legacy-history passes inserted duplicate baseline versions.
- A later baseline SQL failure left earlier versions inserted.

All fourteen owned runtime files were preserved and restored byte-for-byte
around the old-source probe; no build or native session overlapped. The current
transactional implementation passed the targeted suite. Real SQLite abort
triggers verify rollback of the complete lab/history pass and successful retry.
The lab rollback/retry case also compares complete rows: only derived flags can
change, never clinical values or their edit times.

The first full typecheck rejected two test helpers: the afterEach callback
returned Jest rather than void, and search predicates needed `and(...matchesSearch)`.
Both were fixed without weakening types or lint rules. An initial root-cwd scoped
ESLint command could not find the mobile configuration; rerunning from the mobile
workspace passed. Prettier ran from the repository root on changed files only.

Full `npm run check` passed typecheck, lint without warnings, formatting,
108 suites / 1356 app tests and all three workflow tests. Exact-source CI,
signed artifacts and native acceptance are pending. Tests do not prove native
SQLite scheduling or phone responsiveness. The primary agent owns review and
integration; the two existing reviewers could not complete their final attempts
because their account usage limit was reached. No further agents were started.

## Remaining boundaries

- These are atomic per-feature/pass repairs, not one transaction across all
  restore housekeeping. No cross-process transaction protocol is claimed.
- Other manual forms, delayed raw-draft actions and async continuations still
  need immutable dataset tokens and retained pending input. Fresh capture on
  retained root screens after restore remains a distinct acceptance case.
- Existing duplicate baselines are preserved; this patch does not delete history.
- No large-dataset benchmark, physical-phone/API 26 acceptance, power-loss or
  low-storage guarantee. Durable draft/capture stopped voice and originals before
  crop remain separate work. The project is not feature-complete.
