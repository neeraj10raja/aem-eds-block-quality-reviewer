import assert from 'node:assert/strict';
import test from 'node:test';

import { hasChangedLine, parsePatchChangedLines } from '../reviewer/diff-utils.js';

test('parsePatchChangedLines returns added line numbers from unified diff', () => {
  const changed = parsePatchChangedLines(`@@ -1,4 +1,5 @@
 line one
+added line
 line two
-removed line
+replacement line`);

  assert.deepEqual([...changed], [2, 4]);
  assert.equal(hasChangedLine(changed, 2), true);
  assert.equal(hasChangedLine(changed, 3), false);
});

test('parsePatchChangedLines returns empty set when patch is unavailable', () => {
  assert.equal(parsePatchChangedLines(undefined).size, 0);
});
