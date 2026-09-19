<!--
Keep this short. It exists so a reviewer can judge the change in a couple of
minutes without reading every line, and so the next session knows what happened.
-->

## What and why

<!-- One or two sentences. What was wrong or missing, and what this does about it. -->

## Clinical impact

<!-- What a physician sees or does differently. "None — internal refactor" is a fine answer. -->

## Database

- [ ] No schema change
- [ ] Schema changed — migration generated with `npm run db:generate` and committed
- [ ] Only additive (new tables / nullable or SQL-defaulted columns); no existing migration edited
- [ ] Restoring an older backup still works (columns old and new schemas share)

## Look here first

<!-- The two or three files that carry the actual decision. -->

1.
2.

## Verified

- [ ] `npm run check` green (typecheck, lint, formatting, tests)
- [ ] Tests added or updated for the behaviour that changed
- [ ] Tried on a real phone — or say plainly that it was not

<!-- Anything you could not verify, and anything the next session should pick up,
     goes in docs/HANDOFF.md as well. -->

## Agent

<!-- e.g. claude-opus-5 via Claude Code / gpt-5 via Cursor / a human -->
