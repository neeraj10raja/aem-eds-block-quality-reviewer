# Rule Catalog

This catalog documents the stable rule IDs used by `aem-eds-block-quality-reviewer`.

Severities:

- `error`: high-confidence risk that teams may choose to block.
- `warning`: important review signal.
- `notice`: lower-risk guidance or governance visibility.

## LCP

| Rule | Default | Meaning |
|---|---:|---|
| `lazy-image-in-block` | warning/error | Flags lazy-loaded images in blocks, with error severity for likely above-the-fold block names. |
| `dynamic-image-created` | warning | Flags `img`, `source`, `picture`, or `new Image()` creation in JavaScript. |
| `block-fetch-in-decorator` | warning | Flags `fetch()` inside block JavaScript because it can delay useful content. |
| `head-third-party-script` | warning | Flags third-party scripts in `head.html`. |
| `head-inline-style` | warning | Flags inline styles in `head.html`. |
| `global-loadscript` | warning | Flags global `loadScript()` usage in configured global scripts. |
| `hero-css-background-image` | warning | Flags CSS background images in likely LCP blocks. |
| `css-import` | error | Flags CSS `@import`, which can delay stylesheet discovery. |
| `file-size-budget` | warning | Flags changed files over configured JS/CSS budgets. |

## INP

| Rule | Default | Meaning |
|---|---:|---|
| `framework-import` | warning | Flags imports of large frameworks/libraries in EDS code. |
| `hot-event-listener` | warning | Flags high-frequency event listeners without nearby passive/throttle/debounce/rAF signals. |
| `blocking-dialog` | warning | Flags `alert`, `confirm`, and `prompt`. |
| `layout-thrashing-risk` | warning | Flags layout reads near DOM/style writes. |
| `many-dom-queries` | notice | Flags files with many DOM queries. |
| `document-write` | error | Flags `document.write()`. |
| `sync-xhr` | error | Flags synchronous XHR calls. |
| `sync-storage-in-block` | notice/warning | Flags synchronous local/session storage access inside block JavaScript. |
| `intersection-observer-no-disconnect` | notice | Flags observers without a `disconnect()` call in the file. |

## CLS

| Rule | Default | Meaning |
|---|---:|---|
| `prepend-content` | warning | Flags content inserted before existing rendered content. |
| `layout-transition` | warning | Flags transitions of layout-affecting properties. |
| `keyframes-layout-property` | warning | Flags keyframes that animate layout properties. |
| `font-face-no-display` | warning | Flags `@font-face` blocks without `font-display`. |

## EDS

| Rule | Default | Meaning |
|---|---:|---|
| `eds-aem-js-modified` | error | Flags project-specific edits to `scripts/aem.js`. |
| `eds-block-file-name` | warning | Flags block assets that do not start with the block folder name. |
| `block-js-default-export` | warning | Flags main block JS files without a default export. |
| `block-css-unscoped-selector` | warning | Flags block CSS selectors that are not scoped to the block class. |
| `binary-asset-in-code-repo` | notice | Flags page-content image/video assets committed to the code repo. |
| `important-density` | notice | Flags CSS files with many `!important` declarations. |
| `diff-not-available` | notice | Flags files where GitHub omitted patch data. |
| `file-too-large` | notice | Flags files skipped by the configured safety size cap. |
| `unsafe-path` | error | Flags unsafe repo paths in the PR file list. |
| `invalid-suppression` | notice | Flags suppression comments without a rule ID or reason. |

## Suppression Format

```js
// eds-quality-disable-next-line <rule-id> reason: <why this is acceptable>
```

Supported forms:

- `eds-quality-disable-next-line`
- `eds-quality-disable-line`
- `eds-quality-disable-file`

Use `*` as the rule ID only when a senior reviewer has accepted the whole file.
