import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DEFAULT_CONFIG, loadConfig, mergeConfig } from '../reviewer/config.js';

test('mergeConfig preserves defaults and accepts overrides', () => {
  const config = mergeConfig({
    max_findings: 5,
    paths: {
      block_root: 'src/blocks',
    },
    thresholds: {
      max_block_js_bytes: 5000,
    },
  });

  assert.equal(config.max_findings, 5);
  assert.equal(config.paths.block_root, 'src/blocks');
  assert.deepEqual(config.paths.global_scripts, DEFAULT_CONFIG.paths.global_scripts);
  assert.equal(config.thresholds.max_block_js_bytes, 5000);
  assert.equal(
    config.thresholds.max_block_css_bytes,
    DEFAULT_CONFIG.thresholds.max_block_css_bytes,
  );
});

test('loadConfig reads BLOCK_QUALITY_CONFIG_PATH when provided by the action', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eds-block-reviewer-config-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({ max_findings: 7 }));
  process.env.BLOCK_QUALITY_CONFIG_PATH = file;

  try {
    assert.equal(loadConfig().max_findings, 7);
  } finally {
    delete process.env.BLOCK_QUALITY_CONFIG_PATH;
  }
});
