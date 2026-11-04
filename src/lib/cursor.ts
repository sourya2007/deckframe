import type { CursorStyleSettings } from '../types/project';

// Cursor motion math ported from Recordly v1.4.0 (AGPL-3.0,
// github.com/webadderallorg/Recordly) so the exported feel matches.

export const DEFAULT_CURSOR_SETTINGS: CursorStyleSettings = {
  style: 'tahoe',
  size: 3.0,
  smoothing: 0.67,
  motionBlur: 0.6,
  clickBounce: 2,
  clickBounceDuration: 350,
  clickEffect: 'none',
  clickEffectColor: '#2563EB',
  clickEffectScale: 1,
  clickEffectOpacity: 1,
  clickEffectDurationMs: 600,
  sway: 0.4,
};

export interface SpringState {
  value: number;
  velocity: number;
  initialized: boolean;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  restDelta?: number;
  restSpeed?: number;
}

export function createSpringState(value = 0): SpringState {
  return { value, velocity: 0, initialized: false };
}

function clampDeltaMs(deltaMs: number, fallbackMs = 1000 / 60) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return fallbackMs;
  return Math.min(80, Math.max(1, deltaMs));
}

function resolveSpringPosition(
  t: number,
  target: number,
  initialDelta: number,
  initialVelocity: number,
  dampingRatio: number,
  undampedAngularFreq: number,
): number {
  if (dampingRatio < 1) {
    const dampedFreq = undampedAngularFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
    const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
    return (
      target -
      envelope *
        (((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / dampedFreq) *
          Math.sin(dampedFreq * t) +
          initialDelta * Math.cos(dampedFreq * t))
    );
  }

  if (dampingRatio === 1) {
    return (
      target -
      Math.exp(-undampedAngularFreq * t) *
        (initialDelta + (initialVelocity + undampedAngularFreq * initialDelta) * t)
    );
  }

  const dampedFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
  const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
  const freqT = Math.min(dampedFreq * t, 300);
  return (
    target -
    (envelope *
      ((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) * Math.sinh(freqT) +
        dampedFreq * initialDelta * Math.cosh(freqT))) /
      dampedFreq
  );
}

export function stepSpring(
  state: SpringState,
  target: number,
  deltaMs: number,
  config: SpringConfig,
): number {
  const safeDeltaMs = clampDeltaMs(deltaMs);

  if (!state.initialized || !Number.isFinite(state.value)) {
    state.value = target;
    state.velocity = 0;
    state.initialized = true;
    return state.value;
  }

  const restDelta = config.restDelta ?? 0.0005;
  const restSpeed = config.restSpeed ?? 0.02;
  if (Math.abs(target - state.value) <= restDelta && Math.abs(state.velocity) <= restSpeed) {
    state.value = target;
    state.velocity = 0;
    return state.value;
  }

  const { stiffness, damping, mass } = config;
  const undampedAngularFreq = Math.sqrt(stiffness / mass);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const initialDelta = target - state.value;
  const initialVelocity = -state.velocity;
  const tSec = safeDeltaMs / 1000;

  const current = resolveSpringPosition(
    tSec,
    target,
    initialDelta,
    initialVelocity,
    dampingRatio,
    undampedAngularFreq,
  );

  if (dampingRatio >= 1) {
    const crossed =
      (state.value <= target && current > target) ||
      (state.value >= target && current < target);
    if (crossed) {
      state.value = target;
      state.velocity = 0;
      return state.value;
    }
  }

  const epsilon = 0.0001;
  const ahead = resolveSpringPosition(
    tSec + epsilon,
    target,
    initialDelta,
    initialVelocity,
    dampingRatio,
    undampedAngularFreq,
  );
  const analyticalVelocity = (ahead - current) / epsilon;

  if (
    Math.abs(analyticalVelocity) <= restSpeed &&
    Math.abs(target - current) <= restDelta
  ) {
    state.value = target;
    state.velocity = 0;
  } else {
    state.value = current;
    state.velocity = analyticalVelocity;
  }
  return state.value;
}

const STIFFNESS_BOOST = 1.12;

export function cursorSpringConfig(smoothingFactor: number): SpringConfig {
  const clamped = Math.min(2, Math.max(0, smoothingFactor));
  if (clamped <= 0) {
    return { stiffness: 1000, damping: 100, mass: 1, restDelta: 0.0001, restSpeed: 0.001 };
  }
  if (clamped <= 0.5) {
    const n = clamped / 0.5;
    return {
      stiffness: (760 - n * 420) * STIFFNESS_BOOST,
      damping: 34 + n * 24,
      mass: 0.85 + n * 0.55,
      restDelta: 0.0002,
      restSpeed: 0.01,
    };
  }
  const n = (clamped - 0.5) / 1.5;
  return {
    stiffness: (340 - n * 180) * STIFFNESS_BOOST,
    damping: 58 + n * 22,
    mass: 1.35 + n * 0.45,
    restDelta: 0.0002,
    restSpeed: 0.01,
  };
}

export function swaySpringConfig(smoothingFactor: number): SpringConfig {
  const base = cursorSpringConfig(
    Math.min(2, Math.max(0.15, smoothingFactor * 0.7 + 0.18)),
  );
  return {
    ...base,
    damping: base.damping * 0.9,
    mass: Math.max(0.55, base.mass * 0.8),
    restDelta: 0.0005,
    restSpeed: 0.02,
  };
}

const SWAY_MAX_ROTATION = Math.PI / 18;
const SWAY_SPEED_REFERENCE = 1400;
const SWAY_VERTICAL_WEIGHT = 0.65;
const SWAY_INTENSITY_SCALE = 3;

export function swayTargetRotation(dx: number, dy: number, deltaMs: number, sway: number): number {
  if (sway <= 0) return 0;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.01) return 0;
  const speedPxPerSecond = distance / (clampDeltaMs(deltaMs) / 1000);
  const speedFactor = Math.min(1, Math.max(0, speedPxPerSecond / SWAY_SPEED_REFERENCE));
  if (speedFactor <= 0) return 0;
  const directionalBias = Math.min(1, Math.max(-1, (dx + dy * SWAY_VERTICAL_WEIGHT) / distance));
  return directionalBias * speedFactor * SWAY_MAX_ROTATION * sway * SWAY_INTENSITY_SCALE;
}

// click bounce dips and recovers; the visual click effect starts halfway in
export function clickVisualState(ageMs: number | null, bounceDuration: number, effectDuration: number) {
  const age = ageMs ?? Number.POSITIVE_INFINITY;
  const bounceProgress = age <= bounceDuration ? Math.max(0, 1 - age / bounceDuration) : 0;
  const effectAge = age - bounceDuration * 0.5;
  const effectProgress =
    effectAge >= 0 && effectAge <= effectDuration ? Math.max(0, 1 - effectAge / effectDuration) : 0;
  return { bounceProgress, effectProgress };
}

export function clickBounceScale(progress: number, amount: number) {
  return Math.max(0.72, 1 - Math.sin(progress * Math.PI) * (0.08 * amount));
}
