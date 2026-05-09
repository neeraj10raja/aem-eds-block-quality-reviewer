#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    target: null,
    agentDir: 'block-quality-reviewer',
    patchEslint: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') {
      index += 1;
      args.target = argv[index];
    } else if (arg === '--agent-dir') {
      index += 1;
      args.agentDir = argv[index];
    } else if (arg === '--patch-eslint') {
      args.patchEslint = true;
    } else if (!args.target) {
      args.target = arg;
    }
  }

  return args;
}

function ensureInsideGitRepo(target) {
  if (!existsSync(join(target, '.git'))) {
    throw new Error(`Target does not look like a git repository: ${target}`);
  }
}

function rewriteWorkflow(workflow, agentDir) {
  return workflow.replaceAll('BLOCK_QUALITY_REVIEWER_DIR', agentDir);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patchEsLintConfig(target, agentDir) {
  const candidates = ['.eslintrc.js', '.eslintrc.cjs'];
  const found = candidates.find((file) => existsSync(join(target, file)));
  if (!found) return 'missing';

  const eslintPath = join(target, found);
  const content = readFileSync(eslintPath, 'utf8');
  const agentPattern = `${agentDir}/**/*.js`;
  const agentPatternRegex = new RegExp(`['"\`]${escapeRegExp(agentPattern)}['"\`]`);
  if (agentPatternRegex.test(content)) return 'already-configured';

  const patched = content.replace(
    /files:\s*\[([^\]]*['"`]tools\/\*\*\/\*\.js['"`][^\]]*)\]/s,
    (match, files) => `files: [${files.trim()}, '${agentPattern}']`,
  );
  if (patched === content) return 'unsupported';

  writeFileSync(eslintPath, patched);
  return 'patched';
}

function patchHlxIgnore(target, agentDir) {
  const ignorePath = join(target, '.hlxignore');
  const entries = [`/${agentDir}`, '/block-quality-reviewer.config.json'];
  const existing = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = entries.filter((entry) => !lines.has(entry));
  if (missing.length === 0) return 'already-configured';

  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  writeFileSync(ignorePath, `${existing}${prefix}${missing.join('\n')}\n`);
  return existsSync(ignorePath) && existing ? 'patched' : 'created';
}

function install(args) {
  if (!args.target) {
    throw new Error('Usage: node scripts/install.js --target /path/to/eds-repo [--agent-dir block-quality-reviewer] [--patch-eslint]');
  }

  const target = resolve(args.target);
  ensureInsideGitRepo(target);

  const agentTarget = join(target, args.agentDir);
  mkdirSync(agentTarget, { recursive: true });
  cpSync(join(repoRoot, 'reviewer'), agentTarget, { recursive: true });

  const workflowDir = join(target, '.github/workflows');
  mkdirSync(workflowDir, { recursive: true });
  const workflow = readFileSync(join(repoRoot, 'scripts/templates/block-quality-reviewer.yml'), 'utf8');
  writeFileSync(
    join(workflowDir, 'block-quality-reviewer.yml'),
    rewriteWorkflow(workflow, args.agentDir),
  );

  const configPath = join(target, 'block-quality-reviewer.config.json');
  if (!existsSync(configPath)) {
    cpSync(join(repoRoot, 'block-quality-reviewer.config.example.json'), configPath);
  }

  const eslintStatus = args.patchEslint ? patchEsLintConfig(target, args.agentDir) : 'skipped';
  const hlxIgnoreStatus = patchHlxIgnore(target, args.agentDir);

  console.log(`Installed EDS Block Quality Reviewer into ${target}`);
  if (eslintStatus === 'patched') console.log('Patched .eslintrc to include reviewer Node.js files.');
  else if (eslintStatus === 'already-configured') console.log('.eslintrc already includes reviewer Node.js files.');
  else if (eslintStatus === 'unsupported') console.log('Could not auto-patch .eslintrc; add a Node.js override for the reviewer directory if your build lints all JS.');
  else console.log('Skipped .eslintrc patch. Use --patch-eslint if this repo lints copied tooling files.');
  if (hlxIgnoreStatus === 'created') console.log('Created .hlxignore so reviewer files are not served by EDS.');
  else if (hlxIgnoreStatus === 'patched') console.log('Patched .hlxignore so reviewer files are not served by EDS.');
  else console.log('.hlxignore already excludes reviewer files.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Commit block-quality-reviewer/, block-quality-reviewer.config.json, and .github/workflows/block-quality-reviewer.yml.');
  console.log('2. Open a pull request that changes a block, script, style, or head.html.');
  console.log('3. The reviewer will post a sticky PR comment.');
  console.log('');
  console.log('Safe default: this reviewer comments only. It does not block PRs unless fail_on_severities is configured.');
}

try {
  install(parseArgs(process.argv.slice(2)));
} catch (err) {
  console.error(`[install] ${err.message}`);
  process.exit(1);
}
