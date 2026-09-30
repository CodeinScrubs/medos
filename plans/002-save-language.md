# Plan 002: Distinguish a saved draft from a note published in the chart

## Status and purpose

- Priority P2; effort S; risk Low; confidence High; depends on none.
- Planned on 2026-09-30 at app commit `7c8a1bd`; status TODO.

MedOS is a Persian RTL offline Android app for one physician. Draft persistence
and publication in the clinical record are different existing operations. Wording
should make their difference clear without repeated instructions or extra dialogs.
This plan changes language only; changing autosave semantics would be a separate task.

## Checked current state

All paths below are relative to `apps/mobile/src/`:

- `features/notes/note-editor-screen.tsx:266-277` flushes then calls
  `commitNoteDraft(draftId)` before returning. Both header/footer say `ذخیره`.
- Its autosave status already says `پیش‌نویس خودکار ذخیره شد` only for saved state.
  Yet line 380 calls a recovered persisted draft `نوشته‌ی ذخیره‌نشده‌ی قبلی`.
  The explicit leave dialog calls edits unsaved even when their draft was saved.
- `features/capture/inbox-section.tsx:80` and
  `features/settings/more-screen.tsx:38` say `ثبت‌های نشده`; their contents are
  stored captures that have not been filed into an appropriate record.
- `more-screen.tsx:44-45` says `ضبط تماس‌ها` and attributes recordings to the
  phone dialer. The actual feature also imports user-picked/shared external audio.

Read `AGENTS.md`, newest handoff and architecture before edits. Keep inline Persian
UI strings, existing `ScreenOptions`, error/retry feedback and lifetime leave guards.

## Scope and target wording

Only edit:

- `apps/mobile/src/features/notes/note-editor-screen.tsx`
- `apps/mobile/src/features/capture/inbox-section.tsx`
- `apps/mobile/src/features/settings/more-screen.tsx`

| Location | Target meaning / suggested Persian |
|---|---|
| Note footer publication action | `ثبت در پرونده` |
| Note header publication action | `ثبت` when the full phrase does not fit; same operation as footer |
| Draft recovered | `پیش‌نویس قبلی بازیابی شد` |
| Leave title for content not published | `این تغییرها هنوز در پرونده ثبت نشده` |
| Leave choices | Preserve keep-draft, continue-writing and explicit discard behavior |
| Capture inbox heading / More entry | `ورودی‌ها`; More subtitle: `ثبت‌های سریع برای دسته‌بندی` |
| More calls entry | `فایل‌های تماس`; subtitle: `افزودن فایل صوتی به پروندهٔ بیمار` |

Keep the existing autosave success/failure states honest. Idle is not a new successful
write. Do not replace every "save" string mechanically: manual forms, backups,
drafts and clinical publication each describe different operations.

## Steps and verification

1. Check the target actions still have the behavior described above. Change the
   specific labels/recovery line, leaving handlers and guards intact.
2. Review the diff for handler/state changes; there should be none. Inspect header
   width on native UI and use the short publication label there if needed.
3. Run existing persistence regressions and the project gate from the repo root:

   ```powershell
   npm run brief
   npm run check
   git diff --stat 7c8a1bd..HEAD -- apps/mobile/src/features/notes/note-editor-screen.tsx apps/mobile/src/features/capture/inbox-section.tsx apps/mobile/src/features/settings/more-screen.tsx
   npm run test -- --runInBand src/features/notes/drafts.test.ts src/features/notes/commit-draft.test.ts src/features/editor-recovery.test.tsx src/features/capture/captures.test.ts
   npm run check
   git diff --check
   ```

   Expected: all commands exit zero and tests pass. Do not add snapshots or tests
   asserting this wording alone. If an existing test models an obsolete literal
   label, adapt it without weakening its save/failure assertion and record the extra
   test file in scope before editing.

## Acceptance and boundaries

- Writing/back/reopen still restores a draft; publication requires the existing
  explicit action. Publishing produces the same note/version/media as before.
- A failed flush still keeps input and blocks leaving; discard remains explicit.
- Native: recovered state is visibly a saved draft, the publication action fits the
  header at increased font size, and inbox items are not described as lost/unsaved.
- Mark SOFTWARE VERIFIED if native acceptance has not run. Update plan status and
  `docs/HANDOFF.md`, then commit the wording change with its reason and Agent trailer.

Stop if the wording assumes a draft is persisted when it is not, or if a proposed
solution changes save/publication/discard behavior. Do not silently turn autosaved
drafts into clinical chart entries or change the data format, templates or media flow.
