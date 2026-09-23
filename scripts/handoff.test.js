const assert = require('node:assert/strict');
const { test } = require('node:test');
const { latestHandoff } = require('./handoff');

test('missing current open threads never falls through to historical work', () => {
  const text = '# Log\n> ## Template\n---\n## New\n**Still open**\n- Current\n\n## Old\n**Open threads**\n- Obsolete';
  assert.deepEqual(latestHandoff(text), { title: 'New', openThreads: null });
});

test('reads only the current section and tolerates Windows line endings', () => {
  const text =
    '## New\r\n**Changed**\r\n- Fixed\r\n**Open threads** (next)\r\n\r\n- First\r\n- Second\r\n\r\n**Gotchas**\r\n- Different\r\n## Old\r\n**Open threads**\r\n- Obsolete';
  assert.deepEqual(latestHandoff(text), { title: 'New', openThreads: '- First\r\n- Second' });
});

test('accepts a final open section with no following heading', () => {
  assert.deepEqual(latestHandoff('## New\n**Open threads**\n- Current'), { title: 'New', openThreads: '- Current' });
  assert.equal(latestHandoff('# Empty log\n> ## Template'), null);
});
