import assert from 'node:assert/strict';
import test from 'node:test';

import { isSafeRepoPath, pathMatches } from '../reviewer/path-utils.js';

test('isSafeRepoPath accepts normal repo-relative paths', () => {
  assert.equal(isSafeRepoPath('blocks/hero/hero.js'), true);
  assert.equal(isSafeRepoPath('blocks//hero/hero.js'), true);
});

test('isSafeRepoPath rejects traversal and absolute paths', () => {
  assert.equal(isSafeRepoPath('../secret.js'), false);
  assert.equal(isSafeRepoPath('/tmp/secret.js'), false);
});

test('pathMatches supports simple star and double-star globs', () => {
  assert.equal(pathMatches('blocks/hero/hero.js', 'blocks/**/*.js'), true);
  assert.equal(pathMatches('styles/styles.css', ['scripts/*.js', 'styles/*.css']), true);
});
