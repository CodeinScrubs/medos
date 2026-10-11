# Validation: note ownership, audit and retained choices (0.11.61)

Candidate: 0.11.61 / Android code77, codex/note-action-integrity, based on
PR11's 8ecaa67. No dependency, schema, migration, route, permission, clinical
rule, stored draft codec or encrypted archive/key change.

## Change and evidence

- Ordinary note creation, correction, delete, trash restore and version restore
  require the original live patient and any explicit matching live encounter.
  Undefined selects the active encounter inside the transaction; explicit null
  stays null, and a closed live original encounter remains valid. Imported
  empty IDs receive an ownership check. This is SQL behavior, not evidence that
  every editor accepts such a legacy ID.
- The typed correction excludes patient/encounter changes. Runtime unknown keys
  and identity/tombstone patches are also rejected. Undefined fields do not
  remove unchanged content from search; explicit null still clears content and
  retains the old immutable version.
- Delete and trash restore require audit in their synchronous transaction.
  Injected SQLite audit failures roll back the entire operation and propagate;
  missing/alive/repeated requests do not add false audit or rewrite a tombstone.
- The list carries an ephemeral exact metadata tuple, using existing immutable
  versions and delete/restore audit counts. Old actions after same-clock edits
  that change back, or an identical tombstone cycle, are refused. Every retained
  card caller passes the shown patient/basis and original dataset intent; mount,
  focus and a single-flight latch prevent callbacks acting on a departed screen.
  Trash restore supplies the exact shown tombstone and lifecycle.
- The original32+1 pagination and33KB payload regression remain green; no full
  note body is loaded into a card. Live dependencies include notes, patients,
  note_versions and audit_log. No threshold was increased to accept the change.

Software evidence, observed in this session:

1. Clean application baseline8ecaa67:182 suites/2,734 app tests, five workflow
   checks, typecheck/lint/format and zero lint warnings.
2. Seven real-SQL regression witnesses fail before the first writer repair:
   split audit, foreign encounter, two runtime identity patches, and two deleted
   parents. Two further witnesses fail for tombstone patch and undefined search.
3. Four actual rendered-card regression witnesses fail before mount/focus
   protection, covering retained pin/delete after departure. Existing dataset
   replacement tests remain enabled. Native modules use documented stand-ins.
4. An imported empty foreign encounter witness fails before sharing the parent
   guard with version restoration. It passes after that repair.
5. Final earlier focused set: eight suites/103 tests pass. After the last parent
   guard/legacy-fixture adjustment, three focused suites/45 tests pass.
6. Full final application check:183 suites/2,759 app tests (Jest274.419s), five
   workflow checks, typecheck/lint/format and zero lint warnings. The initial full
   candidate correctly refused a malformed legacy fixture created through the
   now-guarded public API. The fixture now explicitly injects its invalid
   association in SQL; its restoration-refusal assertions were not weakened.

Private raw logs include validation-0.11.60/new-review-note-before.log,
new-review-note-remaining-before.log, new-review-note-lifetime-before.log and
new-review-note-final-focused.log, plus validation-0.11.61/version-parent-before.log,
parent-final-focused.log and source-check.log. Earlier candidate failures remain
failures; they are not relabeled as final acceptance. The untracked review
documents from other work are preserved outside this commit.

## Review of the newly supplied AI reports

The attachment combines repeated reviews, proposals and self-corrections.
Falsifiable technical sections were compared to source; this is not a claim that
every line, external citation or absent ZIP test bundle was independently checked.
Public main was verified at2dcd60bb5337d8089d968979d92d0c3c44511ee5/.50; PR11
was verified at8ecaa67/.60. Main-based counts are not current candidate counts.

| Supplied claim | Finding on the candidate |
| --- | --- |
| Note delete/restore audit is separate or best effort | Real before .61; now required in the mutation transaction with real rollback evidence. |
| Ordinary note writers permit foreign encounter or runtime identity patch | Real boundary gap, reproduced and repaired. It did not prove the strongly guarded draft publication UI normally changed patients. |
| Trend/LabsTab hide read failures as empty success | Stale for this branch: Trend observes result/ownership failure and LabsTab observes value/panel/media/ownership failure. |
| Ideas and manual forms only hold React state | Stale: .51/.54/.55 connect the existing recovery engine. Native interruption and per-keystroke durability remain separate gates. |
| Clinical correction history and lab/contact/follow-up recovery are missing | Stale after .56/.58. Other notebook trash and full native acceptance remain open. |
| Arbitrary error messages/stacks are fully scrubbed | Unsupported. redactErrorText removes the params suffix, not every possible patient/secret in arbitrary text. This review found a guarantee gap, not observed real patient disclosure. |
| Diagnostic share failure is unhandled | Current: ErrorLogScreen starts void share() without a rejection boundary. Lifetime/focus/single-flight and truthful retry still need implementation. |
| Backup scratch is always removed after process death | Not proved. The engine uses private plaintext VACUUM scratch and finally cleanup; cold-start interrupted-work cleanup needs inspection and a death/restart witness without deleting restore journals. |
| Expo48/RN0.72, new App.tsx/screens/audit/audio frameworks, async Drizzle transaction, raw SQLite-copy ZIP restore, FULL to NORMAL | Incompatible assumptions/proposals. Installed sources are Expo57/RN0.86.3; retain synchronous transactions, existing layers and the frozen backup engine. No such replacement was added. |
| External23/25/28/31/50 test counts or readiness scores establish completion | No. Those are not this app's checks; absent bundles were not executed, and arbitrary scores are not release/clinical evidence. |

The owner's pasted request for weeks of local patient/settings/use history is
recorded as a product requirement, with a narrow separate selected clinical
export contract in AGENTS.md. It is not implemented by the current100-error log.
No external proposal formula/medical threshold was copied or called validated.

Open PR1–11 heads were refreshed; none were merged here. This refresh and the
current application check do not independently approve every unmerged PR diff.
PR11's earlier title/body update requires the already-present user submission
form; no submission or successful update was observed, and it was not bypassed.

## Native, CI and artifact boundary

At this source checkpoint the .61 normal push, hosted CI, frozen x86 native
acceptance and inspected arm64 owner APK are pending. The .60 artifacts and
native observations remain attributed to validation-0.11.60. Later actual .61
evidence must be appended with its exact source and bytes, not substituted by
the successful software check.

Physical phone, complete timed40-patient shift, rich text, remaining notebook
trash, fuller follow-up/outpatient workflows, native pressure/input issues,
alarm delivery/OEM/Doze/reboot/provider/second-device recovery and physician
validation remain separate open gates. The phone is not the only remaining
work, and this is not a crash-free or finished-product claim.
