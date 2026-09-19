#!/usr/bin/env node
/**
 * `npm run brief` — the state of this repository in one screen.
 *
 * The first thing any session runs, human or AI: what the project is at right
 * now, who changed what last, and what the previous session left open. It only
 * reads; it never changes anything.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const heading = (text) => `\n\x1b[1m${text}\x1b[0m`;

/* -------------------------------------------------------------- the project */

const pkg = JSON.parse(read('package.json'));
console.log(heading('MedOS'), `v${pkg.version} — personal offline-first clinical record (Android)`);
console.log('Rules: AGENTS.md   Decisions: docs/architecture.md   Handoff: docs/HANDOFF.md');

/* ------------------------------------------------------------ where git is */

const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '(no commits yet)';
const dirty = git('status', '--porcelain').split('\n').filter(Boolean);
const ahead = git('rev-list', '--count', '@{upstream}..HEAD');
const behind = git('rev-list', '--count', 'HEAD..@{upstream}');

console.log(heading('Repository'));
console.log(`branch ${branch}${ahead ? `, ${ahead} ahead` : ''}${behind ? `, ${behind} behind` : ''}`);
console.log(
  dirty.length ? `${dirty.length} uncommitted file(s):\n  ${dirty.slice(0, 10).join('\n  ')}` : 'working tree clean',
);

/* ------------------------------------------------------------- who did what */

const log = git(
  'log',
  '-8',
  '--date=short',
  '--pretty=%h%x09%ad%x09%s%x09%(trailers:key=Agent,valueonly,separator=%x2C)',
);
if (log) {
  console.log(heading('Recent work'));
  for (const line of log.split('\n')) {
    const [hash, date, subject, agent] = line.split('\t');
    console.log(`${date}  ${hash}  ${subject}${agent ? `   [${agent}]` : ''}`);
  }
}

/* ------------------------------------------------- what the last session left */

try {
  const handoff = read('docs/HANDOFF.md');
  const entry = handoff.slice(handoff.indexOf('\n## ', handoff.indexOf('---')));
  const open = /\*\*Open threads\*\*[^\n]*\n([\s\S]*?)(\n\*\*|\n## |$)/.exec(entry);
  const title = /## (.+)/.exec(entry);
  console.log(heading('Last handoff'), title ? title[1] : '');
  if (open) console.log(open[1].trim());
} catch {
  console.log(heading('Last handoff'), 'docs/HANDOFF.md not found');
}

/* ------------------------------------------------------------------ what next */

console.log(heading('Before and after any change'));
console.log('npm run check          typecheck + lint + formatting + tests');
console.log('npm run apk            signed release APK (needs private/, takes minutes)');
console.log('Finish by adding a docs/HANDOFF.md entry and an "Agent:" commit trailer.\n');
