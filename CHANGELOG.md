# Changelog

All notable changes to this project will be documented in this file.

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
