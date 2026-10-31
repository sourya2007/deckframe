const assert = require('assert');
const { applyAiToolCalls } = require(process.argv[2]);

const base = {
  videoUrl: 'file:///x.webm', videoPath: null, micPath: null, webcamPath: null,
  events: [{ timestamp: 500, type: 'click', coordinates: { x: 960, y: 540 }, details: { state: 'down' } }],
  displaySize: { width: 1920, height: 1080 },
  soundEffects: [],
  camera: { position: [0, 0, 5], rotation: [0, 0, 0], scale: [1, 1, 1], zoom: 1 },
  cameraKeyframes: [], motionEffects: [], isCinematic: false, dofEnabled: false,
  trim: { start: 0, end: 0 }, zoomRegions: [], speedRegions: [], annotations: [], captions: [],
  frame: { mode: 'none', colorA: '#000000', colorB: '#111111', padding: 0.08, rounded: true, borderColor: '#ffffff', borderWidth: 0 },
  webcam: { enabled: false, corner: 'br', size: 0.22, circle: true },
};
const duration = 10000;

// batch: each call sees the previous one, so both zooms survive
let s = applyAiToolCalls(base, [
  { name: 'addZoomRegion', args: { start: 1000, end: 2500, scale: 2, centerX: 0.3, centerY: 0.4 } },
  { name: 'addZoomRegion', args: { start: 5000, end: 6500, scale: 3, centerX: 0.7, centerY: 0.6 } },
], duration);
assert.strictEqual(s.zoomRegions.length, 2);

// clamping + overlap replacement
s = applyAiToolCalls(s, [{ name: 'addZoomRegion', args: { start: 1200, end: 3000, scale: 99, centerX: -1, centerY: 2 } }], duration);
assert.strictEqual(s.zoomRegions.length, 2);
const z = s.zoomRegions.find(r => r.start === 1200);
assert.ok(z, 'new zoom region present');
assert.strictEqual(z.scale, 4);
assert.strictEqual(z.centerX, 0);
assert.strictEqual(z.centerY, 1);

// keyframes: add two, then re-key within 100ms updates instead of stacking
s = applyAiToolCalls(s, [
  { name: 'addCameraKeyframe', args: { time: 1000, zoom: 1, x: 0, y: 0, easing: 'linear' } },
  { name: 'addCameraKeyframe', args: { time: 3000, zoom: 2, x: 1, y: 0.5 } },
], duration);
assert.strictEqual(s.cameraKeyframes.length, 2);
s = applyAiToolCalls(s, [{ name: 'addCameraKeyframe', args: { time: 1050, zoom: 1.5 } }], duration);
assert.strictEqual(s.cameraKeyframes.length, 2);
assert.strictEqual(s.cameraKeyframes[0].camera.zoom, 1.5);
assert.strictEqual(s.cameraKeyframes[0].time, 1050);
assert.strictEqual(s.cameraKeyframes[0].easing, 'ease');

// effects: intensity clamps; unknown types are ignored
s = applyAiToolCalls(s, [{ name: 'addMotionEffect', args: { type: 'fade-black', start: 4000, end: 6000, intensity: 2 } }], duration);
assert.strictEqual(s.motionEffects.length, 1);
assert.strictEqual(s.motionEffects[0].intensity, 1);
s = applyAiToolCalls(s, [{ name: 'addMotionEffect', args: { type: 'explode', start: 0, end: 1000 } }], duration);
assert.strictEqual(s.motionEffects.length, 1);

// captions: trim text, reject blank text
s = applyAiToolCalls(s, [{ name: 'addCaption', args: { start: 1000, end: 2000, text: '  Hello  ' } }], duration);
assert.strictEqual(s.captions[0].text, 'Hello');
s = applyAiToolCalls(s, [{ name: 'addCaption', args: { start: 3000, end: 4000, text: '   ' } }], duration);
assert.strictEqual(s.captions.length, 1);

// trim: 0 end means full duration; out-of-range end clamps
s = applyAiToolCalls(s, [{ name: 'trimVideo', args: { start: 500, end: 0 } }], duration);
assert.deepStrictEqual(s.trim, { start: 500, end: 0 });
s = applyAiToolCalls(s, [{ name: 'trimVideo', args: { start: 500, end: 99999 } }], duration);
assert.deepStrictEqual(s.trim, { start: 500, end: 10000 });

// speed: rate clamps; overlap replaces
s = applyAiToolCalls(s, [{ name: 'setSpeed', args: { start: 2000, end: 4000, rate: 9 } }], duration);
assert.strictEqual(s.speedRegions[0].rate, 4);

// auto zoom uses click coordinates (normalized 0.5,0.5)
s = applyAiToolCalls(s, [{ name: 'autoZoom', args: {} }], duration);
assert.ok(s.zoomRegions.length >= 1);
assert.ok(s.zoomRegions[0].centerX > 0.4 && s.zoomRegions[0].centerX < 0.6);

// cinematic + frame
s = applyAiToolCalls(s, [{ name: 'setCinematic', args: { enabled: true, frameMode: 'gradient' } }], duration);
assert.strictEqual(s.isCinematic, true);
assert.strictEqual(s.frame.mode, 'gradient');

// clear track + unknown no-op (identity preserved)
s = applyAiToolCalls(s, [{ name: 'clearTrack', args: { track: 'zoom' } }], duration);
assert.strictEqual(s.zoomRegions.length, 0);
assert.strictEqual(applyAiToolCalls(s, [{ name: 'nonsense', args: {} }], duration), s);

console.log('ai actions smoke: all checks passed');
