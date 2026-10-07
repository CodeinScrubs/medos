# Reproducible PR review witnesses

These are synthetic, intentionally failing review probes, not application code or
ordinary CI tests. Do not install them on main: main does not contain the proposed
AI/referral/autocomplete features. They are retained so another developer or model
can independently check the findings and demonstrate that a revised PR fixes them.
They do not require a model API, a real patient, a phone, or a network connection.

## Reviewed experiment

Start from `466a1a886bba55b05defed59a1b741c7f7e21b5d` (0.11.26). The experiment
integrated these exact heads in order, in a separate managed checkout:

1. PR 1: `507e0d0d2846e71043ad6c58ec8809b4f5902723`
2. PR 4: `80223bdecf375ec2e86f52e0399e0bd5690c2406`
3. PR 3: `5b90da18750bad6df84c923a5a72b77ff98a0f95`
4. PR 5: `a331e6f283f458761f364fc2cd27b4f395aa78b8`
5. PR 2: `98550ee4534ff8d6bd99c085fd774bb7119b9ab2`

All share the old merge base `6fe73d10f19b5ae09d9683455070710cf68f50e9` (0.11.15).
The local experimental merge ended at `2bd6613`; this is a local review fixture,
not an upstream merge or release. If reconstructing it from GitHub, resolve the
PR 1 overview signature conflict by retaining both the existing original
`useDatasetIntent` generation and the optional AI-opening callback. Resolve the
PR 2 answer publication conflict by retaining the existing always-on guard and
the original dataset lease, with `acting.current = false` before acknowledged
navigation, alongside its proposed permanent committed lock. Do not remove the
newer ownership protections to make an old PR apply.

Before adding these probes, the integrated experiment passed the ordinary check:
123 suites / 1530 app tests and three workflow tests. The subsequent selected
probe run failed 24 checks and passed one SQL-rollback check. This is 24 failed
checks, not 24 independent bugs; four referral checks exercise the same mistaken
state transition. Existing unrelated tests were skipped by the name filter.
The final installed fixtures also passed the mobile TypeScript check before
reproducing 24 failed / one passed / 22 skipped tests on unchanged PR production.
Five initial fixture inputs used `inpatient` instead of the actual `admission`
encounter kind. Those were corrected and the whole selected run repeated; invalid
fixture types were not counted as project defects.

## Installing and running

Use an isolated checkout with the proposed features integrated onto the above
base (or onto a documented newer base). Copy this directory from the audit commit
if it is absent. Keep real data and signing keys out of the review checkout.
Dependencies can use the repository's usual first-time installation.

From that checkout's root:

```powershell
node docs/reviews/2026-10-07/install-witnesses.cjs
npm run typecheck --workspace=@medos/mobile
npm run test --workspace=@medos/mobile -- --runInBand --runTestsByPath src/features/ai/review-witness.test.tsx src/features/consults/share-review-witness.test.tsx src/features/shifts/round-screen.test.tsx src/features/diagnoses/diagnoses-section.test.tsx --testNamePattern 'PR.?[1345] review'
```

The installer checks for the proposed files, refuses duplicate installation, and
writes only the four review test files. The round/diagnosis fixtures append to
the existing suites to reuse their real migrated-SQLite setup. The AI/referral
fixtures use `test/dataset-snapshot.ts` from 0.11.26 for exact replacement and
all-table comparisons. Native clipboard/linking and navigation are stand-ins;
clinical SQL mutations and their outcomes are real sql.js with bundled migrations.

Read the failing assertion and the implementation before changing either. Some
assertions encode a required product contract, such as showing every committed
medication field and keeping blank allergies unknown. Passing a parser/unit test
does not validate clinical content, Android lifecycle behavior, or anonymization
of arbitrary clinical prose. A revised implementation also needs positive paths,
failure/retry, current-scope checks, and native acceptance where relevant.

The audit's full findings and acceptance requirements are in
[project-audit-2026-10-07.md](../../project-audit-2026-10-07.md). These probes must
not become a second roadmap or a shortcut around `AGENTS.md`.
