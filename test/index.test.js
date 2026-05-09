import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadChangedFilesFromEnv,
  publishReport,
  writeStepSummary,
} from '../reviewer/index.js';

test('loadChangedFilesFromEnv reads changed files from a JSON file path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eds-block-reviewer-index-'));
  const file = join(dir, 'files.json');
  writeFileSync(file, JSON.stringify([{ filename: 'blocks/hero/hero.js' }]));

  assert.deepEqual(loadChangedFilesFromEnv(file), [{
    filename: 'blocks/hero/hero.js',
  }]);
});

test('writeStepSummary appends report body to GITHUB_STEP_SUMMARY', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eds-block-reviewer-summary-'));
  const file = join(dir, 'summary.md');
  process.env.GITHUB_STEP_SUMMARY = file;

  try {
    assert.equal(writeStepSummary('hello summary'), true);
    assert.equal(readFileSync(file, 'utf8'), 'hello summary\n');
  } finally {
    delete process.env.GITHUB_STEP_SUMMARY;
  }
});

test('publishReport falls back to step summary when PR comment creation fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eds-block-reviewer-comment-'));
  const file = join(dir, 'summary.md');
  process.env.GITHUB_STEP_SUMMARY = file;

  try {
    const result = await publishReport({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
      token: 'token',
      dryRun: false,
    }, 'review body', 2, async () => {
      throw new Error('GitHub API 403');
    });

    assert.equal(result, 'summary');
    assert.equal(readFileSync(file, 'utf8'), 'review body\n');
  } finally {
    delete process.env.GITHUB_STEP_SUMMARY;
  }
});
