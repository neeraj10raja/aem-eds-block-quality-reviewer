function parsePatchChangedLines(patch) {
  const changed = new Set();
  if (!patch) return changed;

  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      changed.add(newLine);
      newLine += 1;
    } else if (!line.startsWith('-')) {
      newLine += 1;
    }
  }

  return changed;
}

function hasChangedLine(changedLines, line) {
  if (!changedLines || changedLines.size === 0) return false;
  return changedLines.has(line);
}

export {
  hasChangedLine,
  parsePatchChangedLines,
};
