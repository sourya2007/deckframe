// Assert-based self-check for the cursor motion math shared by editor + export.
// Run: node scripts/_cursor-smoke.js <path-to-compiled-cursor.js>
const assert = require('assert');
const path = require('path');
const {
  DEFAULT_CURSOR_SETTINGS, createSpringState, stepSpring, cursorSpringConfig,
  swaySpringConfig, swayTargetRotation, clickVisualState, clickBounceScale,
} = require(path.resolve(process.argv[2]));

// spring converges from rest to its target
const spring = createSpringState(0);
const config = cursorSpringConfig(DEFAULT_CURSOR_SETTINGS.smoothing);
for (let i = 0; i < 240; i++) stepSpring(spring, 1, 1000 / 60, config);
assert.ok(Math.abs(spring.value - 1) < 0.01, `spring should settle, got ${spring.value}`);

// smoothing 0 snaps immediately
const snap = createSpringState(0);
stepSpring(snap, 1, 1000 / 60, cursorSpringConfig(0));
assert.ok(Math.abs(snap.value - 1) < 0.01, `zero smoothing should snap, got ${snap.value}`);

// bounce starts instantly; the visual effect starts halfway through the bounce
assert.deepStrictEqual(clickVisualState(0, 350, 600), { bounceProgress: 1, effectProgress: 0 });
assert.strictEqual(clickVisualState(175, 350, 600).effectProgress, 1);
assert.ok(Math.abs(clickVisualState(475, 350, 600).effectProgress - 0.5) < 1e-9);
assert.strictEqual(clickVisualState(1000, 350, 600).bounceProgress, 0);
assert.ok(Math.abs(clickBounceScale(0.5, 2) - 0.84) < 1e-9);

// sway is directional, bounded, and off at rest
assert.strictEqual(swayTargetRotation(0, 0, 16.67, 0.4), 0);
const sway = swayTargetRotation(20, 0, 16.67, 0.4);
assert.ok(sway > 0 && sway <= Math.PI / 6, `sway should be bounded, got ${sway}`);
assert.ok(swaySpringConfig(0.67).damping > 0);

console.log('cursor smoke: all checks passed');
