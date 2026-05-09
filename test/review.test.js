import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { mergeConfig } from '../reviewer/config.js';
import { hasFailingFindings, reviewChangedFiles } from '../reviewer/review.js';

function createRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'eds-block-reviewer-'));
  Object.entries(files).forEach(([file, content]) => {
    mkdirSync(join(root, file.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(root, file), content);
  });
  return root;
}

test('reviewChangedFiles only reports line-level findings on changed lines', () => {
  const root = createRepo({
    'blocks/hero/hero.js': `export default function decorate(block) {
  const img = document.createElement('img');
  img.loading = 'lazy';
}
`,
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'modified',
    patch: `@@ -1,4 +1,4 @@
 export default function decorate(block) {
+  const img = document.createElement('img');
   img.loading = 'lazy';
 }`,
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'dynamic-image-created'), true);
  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), false);
});

test('reviewChangedFiles reports all findings for added files', () => {
  const root = createRepo({
    'blocks/hero/hero.js': `function decorate(block) {
  const img = document.createElement('img');
  img.loading = 'lazy';
}
`,
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'added',
    patch: null,
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'block-js-default-export'), true);
  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), true);
});

test('reviewChangedFiles reports missing patch notice instead of noisy full-file line findings', () => {
  const root = createRepo({
    'blocks/hero/hero.js': `export default function decorate(block) {
  img.loading = 'lazy';
}
`,
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'modified',
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'diff-not-available'), true);
  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), false);
});

test('reviewChangedFiles suppresses findings with an inline reason', () => {
  const root = createRepo({
    'blocks/hero/hero.js': `export default function decorate(block) {
  const img = block.querySelector('img');
  // eds-quality-disable-next-line lazy-image-in-block reason: A/B test renders this below the fold
  img.loading = 'lazy';
}
`,
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'modified',
    patch: `@@ -1,5 +1,5 @@
 export default function decorate(block) {
   const img = block.querySelector('img');
+  // eds-quality-disable-next-line lazy-image-in-block reason: A/B test renders this below the fold
+  img.loading = 'lazy';
 }`,
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), false);
});

test('reviewChangedFiles reports invalid suppressions without a reason', () => {
  const root = createRepo({
    'blocks/hero/hero.js': `export default function decorate(block) {
  // eds-quality-disable-next-line lazy-image-in-block
  img.loading = 'lazy';
}
`,
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'modified',
    patch: `@@ -1,4 +1,4 @@
 export default function decorate(block) {
+  // eds-quality-disable-next-line lazy-image-in-block
+  img.loading = 'lazy';
 }`,
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'invalid-suppression'), true);
  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), true);
});

test('reviewChangedFiles skips files over the configured max size', () => {
  const root = createRepo({
    'blocks/hero/hero.js': 'x'.repeat(100),
  });

  const findings = reviewChangedFiles([{
    filename: 'blocks/hero/hero.js',
    status: 'modified',
    patch: '@@ -1,1 +1,1 @@\n+x',
  }], mergeConfig({
    thresholds: {
      max_file_bytes: 10,
    },
  }), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'file-too-large'), true);
});

test('reviewChangedFiles does not read binary assets as utf8', () => {
  const root = createRepo({
    'media/hero.png': 'not really a png',
  });

  const findings = reviewChangedFiles([{
    filename: 'media/hero.png',
    status: 'added',
  }], mergeConfig(), root);

  assert.equal(findings.some((finding) => finding.rule_id === 'binary-asset-in-code-repo'), true);
});

test('hasFailingFindings follows configured fail severities', () => {
  const config = mergeConfig({ fail_on_severities: ['error'] });
  assert.equal(hasFailingFindings([{ severity: 'warning' }], config), false);
  assert.equal(hasFailingFindings([{ severity: 'error' }], config), true);
});
