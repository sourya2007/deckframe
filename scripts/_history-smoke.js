// Assert-based self-check for the pure undo/redo stack.
// Run: node scripts/_history-smoke.js <path-to-compiled-history.js>
const assert = require('assert');
const path = require('path');
const { createHistory, pushHistory, undoHistory, redoHistory } = require(path.resolve(process.argv[2]));

let h = createHistory('a');
h = pushHistory(h, 'b', false);
h = pushHistory(h, 'c', false);
assert.deepStrictEqual(h.past, ['a', 'b']);
assert.strictEqual(h.present, 'c');

let u = undoHistory(h);
assert.strictEqual(u.present, 'b');
u = undoHistory(u);
assert.strictEqual(u.present, 'a');
assert.strictEqual(undoHistory(u).present, 'a'); // no-op at the floor

let r = redoHistory(u);
assert.strictEqual(r.present, 'b');
r = redoHistory(r);
assert.strictEqual(r.present, 'c');
assert.strictEqual(redoHistory(r).present, 'c'); // no-op at the ceiling

// coalesced drags become one undo step
let c = createHistory(0);
c = pushHistory(c, 1, false);
c = pushHistory(c, 2, true);
c = pushHistory(c, 3, true);
assert.deepStrictEqual(c.past, [0]);
assert.strictEqual(c.present, 3);
assert.strictEqual(undoHistory(c).present, 0);

// a new edit clears the redo branch
const branched = pushHistory(undoHistory(c), 9, false);
assert.deepStrictEqual(branched.future, []);
assert.strictEqual(branched.present, 9);

// history is capped
let capped = createHistory(0);
for (let i = 1; i <= 120; i++) capped = pushHistory(capped, i, false, 100);
assert.strictEqual(capped.past.length, 100);
assert.strictEqual(capped.past[0], 20);
assert.strictEqual(capped.present, 120);

console.log('history smoke: all checks passed');
