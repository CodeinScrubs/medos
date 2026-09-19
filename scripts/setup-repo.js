#!/usr/bin/env node
/**
 * Local repository setup, run automatically after `npm install` (the `prepare`
 * script) and by `npm run setup`.
 *
 * - git hooks from .githooks/ — `pre-push` runs `npm run check`, so a broken
 *   branch cannot reach GitHub even if someone forgets.
 * - .gitmessage as the commit template, which carries the `Agent:` trailer.
 *
 * Both are per-clone git settings that cannot be committed, which is why they
 * are set here. Nothing else is touched, and failures are not fatal: a fresh
 * CI checkout has no use for either.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function git(...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

try {
  git('rev-parse', '--is-inside-work-tree');
} catch {
  process.exit(0); // not a git checkout (a tarball, a container layer): nothing to do
}

try {
  git('config', 'core.hooksPath', '.githooks');
  git('config', 'commit.template', '.gitmessage');
  console.log('[MedOS] git hooks and commit template configured.');
} catch {
  console.warn('[MedOS] could not configure git hooks; run `npm run setup` when git is available.');
}
