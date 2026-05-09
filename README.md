# aem-eds-block-quality-reviewer

> GitHub PR reviewer for Adobe AEM Edge Delivery Services block quality, Core Web Vitals risk, and EDS best practices.

![Node 22](https://img.shields.io/badge/node-%3E%3D22-blue)
![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey)

This project is a GitHub Action for EDS repositories. On every pull request, it
reviews changed block, script, style, and `head.html` files and posts one sticky
PR comment.

It is a **static reviewer**, not a Lighthouse/RUM replacement. It does not claim
that a PR will definitely fail Core Web Vitals. It flags code patterns that are
known risk signals for LCP, INP, CLS, or EDS maintainability.

## What It Reviews

- LCP risk: lazy hero images, CSS background images in hero-style blocks,
  dynamic image creation, fetches during block decoration, and heavy critical
  scripts/styles.
- INP risk: large scripts, framework imports, hot event listeners, blocking
  dialogs, possible layout thrashing, and global dependency loading.
- CLS risk: prepending dynamic content, layout-property transitions, keyframe
  layout animations, and web fonts without `font-display`.
- EDS quality: edits to `scripts/aem.js`, wrong block file names, missing block
  default exports, unscoped block CSS, and binary content assets in the code
  repo.

## Why This Matters

EDS gets its speed from small, efficient project code, simple authoring
structures, and block-level CSS/JS. Many regressions enter through normal PRs:
a hero image moved into JavaScript, a marketing script added to `head.html`, a
global CSS selector leaking from one block, or a scroll handler that does too
much work.

This reviewer catches those risks before they are merged.

## Install Into An EDS Repo

Recommended path: use the published action from your EDS repo.

```yaml
name: EDS Block Quality

on:
  pull_request:
    paths:
      - 'blocks/**'
      - 'scripts/**'
      - 'styles/**'
      - 'head.html'
      - 'block-quality-reviewer.config.json'

permissions:
  contents: read
  pull-requests: read
  issues: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          persist-credentials: false

      - uses: neeraj10raja/aem-eds-block-quality-reviewer@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For platform teams that prefer reusable workflows:

```yaml
name: EDS Block Quality

on:
  pull_request:
    paths: ['blocks/**', 'scripts/**', 'styles/**', 'head.html']

permissions:
  contents: read
  pull-requests: read
  issues: write

jobs:
  review:
    uses: neeraj10raja/aem-eds-block-quality-reviewer/.github/workflows/review.yml@v1
```

The built-in `GITHUB_TOKEN` is used automatically. No personal GitHub token,
PSI key, or external service is needed.

### Air-Gapped Install

If your enterprise does not allow third-party GitHub Actions, copy the reviewer
into the EDS repo:

```bash
git clone https://github.com/neeraj10raja/aem-eds-block-quality-reviewer
cd aem-eds-block-quality-reviewer
node scripts/install.js --target /path/to/your-eds-repo
```

This installs:

```text
block-quality-reviewer/
block-quality-reviewer.config.json
.github/workflows/block-quality-reviewer.yml
.hlxignore entries for reviewer files
```

Then commit those files in the target repo. If your repo lints all JavaScript
with no Node.js override, either add an override manually or rerun the installer
with `--patch-eslint`.

The installed workflow checks out two copies:

- trusted reviewer code from the base branch
- pull request content from the PR branch

That keeps the reviewer from executing modified automation code from the PR
being reviewed. If GitHub does not allow PR comments, such as some fork or
restricted-permission setups, the reviewer writes the same report to the GitHub
Actions step summary instead of failing only because it could not comment.

## Configuration

```json
{
  "max_findings": 30,
  "fail_on_severities": [],
  "include_full_file_when_patch_missing": false,
  "paths": {
    "block_root": "blocks",
    "global_scripts": ["scripts/scripts.js"],
    "aem_library": "scripts/aem.js",
    "global_styles": ["styles/styles.css"],
    "lazy_styles": ["styles/lazy-styles.css"],
    "head": "head.html"
  },
  "thresholds": {
    "max_file_bytes": 1048576,
    "max_block_js_bytes": 12000,
    "max_block_css_bytes": 16000,
    "max_global_js_bytes": 12000,
    "max_global_css_bytes": 20000,
    "max_dom_queries_per_file": 14,
    "max_important_per_file": 5
  },
  "heuristics": {
    "lcp_block_name_pattern": "(hero|banner|teaser|carousel|marquee|promo|splash|intro|feature|spot|homepage|landing|lp-)"
  },
  "rules": {
    "disabled": [],
    "severities": {}
  }
}
```

| Field | Meaning | Default |
|---|---|---|
| `max_findings` | Maximum findings posted in one PR comment | `30` |
| `fail_on_severities` | Optional severities that should fail the workflow | `[]` |
| `include_full_file_when_patch_missing` | Review whole file when GitHub omits patch data | `false` |
| `paths.block_root` | Root folder for EDS blocks | `blocks` |
| `paths.aem_library` | Shared AEM loader library path | `scripts/aem.js` |
| `heuristics.lcp_block_name_pattern` | Regex for block names likely to appear above the fold | See config |
| `thresholds.*` | Reviewer budgets for changed files | See config |
| `rules.disabled` | Rule IDs to suppress with governance approval | `[]` |
| `rules.severities` | Per-rule severity overrides | `{}` |

Safe default: the reviewer comments only. To make it block PRs for errors:

```json
{
  "fail_on_severities": ["error"],
  "rules": {
    "severities": {
      "block-fetch-in-decorator": "error"
    }
  }
}
```

## Suppressions

Use suppressions sparingly, and always include a reason. Suppressions without a
reason are reported as `invalid-suppression`.

```js
// eds-quality-disable-next-line lazy-image-in-block reason: This image is rendered below the fold by template rules.
img.loading = 'lazy';
```

File-level suppression is also supported:

```js
// eds-quality-disable-file framework-import reason: This block is an approved app island.
```

See [RULES.md](RULES.md) for the rule catalog.

## Local Development

```bash
npm install
npm test
npm run lint
```

Dry-run with a local changed-files fixture:

```bash
GITHUB_REPOSITORY=owner/repo PR_NUMBER=1 DRY_RUN=true \
CHANGED_FILES_JSON=test/fixtures/pull-files.json \
node reviewer/index.js
```

## Rule Basis

The rules are intentionally conservative and tied to public guidance:

- Adobe EDS project anatomy says `head.html` should stay close to boilerplate,
  third-party scripts in `head.html` are discouraged, and `scripts.js`,
  `styles.css`, and `aem.js` are loaded before display.
- Adobe EDS block docs say block CSS/JS live under `blocks`, block file names
  match block names, block JS exports a default function, and block CSS should
  be scoped to the block.
- Web.dev LCP guidance warns that LCP resources should be discovered early, and
  that dynamically added images, CSS background images, and lazy-loaded LCP
  images delay discovery.
- Web.dev INP guidance focuses on script evaluation, long tasks, and keeping
  event callbacks small.
- Web.dev CLS guidance recommends reserving space for late content, avoiding
  dynamic insertion without space, avoiding `top`/`left` layout animations, and
  using `font-display` for web fonts.

Sources:

- [Adobe EDS Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
- [Adobe EDS Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)
- [Web.dev Optimize LCP](https://web.dev/articles/optimize-lcp)
- [Web.dev Optimize INP](https://web.dev/articles/optimize-inp)
- [Web.dev Optimize CLS](https://web.dev/articles/optimize-cls)

## What It Will Not Do

- It will not measure real CWV. Use RUM, PSI, Lighthouse, or your existing
  observability stack for measurement.
- It will not rewrite code.
- It will not auto-approve or block PRs unless you configure
  `fail_on_severities`.
- It will not report old debt unless the risky line is changed, or the finding
  is file-level.

## Project Structure

```text
reviewer/
├── index.js       # GitHub Action orchestrator
├── rules.js       # EDS/CWV static rules
├── review.js      # Changed-file filtering
├── report.js      # Sticky PR comment markdown
├── github-api.js  # GitHub REST client
├── config.js      # Config loading
└── diff-utils.js  # Patch line parsing
```

## License

Apache 2.0. See [LICENSE](LICENSE).
