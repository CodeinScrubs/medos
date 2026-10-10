# Workspace-form raw recovery — 0.11.51/code67

This milestone connects the shared idea/topic recovery pilot to the actual
existing forms and lists. It does not complete D05 or MedOS release acceptance.
Current status is also recorded in HANDOFF and IMPLEMENTATION.

## Source and scope

Branch `codex/workspace-form-recovery` is based on `2dcd60b`. Application
version0.11.51/code67 adds migration0029 and its bundled journal entry. Existing
migrations, dependencies, Android permissions, routes and frozen archive/KDF
schemes are unchanged. Only workspace idea/topic ports are enabled. Clinical
draft stores, orders and permanent correction history are separate work.

## Reproduction and automated evidence

Before connecting recovery, three mounted-form regressions fail: unfinished
idea/topic words disappear after remount, and an acknowledgment after focus
loss closes another route. After implementation these regressions pass.
The harness uses migrated real SQLite and actual form/hook components, with
host UI/date/native stand-ins. It does not prove IME, headers or hardware.

The repaired starting check passes161 suites/2,275 app tests and five workflow
tests, including20 then-untracked shared-codec cases on the .50 base. The
initial connected five-suite run passes125 cases. A later targeted run passes
46 mounted/SQLite cases. Final `npm run check` passes163 suites/2,325 app tests
plus five workflows, with clean typecheck/lint/both formatting checks. This
includes the later foreign-document loading regression and selectable-raw
assertion. Jest completes in306.104 seconds with zero snapshots.
Regeneration reports no schema changes, with exact pre/post hashes for the
new SQL/snapshot, bundled migration JS and journal. Older migrations are untouched.
The first full attempt stops at formatting of the added restore cases; its
typecheck/lint pass. Formatting is corrected before the next full attempt.
Earlier renderer-observer failures from invalid act boundaries are preserved
privately; they are not asserted application crashes.

Coverage includes exact whitespace/tags/partial date text, strict future/foreign
document refusal, new/edit scope separation, complete-basis comparison with
equal timestamps, revision competition/overflow, single publication/replay,
deleted target refusal, atomic audit-failure rollback, soft discard, old/current
archive imports, background/Back recovery, read failures, same-id actual dataset
replacement, dialog/focus/route/read/unmount ownership, selected retired drafts,
bounded tied-time recovery pages, raw-only adoption and separate Save. Topic
publication uses visible dates and live teacher/specialty reads; unchanged
timestamps retain seconds/milliseconds. Malformed receipt replay cannot claim
publication. Unsupported raw documents stay selectable without a fresh form.

## Hosted and native evidence

Previous .50 final-head `2dcd60b` hosted CI38007035821 is successful, including
full checks, regeneration and the Android bundle. PR1–5 retain their previously
reviewed exact heads. This does not establish CI for the new source.

No .51 native build/install/UI/archive witness is complete at this checkpoint.
The last inspected owner APK remains `dist/MedOS-0.11.50.apk` from `1915ee5`;
see validation-0.11.50. A successful software test is not a native header/IME or
crash-recovery witness. Exact-source build, actual APK identity/ABI/signature/
essential-library inspection, in-place install and independent whole-archive
comparisons are required before widening this evidence boundary.

## Remaining gates

Six manual forms still need raw recovery: Kardex order, specialty profile,
prescription, place, extension and credential. Do not erase their context or
copy eight engines. Clinical ports must retain original patient/encounter,
including null, and require clinical ownership/basis checks.

Physical camera/audio/alarm/Doze/provider/power and second-device acceptance,
complete40-patient timing/pressure, restore/KDF phase measurement, nonfatal
native warnings, rich text, permanent clinical correction history/appropriate
trash, fuller shift/follow-up flows and validated clinical tools remain open in
IMPLEMENTATION. Only phone testing is not yet the remaining work.
