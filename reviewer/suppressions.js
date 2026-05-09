function parseRuleList(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function suppressionFinding(file, line, message) {
  return {
    rule_id: 'invalid-suppression',
    category: 'EDS',
    severity: 'notice',
    file,
    line,
    title: 'Invalid EDS quality suppression',
    message,
    recommendation: 'Use eds-quality-disable-next-line <rule-id> reason: <why this is acceptable>.',
  };
}

function parseSuppressionLine(rawLine) {
  const match = rawLine.match(/eds-quality-disable-(next-line|line|file)\s+(.+?)\s*(?:reason:\s*(.+))?$/i);
  if (!match) return null;
  return {
    type: match[1],
    rules: parseRuleList(match[2].replace(/\s*reason:.*$/i, '')),
    reason: match[3]?.trim() ?? '',
  };
}

function parseSuppressions(content, file) {
  const suppressions = {
    lines: new Map(),
    file: [],
  };
  const invalid = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.includes('eds-quality-disable-')) return;
    const lineNumber = index + 1;
    const parsed = parseSuppressionLine(line);
    if (!parsed) {
      invalid.push(suppressionFinding(file, lineNumber, 'Suppression format is not recognized.'));
      return;
    }
    if (parsed.rules.length === 0 || !parsed.reason) {
      invalid.push(suppressionFinding(file, lineNumber, 'Suppressions must include a rule id and a non-empty reason.'));
      return;
    }

    const entry = {
      rules: parsed.rules,
      reason: parsed.reason,
      line: lineNumber,
    };
    if (parsed.type === 'file') {
      suppressions.file.push(entry);
      return;
    }

    const targetLine = parsed.type === 'next-line' ? lineNumber + 1 : lineNumber;
    const entries = suppressions.lines.get(targetLine) ?? [];
    entries.push(entry);
    suppressions.lines.set(targetLine, entries);
  });

  return { suppressions, invalid };
}

function ruleMatches(entry, ruleId) {
  return entry.rules.includes('*') || entry.rules.includes(ruleId);
}

function isFindingSuppressed(finding, suppressions) {
  const fileMatch = suppressions.file.some((entry) => ruleMatches(entry, finding.rule_id));
  if (fileMatch) return true;
  const lineEntries = suppressions.lines.get(finding.line ?? 1) ?? [];
  return lineEntries.some((entry) => ruleMatches(entry, finding.rule_id));
}

export {
  isFindingSuppressed,
  parseSuppressionLine,
  parseSuppressions,
};
