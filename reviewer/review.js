import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { hasChangedLine, parsePatchChangedLines } from './diff-utils.js';
import { compareFindings, dedupeFindings } from './finding.js';
import { isSafeRepoPath } from './path-utils.js';
import { analyzeFile } from './rules.js';
import { isFindingSuppressed, parseSuppressions } from './suppressions.js';

const ANALYZED_EXTENSIONS = new Set([
  '.avif',
  '.css',
  '.gif',
  '.html',
  '.jpeg',
  '.jpg',
  '.js',
  '.mp4',
  '.png',
  '.svg',
  '.webm',
  '.webp',
]);

const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.mp4',
  '.png',
  '.webm',
  '.webp',
]);

function extensionOf(file) {
  const match = file.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}

function shouldAnalyzeFile(file) {
  return ANALYZED_EXTENSIONS.has(extensionOf(file));
}

function isBinaryFile(file) {
  return BINARY_EXTENSIONS.has(extensionOf(file));
}

function isFindingRelevantToPatch(finding, changedLines, file, config) {
  if (file.status === 'added') return true;
  if (finding.file_level) return true;
  if (changedLines.size === 0) return Boolean(config.include_full_file_when_patch_missing);
  return hasChangedLine(changedLines, finding.line);
}

function diffMissingFinding(file, config) {
  if (file.status === 'added' || file.patch) return null;
  if (config.include_full_file_when_patch_missing) return null;
  return {
    rule_id: 'diff-not-available',
    category: 'EDS',
    severity: 'notice',
    file: file.filename,
    line: 1,
    title: 'GitHub did not provide a patch for this file',
    message: 'The reviewer limited line-level findings to changed lines, but GitHub omitted this file patch.',
    recommendation: 'Review this file manually, or set include_full_file_when_patch_missing=true if your team accepts full-file review noise.',
    file_level: true,
  };
}

function fileTooLargeFinding(file, size, limit) {
  return {
    rule_id: 'file-too-large',
    category: 'EDS',
    severity: 'notice',
    file: file.filename,
    line: 1,
    title: 'Changed file is too large for static review',
    message: `This file is ${size} bytes. The configured safety limit is ${limit} bytes.`,
    recommendation: 'Review this file manually or raise thresholds.max_file_bytes if this is expected.',
    file_level: true,
  };
}

function readFileForReview(cwd, filename, config) {
  const filePath = join(cwd, filename);
  if (!existsSync(filePath)) {
    return { content: '', skipped: null };
  }
  const { size } = statSync(filePath);
  const limit = config.thresholds?.max_file_bytes ?? 1048576;
  if (size > limit) {
    return {
      content: '',
      skipped: fileTooLargeFinding({ filename }, size, limit),
    };
  }
  if (isBinaryFile(filename)) {
    return { content: '', skipped: null };
  }
  return {
    content: readFileSync(filePath, 'utf8'),
    skipped: null,
  };
}

function reviewChangedFiles(files, config, cwd = process.cwd()) {
  const findings = [];

  for (const file of files) {
    if (!isSafeRepoPath(file.filename)) {
      findings.push({
        rule_id: 'unsafe-path',
        category: 'EDS',
        severity: 'error',
        file: file.filename,
        line: 1,
        title: 'Unsafe changed file path',
        message: 'The PR contains a file path that is not safe to read from the checkout.',
        recommendation: 'Remove absolute paths, traversal, or invalid file names from the PR.',
        file_level: true,
      });
    } else if (file.status !== 'removed' && shouldAnalyzeFile(file.filename)) {
      const { content, skipped } = readFileForReview(cwd, file.filename, config);
      if (skipped) {
        findings.push(skipped);
      } else {
        const { suppressions, invalid } = parseSuppressions(content, file.filename);
        const changedLines = parsePatchChangedLines(file.patch);
        const fileFindings = analyzeFile(file.filename, content, config)
          .filter((finding) => !isFindingSuppressed(finding, suppressions))
          .filter((finding) => isFindingRelevantToPatch(finding, changedLines, file, config));

        findings.push(...invalid, ...fileFindings);
        const missingPatch = diffMissingFinding(file, config);
        if (missingPatch) findings.push(missingPatch);
      }
    }
  }

  return dedupeFindings(findings).sort(compareFindings).slice(0, config.max_findings);
}

function hasFailingFindings(findings, config) {
  const failOn = new Set(config.fail_on_severities ?? []);
  return findings.some((finding) => failOn.has(finding.severity));
}

export {
  reviewChangedFiles,
  hasFailingFindings,
  shouldAnalyzeFile,
};
