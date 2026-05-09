import { basename, extname } from 'path';
import { escapeRegExp, pathMatches } from './path-utils.js';

const IMAGE_OR_VIDEO_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpg',
  '.jpeg',
  '.mp4',
  '.png',
  '.webm',
  '.webp',
]);

const FRAMEWORK_PATTERN = /(?:from\s+['"]|import\s*\(\s*['"]|require\(\s*['"])(react|react-dom|vue|@angular\/core|jquery|lodash)['"]/;
const THIRD_PARTY_HEAD_PATTERN = /<script[^>]+(?:src=["']https?:\/\/|.*?(?:googletagmanager|google-analytics|launch-|alloy\.min\.js|web-sdk))/i;
const DOM_QUERY_PATTERN = /\b(?:document|block|el|element)\.(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)\(/g;
const LAYOUT_READ_PATTERN = /\b(?:getBoundingClientRect|offsetWidth|offsetHeight|clientWidth|clientHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft)\b/;
const STYLE_WRITE_PATTERN = /\.(?:style|classList)\b|setAttribute\(\s*['"]class|insertAdjacentHTML\(|append\(|prepend\(/;
const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*|\*|<!--)/;

function isDisabled(config, ruleId) {
  return new Set(config.rules?.disabled ?? []).has(ruleId);
}

function addFinding(findings, config, finding) {
  if (isDisabled(config, finding.rule_id)) return;
  const severity = config.rules?.severities?.[finding.rule_id] ?? finding.severity ?? 'warning';
  findings.push({
    category: 'EDS',
    line: 1,
    ...finding,
    severity,
  });
}

function lines(content) {
  return content.split(/\r?\n/);
}

function lcpBlockPattern(config) {
  try {
    return new RegExp(config.heuristics?.lcp_block_name_pattern, 'i');
  } catch {
    return /hero|banner|teaser|carousel|marquee|promo/i;
  }
}

function classifyFile(file, config) {
  const blockRoot = config.paths.block_root.replace(/\/$/, '');
  const blockRegex = new RegExp(`^${escapeRegExp(blockRoot)}/([^/]+)/(.+)$`);
  const blockMatch = file.match(blockRegex);
  const extension = extname(file).toLowerCase();
  const fileName = basename(file);
  const isBlock = Boolean(blockMatch);
  const blockName = blockMatch?.[1] ?? null;

  return {
    file,
    extension,
    fileName,
    isJs: extension === '.js',
    isCss: extension === '.css',
    isHtml: extension === '.html',
    isBinaryAsset: IMAGE_OR_VIDEO_EXTENSIONS.has(extension),
    isBlock,
    blockName,
    isBlockJs: isBlock && extension === '.js',
    isBlockCss: isBlock && extension === '.css',
    isMainBlockJs: isBlock && extension === '.js' && fileName === `${blockName}.js`,
    isMainBlockCss: isBlock && extension === '.css' && fileName === `${blockName}.css`,
    isLikelyLcpBlock: Boolean(blockName && lcpBlockPattern(config).test(blockName)),
    isAemLibrary: file === config.paths.aem_library,
    isHead: file === config.paths.head,
    isGlobalScript: pathMatches(file, config.paths.global_scripts),
    isGlobalStyle: pathMatches(file, config.paths.global_styles),
    isLazyStyle: pathMatches(file, config.paths.lazy_styles),
  };
}

function analyzeFileNaming(info, findings, config) {
  if (!info.isBlock || (!info.isJs && !info.isCss)) return;
  const allowedPrefix = `${info.blockName}`;
  if (!info.fileName.startsWith(allowedPrefix)) {
    addFinding(findings, config, {
      rule_id: 'eds-block-file-name',
      category: 'EDS',
      severity: 'warning',
      file: info.file,
      title: 'Block file name does not match the block folder',
      message: `EDS block assets should start with the block name. Expected a \`${info.blockName}*.${info.extension.slice(1)}\` file in \`${info.blockName}\`.`,
      recommendation: `Rename this file to start with \`${info.blockName}\`, or confirm the block is loaded intentionally by custom code.`,
      file_level: true,
    });
  }
}

function analyzeProtectedFiles(info, findings, config) {
  if (!info.isAemLibrary) return;
  addFinding(findings, config, {
    rule_id: 'eds-aem-js-modified',
    category: 'EDS',
    severity: 'error',
    file: info.file,
    title: 'Avoid project-specific edits to scripts/aem.js',
    message: 'Adobe recommends keeping project-specific extensions outside the shared AEM library.',
    recommendation: 'Move custom behavior to scripts/scripts.js, delayed.js, or a block-specific module.',
    file_level: true,
  });
}

function analyzeHeadHtml(info, content, findings, config) {
  if (!info.isHead) return;
  lines(content).forEach((line, index) => {
    const lineNumber = index + 1;
    if (/<style[\s>]/i.test(line)) {
      addFinding(findings, config, {
        rule_id: 'head-inline-style',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Inline style in head can add critical-path work',
        message: 'The EDS head should stay minimal so rendering can start quickly.',
        recommendation: 'Move styling into styles.css or lazy-styles.css depending on whether it is needed before LCP.',
        evidence: line.trim(),
      });
    }
    if (THIRD_PARTY_HEAD_PATTERN.test(line)) {
      addFinding(findings, config, {
        rule_id: 'head-third-party-script',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Third-party script in head can block early rendering',
        message: 'Marketing and analytics scripts in head are usually on the LCP critical path.',
        recommendation: 'Load third-party code from delayed.js, or only from the block that needs it.',
        evidence: line.trim(),
      });
    }
  });
}

function analyzeFileSize(info, content, findings, config) {
  const size = Buffer.byteLength(content, 'utf8');
  const thresholds = config.thresholds ?? {};
  let limit = null;
  if (info.isBlockJs) {
    limit = thresholds.max_block_js_bytes;
  } else if (info.isBlockCss) {
    limit = thresholds.max_block_css_bytes;
  } else if (info.isGlobalScript) {
    limit = thresholds.max_global_js_bytes;
  } else if (info.isGlobalStyle) {
    limit = thresholds.max_global_css_bytes;
  }

  if (!limit || size <= limit) return;

  addFinding(findings, config, {
    rule_id: 'file-size-budget',
    category: info.isJs ? 'INP' : 'LCP',
    severity: 'warning',
    file: info.file,
    title: 'Changed file is larger than the configured reviewer budget',
    message: `This file is ${size} bytes. The configured budget is ${limit} bytes.`,
    recommendation: 'Split non-critical behavior into delayed.js or load it only when the block enters the viewport.',
    file_level: true,
  });
}

function analyzeBlockJsShape(info, content, findings, config) {
  if (!info.isMainBlockJs) return;
  if (!/export\s+default\b/.test(content)) {
    addFinding(findings, config, {
      rule_id: 'block-js-default-export',
      category: 'EDS',
      severity: 'warning',
      file: info.file,
      title: 'Block JavaScript is missing a default export',
      message: 'EDS block JavaScript is loaded as an ES module and should export the block decorator as the default export.',
      recommendation: `Use \`export default function decorate(block) { ... }\` in ${info.fileName}.`,
      file_level: true,
    });
  }
}

function analyzeJsPatterns(info, content, findings, config) {
  if (!info.isJs && !info.isHtml) return;
  const allLines = lines(content);
  let domQueryCount = 0;
  const hasObserverDisconnect = /\.disconnect\(\)/.test(content);

  allLines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (COMMENT_LINE_PATTERN.test(trimmed)) return;
    domQueryCount += [...line.matchAll(DOM_QUERY_PATTERN)].length;

    const frameworkMatch = line.match(FRAMEWORK_PATTERN);
    if (frameworkMatch) {
      addFinding(findings, config, {
        rule_id: 'framework-import',
        category: 'INP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Framework/library import can add unnecessary client-side work',
        message: `This imports \`${frameworkMatch[1]}\`. EDS guidance favors small, browser-native JavaScript for most blocks.`,
        recommendation: 'Use native browser APIs unless this block is genuinely application-like and the team has approved the dependency.',
        evidence: line.trim(),
      });
    }

    if (/\bfetch\(/.test(line) && info.isBlockJs) {
      addFinding(findings, config, {
        rule_id: 'block-fetch-in-decorator',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Network request inside block decoration may delay visible content',
        message: 'If this block appears above the fold, fetching during decoration can delay when content becomes useful.',
        recommendation: 'Prefer authored content in the document, placeholders, preloaded data, or defer non-critical fetching until after initial rendering.',
        evidence: line.trim(),
      });
    }

    if (/createElement\(\s*['"`](img|source|picture)['"`]\s*\)|new\s+Image\s*\(/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'dynamic-image-created',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Image is created dynamically in JavaScript',
        message: info.isLikelyLcpBlock
          ? 'This looks like an above-the-fold block. Dynamically created images are harder for the browser to discover early.'
          : 'Dynamically created images can delay discovery and priority, especially when the block is above the fold.',
        recommendation: 'Keep likely LCP images in authored markup when possible, or add preload/fetchpriority guidance for true hero images.',
        evidence: line.trim(),
      });
    }

    if (/loading\s*=\s*['"`]lazy['"`]|setAttribute\(\s*['"`]loading['"`]\s*,\s*['"`]lazy['"`]\s*\)/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'lazy-image-in-block',
        category: 'LCP',
        severity: info.isLikelyLcpBlock ? 'error' : 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Lazy-loaded image may hurt LCP',
        message: info.isLikelyLcpBlock
          ? 'Never lazy-load the likely LCP image in a hero/banner-style block.'
          : 'Lazy loading is fine below the fold, but risky if this block is used near the top of a page.',
        recommendation: 'Only lazy-load images that are safely below the fold. For hero images, use eager loading and consider fetchpriority="high".',
        evidence: line.trim(),
      });
    }

    if (/addEventListener\(\s*['"`](scroll|resize|mousemove|pointermove|touchmove|wheel)['"`]/.test(line)
      && !/passive\s*:\s*true|debounce|throttle|requestAnimationFrame/.test(allLines.slice(index, index + 10).join('\n'))) {
      addFinding(findings, config, {
        rule_id: 'hot-event-listener',
        category: 'INP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'High-frequency event listener may block interactions',
        message: 'Scroll, resize, pointer, and wheel handlers can run very often and increase interaction latency.',
        recommendation: 'Use passive listeners where possible and throttle/debounce or defer non-visual work.',
        evidence: line.trim(),
      });
    }

    if (/\b(?:alert|confirm|prompt)\s*\(/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'blocking-dialog',
        category: 'INP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Blocking browser dialog can interrupt interactions',
        message: 'Synchronous dialogs block the main thread and create a poor interaction experience.',
        recommendation: 'Use non-blocking UI controlled by the block instead.',
        evidence: line.trim(),
      });
    }

    if (/\bdocument\.write\s*\(/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'document-write',
        category: 'INP',
        severity: 'error',
        file: info.file,
        line: lineNumber,
        title: 'document.write blocks rendering and parsing',
        message: 'document.write is synchronous and can block page rendering.',
        recommendation: 'Use normal DOM APIs or async script loading instead.',
        evidence: trimmed,
      });
    }

    if (/\.open\(\s*['"`](GET|POST|PUT|DELETE)['"`]\s*,[^,\n]+,\s*false\s*\)/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'sync-xhr',
        category: 'INP',
        severity: 'error',
        file: info.file,
        line: lineNumber,
        title: 'Synchronous XHR blocks the main thread',
        message: 'Synchronous XMLHttpRequest can freeze rendering and interactions.',
        recommendation: 'Use fetch() or async XMLHttpRequest instead.',
        evidence: trimmed,
      });
    }

    if (/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\s*\(/.test(line) && info.isBlockJs) {
      addFinding(findings, config, {
        rule_id: 'sync-storage-in-block',
        category: 'INP',
        severity: info.isLikelyLcpBlock ? 'warning' : 'notice',
        file: info.file,
        line: lineNumber,
        title: 'Synchronous storage access inside block code',
        message: 'localStorage and sessionStorage are synchronous and can add main-thread work during block decoration.',
        recommendation: 'Read storage after initial rendering or cache the value outside the critical path.',
        evidence: trimmed,
      });
    }

    if (/new\s+IntersectionObserver\s*\(/.test(line) && !hasObserverDisconnect) {
      addFinding(findings, config, {
        rule_id: 'intersection-observer-no-disconnect',
        category: 'INP',
        severity: 'notice',
        file: info.file,
        line: lineNumber,
        title: 'IntersectionObserver is not disconnected',
        message: 'Long-lived observers in blocks can retain DOM references after they are no longer needed.',
        recommendation: 'Call observer.disconnect() once the observed work is complete.',
        evidence: trimmed,
      });
    }

    if (info.isGlobalScript && /\bloadScript\(/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'global-loadscript',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Global script loading may put third-party code on every page',
        message: 'Global script loading can affect LCP and INP even on pages that do not need the dependency.',
        recommendation: 'Move non-critical dependencies to delayed.js or the specific block that needs them.',
        evidence: line.trim(),
      });
    }

    if (/insertAdjacentHTML\(\s*['"`]afterbegin['"`]|\.prepend\(/.test(line)) {
      addFinding(findings, config, {
        rule_id: 'prepend-content',
        category: 'CLS',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Prepending content can shift existing layout',
        message: 'Inserting content before existing content after render can cause layout shift.',
        recommendation: 'Reserve space up front or render the content in the initial block structure.',
        evidence: line.trim(),
      });
    }

    if (LAYOUT_READ_PATTERN.test(line)) {
      const previous = allLines.slice(Math.max(0, index - 4), index + 1).join('\n');
      if (STYLE_WRITE_PATTERN.test(previous)) {
        addFinding(findings, config, {
          rule_id: 'layout-thrashing-risk',
          category: 'INP',
          severity: 'warning',
          file: info.file,
          line: lineNumber,
          title: 'Possible layout thrashing',
          message: 'Reading layout immediately after DOM/style writes can force synchronous layout work.',
          recommendation: 'Batch DOM writes and reads separately, or defer measurement to requestAnimationFrame.',
          evidence: line.trim(),
        });
      }
    }
  });

  const domQueryLimit = config.thresholds?.max_dom_queries_per_file ?? 14;
  if (domQueryCount > domQueryLimit) {
    addFinding(findings, config, {
      rule_id: 'many-dom-queries',
      category: 'INP',
      severity: 'notice',
      file: info.file,
      title: 'Many DOM queries in one changed file',
      message: `This file contains ${domQueryCount} DOM queries. Large DOM work can increase rendering and interaction cost.`,
      recommendation: 'Cache repeated selectors, scope queries to the block, and avoid querying more DOM than needed.',
      file_level: true,
    });
  }
}

function selectorIsScoped(selector, blockName) {
  if (!selector) return true;
  if (selector.startsWith('@')) return true;
  if (/^(from|to|\d+%)/.test(selector)) return true;
  return selector.includes(`.${blockName}`);
}

function analyzeBlockCssScope(info, content, findings, config) {
  if (!info.isBlockCss) return;

  lines(content).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed.includes('{') || trimmed.startsWith('@')) return;
    const selectorText = trimmed.slice(0, trimmed.indexOf('{')).trim();
    const selectors = selectorText.split(',').map((selector) => selector.trim());
    const unscoped = selectors.find((selector) => !selectorIsScoped(selector, info.blockName));
    if (unscoped) {
      addFinding(findings, config, {
        rule_id: 'block-css-unscoped-selector',
        category: 'EDS',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Block CSS selector is not scoped to the block',
        message: `The selector \`${unscoped}\` does not include \`.${info.blockName}\`.`,
        recommendation: 'Scope block CSS to the block class so styles do not leak into other authored content.',
        evidence: trimmed,
      });
    }
  });
}

function analyzeCssPatterns(info, content, findings, config) {
  if (!info.isCss) return;
  const allLines = lines(content);
  let importantCount = 0;

  allLines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (/^@import\b/i.test(trimmed)) {
      addFinding(findings, config, {
        rule_id: 'css-import',
        category: 'LCP',
        severity: 'error',
        file: info.file,
        line: lineNumber,
        title: 'CSS @import can delay render-critical styles',
        message: '@import creates an extra dependency chain for CSS discovery.',
        recommendation: 'Bundle or inline the import into the normal stylesheet instead.',
        evidence: trimmed,
      });
    }

    if (/!important\b/.test(trimmed)) importantCount += 1;

    if (/background(?:-image)?\s*:\s*[^;]*url\(/i.test(trimmed) && info.isLikelyLcpBlock) {
      addFinding(findings, config, {
        rule_id: 'hero-css-background-image',
        category: 'LCP',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Hero-style block uses a CSS background image',
        message: 'CSS background images are harder for the browser to discover early as LCP resources.',
        recommendation: 'Prefer authored img/picture markup for likely LCP images, or explicitly preload the image.',
        evidence: trimmed,
      });
    }

    if (/transition\s*:\s*all\b|transition[^;]*(height|width|top|left|right|bottom|margin|padding)/i.test(trimmed)) {
      addFinding(findings, config, {
        rule_id: 'layout-transition',
        category: 'CLS',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: 'Transitioning layout properties can cause visual instability',
        message: 'Animating layout properties can trigger layout and paint work, and may contribute to CLS or interaction delay.',
        recommendation: 'Animate transform and opacity where possible, and reserve layout space before animation starts.',
        evidence: trimmed,
      });
    }

    if (/^\s*(top|left|right|bottom|width|height|margin|padding)\s*:/.test(trimmed)) {
      const previousWindow = allLines.slice(Math.max(0, index - 8), index + 1).join('\n');
      if (/@keyframes/.test(previousWindow)) {
        addFinding(findings, config, {
          rule_id: 'keyframes-layout-property',
          category: 'CLS',
          severity: 'warning',
          file: info.file,
          line: lineNumber,
          title: 'Keyframes animate layout properties',
          message: 'Animating layout properties can force layout work and visual shifts.',
          recommendation: 'Use transform or opacity animations instead.',
          evidence: trimmed,
        });
      }
    }
  });

  const fontFaceBlocks = content.matchAll(/@font-face\s*{[^}]*}/gis);
  for (const block of fontFaceBlocks) {
    if (!/font-display\s*:/i.test(block[0])) {
      const lineNumber = content.slice(0, block.index).split(/\r?\n/).length;
      addFinding(findings, config, {
        rule_id: 'font-face-no-display',
        category: 'CLS',
        severity: 'warning',
        file: info.file,
        line: lineNumber,
        title: '@font-face is missing font-display',
        message: 'Web fonts without font-display can delay text rendering or cause visible shifts when fonts swap.',
        recommendation: 'Add font-display: swap or optional, based on brand and UX requirements.',
        evidence: '@font-face',
      });
    }
  }

  const importantLimit = config.thresholds?.max_important_per_file ?? 5;
  if (importantCount > importantLimit) {
    addFinding(findings, config, {
      rule_id: 'important-density',
      category: 'EDS',
      severity: 'notice',
      file: info.file,
      title: 'High !important density in CSS',
      message: `This file contains ${importantCount} !important declarations. That often points to leaking or overly broad CSS.`,
      recommendation: 'Prefer scoped selectors and remove !important declarations where possible.',
      file_level: true,
    });
  }
}

function analyzeBinaryAssets(info, findings, config) {
  if (!info.isBinaryAsset || /^(icons|fonts)\//.test(info.file)) return;
  addFinding(findings, config, {
    rule_id: 'binary-asset-in-code-repo',
    category: 'EDS',
    severity: 'notice',
    file: info.file,
    title: 'Binary asset committed to the code repo',
    message: 'EDS guidance generally favors authored content and managed assets over committing page content binaries to GitHub.',
    recommendation: 'Confirm this asset is truly code-owned. Otherwise move content images/video into the authoring or asset workflow.',
    file_level: true,
  });
}

function analyzeFile(file, content, config) {
  const info = classifyFile(file, config);
  const findings = [];

  analyzeProtectedFiles(info, findings, config);
  analyzeFileNaming(info, findings, config);
  analyzeBlockJsShape(info, content, findings, config);
  analyzeFileSize(info, content, findings, config);
  analyzeHeadHtml(info, content, findings, config);
  analyzeJsPatterns(info, content, findings, config);
  analyzeBlockCssScope(info, content, findings, config);
  analyzeCssPatterns(info, content, findings, config);
  analyzeBinaryAssets(info, findings, config);

  return findings;
}

export {
  analyzeFile,
  classifyFile,
  selectorIsScoped,
};
