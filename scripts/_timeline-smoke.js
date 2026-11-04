// Assert-based self-check for the pure timeline math shared by editor + export.
// Run: node scripts/_timeline-smoke.js <path-to-compiled-timeline.js>
const assert = require('assert');
const path = require('path');
const {
  cursorAt, speedAt, cropAt, cropMap, autoZoomRegions, activeCaption, activeAnnotations, activeRipples, toNormalized,
  cameraAtTime, motionAt, splitRanges, latestClick,
} = require(path.resolve(process.argv[2]));

const display = { width: 1920, height: 1080, x: 0, y: 0 };

// display px -> normalized video space
assert.deepStrictEqual(toNormalized({ timestamp: 0, type: 'click', coordinates: { x: 960, y: 540 }, details: {} }, display), { x: 0.5, y: 0.5 });

// cursor interpolates moves, clicks snap
const events = [
  { timestamp: 0, type: 'move', coordinates: { x: 192, y: 108 }, details: {} },
  { timestamp: 800, type: 'click', coordinates: { x: 1536, y: 864 }, details: { state: 'down' } },
  { timestamp: 1000, type: 'move', coordinates: { x: 960, y: 540 }, details: {} },
];
assert.deepStrictEqual(cursorAt(events, display, 500), { x: 0.1, y: 0.1 });
assert.deepStrictEqual(cursorAt(events, display, 900), { x: 0.8, y: 0.8 });
assert.deepStrictEqual(cursorAt(events, display, 1200), { x: 0.5, y: 0.5 });
assert.deepStrictEqual(latestClick(events, display, 900), { x: 0.8, y: 0.8, age: 100 });
assert.strictEqual(latestClick(events, display, 700), null);
// two consecutive moves interpolate
const moves = [
  { timestamp: 0, type: 'move', coordinates: { x: 192, y: 108 }, details: {} },
  { timestamp: 1000, type: 'move', coordinates: { x: 960, y: 540 }, details: {} },
];
const halfway = cursorAt(moves, display, 500);
assert.ok(Math.abs(halfway.x - 0.3) < 1e-9 && Math.abs(halfway.y - 0.3) < 1e-9, 'moves should interpolate');
assert.strictEqual(activeRipples(events, display, 1000).length, 1); // click at 800, age 200
assert.strictEqual(activeRipples(events, display, 1500).length, 0);

// speed regions
const speed = [{ id: 's', start: 1000, end: 2000, rate: 2 }];
assert.strictEqual(speedAt(speed, 1500), 2);
assert.strictEqual(speedAt(speed, 2500), 1);

// razor splits a range in two, preserving each half's bounds
const razor = splitRanges([{ id: 'z', start: 1000, end: 3000, scale: 2 }], 2000);
assert.strictEqual(razor.length, 2);
assert.deepStrictEqual(razor.map(r => [r.start, r.end]), [[1000, 2000], [2000, 3000]]);
assert.notStrictEqual(razor[0].id, razor[1].id);
assert.strictEqual(razor[0].scale, 2);
// slivers and clicks outside the range are left alone
assert.strictEqual(splitRanges([{ id: 'z', start: 1000, end: 3000 }], 1050).length, 1);
assert.strictEqual(splitRanges([{ id: 'z', start: 1000, end: 3000 }], 500).length, 1);

// zoom regions crop the video texture inside its frame — overlays stay fixed
const centered = [{ id: 'z', start: 1000, end: 3000, scale: 2, centerX: 0.5, centerY: 0.5 }];
const mid = cropAt(centered, 2000);
assert.strictEqual(mid.zoom, 2);
assert.strictEqual(mid.centerX, 0.5);
assert.strictEqual(cropAt(centered, 500).zoom, 1);
// 400ms ease: halfway into the region the zoom is between 1x and 2x
const easing = cropAt(centered, 1200);
assert.ok(easing.zoom > 1 && easing.zoom < 2);

// a center near the edge is clamped so the crop window stays inside the source
const edge = [{ id: 'z', start: 0, end: 4000, scale: 2, centerX: 0.95, centerY: 0.5 }];
const edgeMid = cropAt(edge, 2000);
assert.strictEqual(edgeMid.centerX, 0.75); // 1 - 0.5/2, not 0.95
assert.strictEqual(edgeMid.centerY, 0.5);

// cropMap: the visible window maps to 0..1, so cursor/annotations follow the crop
assert.deepStrictEqual(cropMap({ zoom: 2, centerX: 0.5, centerY: 0.5 }, 0.5, 0.5), { x: 0.5, y: 0.5 });
assert.deepStrictEqual(cropMap({ zoom: 2, centerX: 0.5, centerY: 0.5 }, 0.25, 0.25), { x: 0, y: 0 });
assert.deepStrictEqual(cropMap({ zoom: 2, centerX: 0.5, centerY: 0.5 }, 0.75, 0.75), { x: 1, y: 1 });
assert.deepStrictEqual(cropMap({ zoom: 1, centerX: 0.5, centerY: 0.5 }, 0.3, 0.7), { x: 0.3, y: 0.7 });

// auto-zoom clusters nearby clicks, pads the region, averages the center
const clicks = [
  { timestamp: 2000, type: 'click', coordinates: { x: 960, y: 540 }, details: { state: 'down' } },
  { timestamp: 2800, type: 'click', coordinates: { x: 1152, y: 540 }, details: { state: 'down' } },
  { timestamp: 9000, type: 'click', coordinates: { x: 480, y: 540 }, details: { state: 'down' } },
];
const regions = autoZoomRegions(clicks, display, 10000);
assert.strictEqual(regions.length, 2);
assert.strictEqual(regions[0].start, 1400);
assert.strictEqual(regions[0].end, 3600);
assert.ok(Math.abs(regions[0].centerX - 0.55) < 1e-9);
assert.strictEqual(regions[1].start, 8400);

// captions / annotations are time-windowed
assert.strictEqual(activeCaption([{ id: 'c', start: 100, end: 200, text: 'hi' }], 150).text, 'hi');
assert.strictEqual(activeCaption([{ id: 'c', start: 100, end: 200, text: 'hi' }], 250), null);
assert.strictEqual(activeAnnotations([
  { id: 'a', kind: 'text', start: 0, end: 100, x: 0.5, y: 0.5, text: 'x', color: '#fff', size: 0.1 },
  { id: 'b', kind: 'arrow', start: 200, end: 300, x: 0.5, y: 0.5, color: '#fff', size: 0.1 },
], 50).length, 1);

// camera keyframes: hold at both ends, interpolate the full pose between
const poseA = { position: [0, 0, 5], rotation: [0, 0, 0], scale: [1, 1, 1], zoom: 1 };
const poseB = { position: [4, 2, 5], rotation: [0, 0.5, 0], scale: [1, 1, 1], zoom: 2 };
const kfs = [
  { id: 'k1', time: 1000, camera: poseA, easing: 'linear' },
  { id: 'k2', time: 3000, camera: poseB, easing: 'ease' },
];
assert.deepStrictEqual(cameraAtTime(poseA, [], 500), poseA);
assert.deepStrictEqual(cameraAtTime(poseA, kfs, 500), poseA);   // holds first pose
assert.deepStrictEqual(cameraAtTime(poseA, kfs, 9000), poseB);  // holds last pose
const midCam = cameraAtTime(poseA, kfs, 2000);
assert.strictEqual(midCam.zoom, 1.5);
assert.strictEqual(midCam.position[0], 2);
assert.strictEqual(midCam.rotation[1], 0.25);

// hold easing stays on the left pose until the next keyframe
const holdKfs = [
  { id: 'h1', time: 0, camera: poseA, easing: 'hold' },
  { id: 'h2', time: 1000, camera: poseB, easing: 'ease' },
];
assert.strictEqual(cameraAtTime(poseA, holdKfs, 999).zoom, 1);

// ease is nonlinear: smoothstep(0.25) = 0.15625
const easeKfs = [
  { id: 'e1', time: 0, camera: poseA, easing: 'ease' },
  { id: 'e2', time: 1000, camera: poseB, easing: 'ease' },
];
assert.ok(Math.abs(cameraAtTime(poseA, easeKfs, 250).zoom - 1.15625) < 1e-9);

// motion effects: neutral when inactive, combined state when active
const neutral = motionAt([], 0);
assert.strictEqual(neutral.pulse, 1);
assert.strictEqual(neutral.glitch, false);
assert.strictEqual(neutral.fadeOpacity, 0);
const fx = [
  { id: 'f1', type: 'shake', start: 0, end: 1000, intensity: 1 },
  { id: 'f2', type: 'pulse', start: 0, end: 1000, intensity: 1 },
  { id: 'f3', type: 'glitch', start: 0, end: 1000, intensity: 1 },
  { id: 'f4', type: 'fade-black', start: 0, end: 1000, intensity: 1 },
];
const m = motionAt(fx, 500);
assert.ok(Math.abs(m.shakeX) <= 0.12 && Math.abs(m.shakeY) <= 0.09);
assert.ok(m.pulse > 1 && m.pulse <= 1.15);
assert.strictEqual(m.glitch, true);
assert.strictEqual(m.fadeColor, '#000000');
assert.strictEqual(m.fadeOpacity, 1);
assert.strictEqual(motionAt(fx, 1500).fadeOpacity, 0);
assert.strictEqual(motionAt(fx, 1500).glitch, false);
const fadeWhite = motionAt([{ id: 'w', type: 'fade-white', start: 0, end: 1000, intensity: 0.5 }], 500);
assert.strictEqual(fadeWhite.fadeColor, '#ffffff');
assert.strictEqual(fadeWhite.fadeOpacity, 0.5);

console.log('timeline smoke: all checks passed');
