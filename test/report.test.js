import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMENT_MARKER, renderReport, renderSummary } from '../reviewer/report.js';

const finding = {
  rule_id: 'lazy-image-in-block',
  category: 'LCP',
  severity: 'error',
  file: 'blocks/hero/hero.js',
  line: 4,
  title: 'Lazy-loaded image may hurt LCP',
  message: 'Never lazy-load the likely LCP image.',
  recommendation: 'Use eager loading for the hero image.',
  evidence: 'img.loading = "lazy";',
};

test('renderSummary counts severities and categories', () => {
  assert.match(renderSummary([finding]), /Errors: 1/);
  assert.match(renderSummary([finding]), /LCP: 1/);
});

test('renderReport includes sticky marker and finding details', () => {
  const report = renderReport([finding]);

  assert.match(report, new RegExp(COMMENT_MARKER));
  assert.match(report, /EDS Block Quality Review/);
  assert.match(report, /Lazy-loaded image may hurt LCP/);
  assert.match(report, /blocks\/hero\/hero\.js:4/);
});

test('renderReport has a clean no-findings state', () => {
  const report = renderReport([]);

  assert.match(report, /No new EDS block quality concerns/);
});
