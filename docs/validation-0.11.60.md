# Validation: handled settings and optional-lock actions (0.11.60)

Application candidate: 0.11.60 / Android code76, following frozen .59 source
b8820f9 on codex/permission-state-recovery (draft PR11). No dependency,
schema, route, permission, clinical rule or archive/key scheme changes.

## Problem and implementation

SettingsScreen passed an async callback to the existing optional lock toggle
without catching rejected native authentication, setting or audit work. The
LockGate automatic/manual unlock callback could also reject without handling.
An old Settings callback could start a preference write after dataset restore.

Settings actions now retain the original dataset intent and admission across
native awaits. A lock action is admitted once and its control is temporarily
disabled. Cancellation remains quiet; native failures use existing feedback and
permit retry. Delayed errors log through the existing redacted on-phone logger
when the owning screen has unmounted or lost focus. A stale dataset gets short,
accurate reopen guidance. Image/grace preferences use the same intent check.

Typed settings now expose the existing read error/retry. LockGate shows the
existing retry notice after initial/refresh read failure, withholding stale
settings and native prompts instead of leaving a blank cover. The optional
LockGate retains its cover after native failure and permits explicit retry. Its native awaits cannot launch a prompt or publish
UI after unmount. No additional lock, vault, account or security flow was added.

## Software evidence

- .59 baseline is verified at 179 suites/2,699 tests and five workflow checks;
  its exact source CI and actual native Settings/alarm evidence remain in .59.
- Two original private probes reproduce rejected enable/disable callbacks.
- The actual original LockGate fails four of seven focused witnesses before
  the patch: enrollment/authentication failure and both unmount cases. Three
  existing cancel/single-prompt/no-enrollment cases already pass.
- After the patch, 29 focused tests in three suites pass (7.214s). Tests use native
  stand-ins but actual dataset admission/replacement and original-intent hooks.
  They cover synchronous binding throws, rejection, retries, cancellation, rapid
  taps, focus loss, unmount, replacement
  during native work and refusal of stale lock/grace/image callbacks.
- An earlier .60 source check passed 181 suites/2,723 tests and five workflow
  checks (232.822s). Subsequent review reproduced two blank/stale lock-read
  witnesses, then added read retry and three setting-acknowledgment tests.
- Final `npm run check` passes 182 suites/2,728 app tests and five workflow
  checks (236.423s), with typecheck, lint and formatting green and no lint warnings.
- Normal push, exact-source hosted CI and frozen artifacts remain pending until
  their actual results are recorded. Software tests do not prove native behavior.

## Native/artifact evidence

Pending a newly frozen .60 build and installed-byte inspection. .59 Settings
return is not .60 native acceptance. Device authentication, physical camera,
audio, alarm delivery, reboot/Doze and provider writes remain separate gates.

## Boundaries and next work

This is reliability work on an existing optional setting, not a security audit
or physical authentication acceptance. Native rejection injection is software
coverage, not a reproduced phone crash. Rich text, notebook trash, complete
follow-up loop and measured 40-patient shift acceptance remain in IMPLEMENTATION.
No claim that only a phone test remains or that the whole product is complete.
