import { appendFileSync, existsSync, readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { loadConfig } from './config.js';
import { getPullFiles, upsertStickyComment } from './github-api.js';
import { renderReport, COMMENT_MARKER } from './report.js';
import { hasFailingFindings, reviewChangedFiles } from './review.js';

function loadEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return {};
  return JSON.parse(readFileSync(eventPath, 'utf8'));
}

function buildContext() {
  const event = loadEventPayload();
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const [ownerFromRepo, repoFromRepo] = repository.split('/');
  const owner = process.env.REPO_OWNER || ownerFromRepo;
  const repo = process.env.REPO_NAME || repoFromRepo;
  const pullNumber = Number(process.env.PR_NUMBER || event.pull_request?.number);
  const token = process.env.GITHUB_TOKEN;
  const dryRun = process.env.DRY_RUN === 'true';
  const changedFilesJson = process.env.CHANGED_FILES_JSON;

  if (!owner || !repo) throw new Error('Repository context is missing. Set GITHUB_REPOSITORY or REPO_OWNER/REPO_NAME.');
  if (!pullNumber) throw new Error('Pull request number is missing. Run on pull_request or set PR_NUMBER.');
  if (!token && !changedFilesJson) throw new Error('GITHUB_TOKEN is required unless CHANGED_FILES_JSON is provided.');

  return {
    owner,
    repo,
    pullNumber,
    token,
    dryRun,
    changedFilesJson,
  };
}

function loadChangedFilesFromEnv(value) {
  if (!value) return null;
  if (existsSync(value)) return JSON.parse(readFileSync(value, 'utf8'));
  return JSON.parse(value);
}

function writeStepSummary(body) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    console.log(body);
    return false;
  }
  appendFileSync(summaryPath, `${body}\n`);
  return true;
}

async function publishReport(context, body, findingsCount, commenter = upsertStickyComment) {
  if (context.dryRun || !context.token) {
    console.log(body);
    return 'stdout';
  }

  try {
    await commenter(
      context.owner,
      context.repo,
      context.pullNumber,
      COMMENT_MARKER,
      body,
      context.token,
    );
    console.log(`[block-quality-reviewer] Posted review comment with ${findingsCount} finding(s).`);
    return 'comment';
  } catch (err) {
    console.warn(`[block-quality-reviewer] Could not post PR comment: ${err.message}`);
    writeStepSummary(body);
    return 'summary';
  }
}

async function main() {
  const config = loadConfig();
  const context = buildContext();
  const envFiles = loadChangedFilesFromEnv(context.changedFilesJson);
  let files = envFiles;
  if (!files) {
    files = await getPullFiles(context.owner, context.repo, context.pullNumber, context.token);
  }
  const findings = reviewChangedFiles(files, config, process.cwd());
  const body = renderReport(findings, { truncated: findings.length >= config.max_findings });

  await publishReport(context, body, findings.length);

  if (hasFailingFindings(findings, config)) {
    throw new Error('Block quality reviewer found failing findings.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[block-quality-reviewer] Fatal: ${err.message}`);
    process.exit(1);
  });
}

export {
  buildContext,
  loadChangedFilesFromEnv,
  main,
  publishReport,
  writeStepSummary,
};
