import { normalize, sep } from 'path';

function toPosixPath(filePath) {
  return filePath.split(sep).join('/');
}

function isSafeRepoPath(filePath) {
  if (typeof filePath !== 'string') return false;
  if (!filePath || filePath.startsWith('/') || filePath.includes('\0')) return false;
  const normalized = toPosixPath(normalize(filePath));
  return !normalized.startsWith('../') && normalized !== '..';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = pattern.replaceAll('\\', '/');
  let regex = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      regex += '.*';
      index += 1;
    } else if (char === '*') {
      regex += '[^/]*';
    } else {
      regex += escapeRegExp(char);
    }
  }
  return new RegExp(`^${regex}$`);
}

function pathMatches(filePath, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((pattern) => globToRegExp(pattern).test(filePath));
}

export {
  escapeRegExp,
  globToRegExp,
  isSafeRepoPath,
  pathMatches,
  toPosixPath,
};
