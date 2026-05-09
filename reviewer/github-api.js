const API_BASE = 'https://api.github.com';
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ghFetch(path, token, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    parse = 'json',
    ...fetchOptions
  } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(fetchOptions.headers ?? {}),
        },
      });

      if (res.ok) {
        if (res.status === 204 || parse === 'none') return null;
        if (parse === 'text') return res.text();
        return res.json();
      }

      const text = await res.text();
      lastError = new Error(`GitHub API ${res.status}: ${text}`);
      if (!RETRY_STATUSES.has(res.status) || attempt === retries) throw lastError;
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw lastError;
    }

    await sleep(1000 * 2 ** attempt);
  }

  throw lastError;
}

async function paginate(path, token) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await ghFetch(`${path}${separator}per_page=100&page=${page}`, token);
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

async function getPullFiles(owner, repo, pullNumber, token) {
  return paginate(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, token);
}

async function listIssueComments(owner, repo, issueNumber, token) {
  return paginate(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token);
}

async function createIssueComment(owner, repo, issueNumber, body, token) {
  return ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function updateIssueComment(owner, repo, commentId, body, token) {
  return ghFetch(`/repos/${owner}/${repo}/issues/comments/${commentId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

async function upsertStickyComment(owner, repo, issueNumber, marker, body, token) {
  const comments = await listIssueComments(owner, repo, issueNumber, token);
  const existing = comments.find((comment) => comment.body?.includes(marker));
  if (existing) {
    return updateIssueComment(owner, repo, existing.id, body, token);
  }
  return createIssueComment(owner, repo, issueNumber, body, token);
}

export {
  createIssueComment,
  getPullFiles,
  ghFetch,
  listIssueComments,
  paginate,
  updateIssueComment,
  upsertStickyComment,
};
