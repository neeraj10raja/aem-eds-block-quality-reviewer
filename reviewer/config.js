import { existsSync, readFileSync } from 'fs';

const CONFIG_PATH = 'block-quality-reviewer.config.json';

const DEFAULT_CONFIG = {
  max_findings: 30,
  fail_on_severities: [],
  include_full_file_when_patch_missing: false,
  paths: {
    block_root: 'blocks',
    global_scripts: ['scripts/scripts.js'],
    aem_library: 'scripts/aem.js',
    global_styles: ['styles/styles.css'],
    lazy_styles: ['styles/lazy-styles.css'],
    head: 'head.html',
  },
  thresholds: {
    max_file_bytes: 1048576,
    max_block_js_bytes: 12000,
    max_block_css_bytes: 16000,
    max_global_js_bytes: 12000,
    max_global_css_bytes: 20000,
    max_dom_queries_per_file: 14,
    max_important_per_file: 5,
  },
  heuristics: {
    lcp_block_name_pattern: '(hero|banner|teaser|carousel|marquee|promo|splash|intro|feature|spot|homepage|landing|lp-)',
  },
  rules: {
    disabled: [],
    severities: {},
  },
};

function asArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function mergeConfig(parsed = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    paths: {
      ...DEFAULT_CONFIG.paths,
      ...(parsed.paths ?? {}),
      global_scripts: asArray(parsed.paths?.global_scripts, DEFAULT_CONFIG.paths.global_scripts),
      global_styles: asArray(parsed.paths?.global_styles, DEFAULT_CONFIG.paths.global_styles),
      lazy_styles: asArray(parsed.paths?.lazy_styles, DEFAULT_CONFIG.paths.lazy_styles),
    },
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(parsed.thresholds ?? {}),
    },
    heuristics: {
      ...DEFAULT_CONFIG.heuristics,
      ...(parsed.heuristics ?? {}),
    },
    rules: {
      ...DEFAULT_CONFIG.rules,
      ...(parsed.rules ?? {}),
      disabled: asArray(parsed.rules?.disabled, []),
      severities: {
        ...DEFAULT_CONFIG.rules.severities,
        ...(parsed.rules?.severities ?? {}),
      },
    },
    fail_on_severities: asArray(parsed.fail_on_severities, DEFAULT_CONFIG.fail_on_severities),
  };
}

function loadConfig(filePath = CONFIG_PATH) {
  const resolvedPath = process.env.BLOCK_QUALITY_CONFIG_PATH || filePath;
  if (!existsSync(resolvedPath)) return mergeConfig();
  const parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  return mergeConfig(parsed);
}

export {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfig,
};
