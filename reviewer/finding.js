const SEVERITY_RANK = {
  error: 0,
  warning: 1,
  notice: 2,
};

function compareFindings(a, b) {
  const severity = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
  if (severity !== 0) return severity;
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return (a.line ?? 0) - (b.line ?? 0);
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = [
      finding.rule_id,
      finding.file,
      finding.line ?? 0,
      finding.evidence ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export {
  compareFindings,
  dedupeFindings,
};
