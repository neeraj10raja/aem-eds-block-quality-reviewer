# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-05-10

### Added — 11 new rules targeting common junior-dev mistakes

LCP:

- `head-inline-script` — flags inline `<script>` blocks in `head.html`, not just third-party loaders.
- `top-level-await-script` — flags top-level `await` in configured global scripts. Top-level await halts the eager phase and directly delays LCP.

INP:

- `mutation-observer-no-disconnect` — companion to the existing IntersectionObserver rule.
- `setinterval-no-clearinterval` — file-level check that pairs `setInterval` with a `clearInterval`.

CLS:

- `image-without-dimensions` — flags dynamically created `<img>`/`<source>`/`<picture>` without explicit width and height set in the next 10 lines. The single biggest CLS contributor on EDS sites.

EDS (correctness, hygiene, security):

- `inner-html-overwrite` — flags `.innerHTML`/`.outerHTML` assignments that wipe authored content (does not fire for `+=` append patterns).
- `console-statement` — flags `console.log`/`warn`/`error`/`debug`/`info`/`trace`/`table` left in project JS.
- `debugger-statement` — flags `debugger` statements left in code.
- `unsafe-eval` — flags `eval()` and `new Function()`. Severity: error.
- `unsafe-window-open` — flags `window.open(..., '_blank')` without `noopener` in the features arg (reverse-tabnabbing vector).
- `css-universal-selector` — flags unscoped universal `*` selectors at the top level of block CSS.

All new rules support inline suppressions and per-rule severity overrides via the existing config infrastructure.

## [0.2.1] - 2026-05-10

### Fixed

- Documented permissions changed from `issues: write` to `pull-requests: write` in the README install yaml, the reusable workflow, and the air-gapped template. Posting a comment on a pull request requires `pull-requests: write`; the previous `issues: write` declaration caused HTTP 403 "Resource not accessible by integration" when the action tried to post the sticky review comment. The reviewer code itself did not change.
- README install yaml bumped from `actions/checkout@v5` to `actions/checkout@v6` for consistency with the action's own `actions/setup-node@v6`.

## [0.2.0] - 2026-05-09

### Added

- Composite GitHub Action entrypoint via `action.yml`.
- Reusable workflow entrypoint via `.github/workflows/review.yml`.
- Inline suppression comments with required reasons.
- Per-rule severity overrides.
- File-size safety cap before static analysis.
- Expanded enterprise rules: CSS `@import`, `document.write`, sync XHR, sync storage in block code, observer cleanup, and high `!important` density.
- Rule catalog in `RULES.md`.

### Changed

- Recommended install path is now `uses: neeraj10raja/aem-eds-block-quality-reviewer@v1`.
- Air-gapped installer no longer patches ESLint unless `--patch-eslint` is passed.
- Block variant files such as `cards-utils.js` are allowed.
- Hot-event listener detection checks nearby lines for throttle/debounce/passive/rAF signals.

## [0.1.0] - 2026-05-09

### Added

- Initial EDS block quality reviewer.
- Sticky PR comments.
- Patch-line scoped findings.
- Step-summary fallback when PR comments cannot be posted.
- Air-gapped installer.
