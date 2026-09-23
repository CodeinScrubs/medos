/** Read only the newest entry; never borrow unfinished work from older sessions. */
function latestHandoff(text) {
  const headings = [...text.matchAll(/^## (.+)\r?$/gm)];
  const first = headings[0];
  if (!first) return null;
  const entry = text.slice(first.index, headings[1]?.index ?? text.length);
  const open = /^\*\*Open threads\*\*[^\n]*\n([\s\S]*?)(?=^\*\*|^## |$(?![\s\S]))/m.exec(entry);
  return { title: first[1].trim(), openThreads: open?.[1].trim() ?? null };
}

module.exports = { latestHandoff };
