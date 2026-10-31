import type { ProjectState, CameraKeyframe, MotionEffectType } from '../types/project';
import { autoZoomRegions, uid } from './timeline';

// Applies model tool calls to project state. Pure and clamped: tool arguments
// are untrusted, so every number is bounded and every required field checked.

export interface AiToolCall { name: string; args: Record<string, any> }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const hasNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const EFFECT_TYPES: MotionEffectType[] = ['shake', 'pulse', 'glitch', 'fade-black', 'fade-white'];

function span(args: Record<string, any>, duration: number) {
  const start = clamp(num(args.start, 0), 0, Math.max(0, duration - 200));
  const end = clamp(num(args.end, start + 2000), start + 200, duration);
  return { start, end };
}

export function applyAiToolCalls(state: ProjectState, calls: AiToolCall[], duration: number): ProjectState {
  const d = Math.max(1, duration);
  let next = state;
  for (const call of calls) next = applyOne(next, call, d);
  return next;
}

function applyOne(state: ProjectState, call: AiToolCall, duration: number): ProjectState {
  const args = call.args ?? {};
  switch (call.name) {
    case 'addZoomRegion': {
      if (!hasNum(args.start) || !hasNum(args.end)) return state;
      const { start, end } = span(args, duration);
      const region = {
        id: uid('zoom'),
        start,
        end,
        scale: clamp(num(args.scale, 1.8), 1, 4),
        centerX: clamp(num(args.centerX, 0.5), 0, 1),
        centerY: clamp(num(args.centerY, 0.5), 0, 1),
      };
      // a new zoom replaces overlaps so the edit is actually visible
      const kept = state.zoomRegions.filter(r => r.end <= start || r.start >= end);
      return { ...state, zoomRegions: [...kept, region] };
    }

    case 'addCameraKeyframe': {
      if (!hasNum(args.time)) return state;
      const time = clamp(args.time, 0, duration);
      const easing = args.easing === 'linear' || args.easing === 'hold' ? args.easing : 'ease';
      const camera = {
        ...state.camera,
        position: [
          clamp(num(args.x, state.camera.position[0]), -8, 8),
          clamp(num(args.y, state.camera.position[1]), -4.5, 4.5),
          state.camera.position[2],
        ] as [number, number, number],
        zoom: clamp(num(args.zoom, state.camera.zoom), 0.5, 3),
      };
      const existing = state.cameraKeyframes.find(k => Math.abs(k.time - time) < 100);
      const keyframes = existing
        ? state.cameraKeyframes.map(k => k.id === existing.id ? { ...k, time, camera, easing } : k)
        : [...state.cameraKeyframes, { id: uid('cam'), time, camera, easing } as CameraKeyframe];
      return { ...state, cameraKeyframes: keyframes.sort((a, b) => a.time - b.time) };
    }

    case 'addMotionEffect': {
      if (!EFFECT_TYPES.includes(args.type) || !hasNum(args.start) || !hasNum(args.end)) return state;
      const { start, end } = span(args, duration);
      return {
        ...state,
        motionEffects: [...state.motionEffects, {
          id: uid('fx'),
          type: args.type,
          start,
          end,
          intensity: clamp(num(args.intensity, 0.7), 0.1, 1),
        }],
      };
    }

    case 'addCaption': {
      const text = typeof args.text === 'string' ? args.text.trim() : '';
      if (!text || !hasNum(args.start) || !hasNum(args.end)) return state;
      const { start, end } = span(args, duration);
      return {
        ...state,
        captions: [...state.captions, { id: uid('cap'), start, end, text }].sort((a, b) => a.start - b.start),
      };
    }

    case 'trimVideo': {
      if (!hasNum(args.start)) return state;
      const start = clamp(args.start, 0, duration);
      const end = args.end === 0 ? 0 : Math.min(duration, Math.max(start + 200, num(args.end, duration)));
      return { ...state, trim: { start, end } };
    }

    case 'setSpeed': {
      if (!hasNum(args.start) || !hasNum(args.end) || !hasNum(args.rate)) return state;
      const { start, end } = span(args, duration);
      const kept = state.speedRegions.filter(r => r.end <= start || r.start >= end);
      return {
        ...state,
        speedRegions: [...kept, { id: uid('speed'), start, end, rate: clamp(args.rate, 0.25, 4) }]
          .sort((a, b) => a.start - b.start),
      };
    }

    case 'autoZoom': {
      if (!state.displaySize || state.events.length === 0) return state;
      const regions = autoZoomRegions(state.events, state.displaySize, duration);
      return regions.length ? { ...state, zoomRegions: regions } : state;
    }

    case 'setCinematic': {
      const enabled = args.enabled === true;
      const mode = args.frameMode === 'solid' || args.frameMode === 'gradient' || args.frameMode === 'none' ? args.frameMode : null;
      return { ...state, isCinematic: enabled, ...(mode ? { frame: { ...state.frame, mode } } : {}) };
    }

    case 'clearTrack': {
      switch (args.track) {
        case 'zoom': return { ...state, zoomRegions: [] };
        case 'speed': return { ...state, speedRegions: [] };
        case 'captions': return { ...state, captions: [] };
        case 'keyframes': return { ...state, cameraKeyframes: [] };
        case 'effects': return { ...state, motionEffects: [] };
        case 'annotations': return { ...state, annotations: [] };
        default: return state;
      }
    }

    default:
      return state;
  }
}
