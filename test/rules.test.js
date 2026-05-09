import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeConfig } from '../reviewer/config.js';
import { analyzeFile, classifyFile, selectorIsScoped } from '../reviewer/rules.js';

test('classifyFile identifies EDS block files', () => {
  const info = classifyFile('blocks/hero/hero.js', mergeConfig());

  assert.equal(info.isBlockJs, true);
  assert.equal(info.blockName, 'hero');
  assert.equal(info.isLikelyLcpBlock, true);
});

test('analyzeFile flags lazy images in hero-style block JavaScript', () => {
  const findings = analyzeFile('blocks/hero/hero.js', `
export default function decorate(block) {
  const img = block.querySelector('img');
  img.loading = 'lazy';
}
`, mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'lazy-image-in-block'), true);
  assert.equal(findings.find((finding) => finding.rule_id === 'lazy-image-in-block').severity, 'error');
});

test('analyzeFile flags unscoped block CSS selectors', () => {
  const findings = analyzeFile('blocks/cards/cards.css', `
h2 {
  color: red;
}
.cards h2 {
  color: blue;
}
`, mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'block-css-unscoped-selector'), true);
});

test('analyzeFile allows variant files in block folders', () => {
  const findings = analyzeFile('blocks/cards/cards-utils.js', 'export function readCards() {}', mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'eds-block-file-name'), false);
  assert.equal(findings.some((finding) => finding.rule_id === 'block-js-default-export'), false);
});

test('selectorIsScoped accepts selectors containing the block class', () => {
  assert.equal(selectorIsScoped('.section .cards h2', 'cards'), true);
  assert.equal(selectorIsScoped('h2', 'cards'), false);
});

test('analyzeFile flags protected aem.js edits', () => {
  const findings = analyzeFile('scripts/aem.js', 'export function loadPage() {}', mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'eds-aem-js-modified'), true);
  assert.equal(findings.find((finding) => finding.rule_id === 'eds-aem-js-modified').severity, 'error');
});

test('analyzeFile flags third-party scripts in head.html', () => {
  const findings = analyzeFile('head.html', '<script src="https://example.com/tag.js"></script>', mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'head-third-party-script'), true);
});

test('analyzeFile does not flag third-party keywords outside script tags in head.html', () => {
  const findings = analyzeFile('head.html', '<!-- googletagmanager note -->', mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'head-third-party-script'), false);
});

test('disabled rules are not reported', () => {
  const findings = analyzeFile('head.html', '<script src="https://example.com/tag.js"></script>', mergeConfig({
    rules: {
      disabled: ['head-third-party-script'],
    },
  }));

  assert.equal(findings.some((finding) => finding.rule_id === 'head-third-party-script'), false);
});

test('severity overrides change reported severity', () => {
  const findings = analyzeFile('head.html', '<script src="https://example.com/tag.js"></script>', mergeConfig({
    rules: {
      severities: {
        'head-third-party-script': 'error',
      },
    },
  }));

  assert.equal(findings.find((finding) => finding.rule_id === 'head-third-party-script').severity, 'error');
});

test('analyzeFile skips fetch matches in comments', () => {
  const findings = analyzeFile('blocks/cards/cards.js', `
export default function decorate(block) {
  // fetch('/query-index.json') was removed
}
`, mergeConfig());

  assert.equal(findings.some((finding) => finding.rule_id === 'block-fetch-in-decorator'), false);
});

test('analyzeFile detects top enterprise risk rules', () => {
  const jsFindings = analyzeFile('blocks/hero/hero.js', `
export default function decorate(block) {
  document.write('<div></div>');
  xhr.open('GET', '/data.json', false);
  localStorage.getItem('seen');
  new IntersectionObserver(() => {});
}
`, mergeConfig());
  const cssFindings = analyzeFile('blocks/hero/hero.css', `
@import url('./legacy.css');
.hero .one { color: red !important; }
.hero .two { color: red !important; }
.hero .three { color: red !important; }
.hero .four { color: red !important; }
.hero .five { color: red !important; }
.hero .six { color: red !important; }
`, mergeConfig());

  assert.equal(jsFindings.some((finding) => finding.rule_id === 'document-write'), true);
  assert.equal(jsFindings.some((finding) => finding.rule_id === 'sync-xhr'), true);
  assert.equal(jsFindings.some((finding) => finding.rule_id === 'sync-storage-in-block'), true);
  assert.equal(
    jsFindings.some((finding) => finding.rule_id === 'intersection-observer-no-disconnect'),
    true,
  );
  assert.equal(cssFindings.some((finding) => finding.rule_id === 'css-import'), true);
  assert.equal(cssFindings.some((finding) => finding.rule_id === 'important-density'), true);
});
