import type { InteractionEvent, ZoomRegion, SpeedRegion, Annotation, Caption } from '../types/project';

// Pure playback/editing logic shared by the editor viewport and the export
// window — WYSIWYG export depends on both using exactly these functions.

export interface DisplayInfo { width: number; height: number; x?: number; y?: number }

// screen px → normalized video space (0..1)
export function toNormalized(ev: InteractionEvent, display: DisplayInfo): { x: number; y: number } | null {
  if (!ev.coordinates) return null;
  return {
    x: (ev.coordinates.x - (display.x ?? 0)) / display.width,
    y: (ev.coordinates.y - (display.y ?? 0)) / display.height,
  };
}

// events are time-sorted (recording order); binary-search the cursor window
// so per-frame overlay work doesn't scan the whole move telemetry array
function upperBound(events: InteractionEvent[], t: number): number {
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].timestamp <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// cursor position at time t — every move/click/scroll is a position sample,
// so a click snaps the cursor and later moves continue from it
export function cursorAt(events: InteractionEvent[], display: DisplayInfo, t: number): { x: number; y: number } | null {
  for (let i = upperBound(events, t) - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type !== 'move' && ev.type !== 'click' && ev.type !== 'scroll') continue;
    const p = toNormalized(ev, display);
    if (p) return p;
  }
  return null;
}

// expanding ripple ring for clicks within `windowMs` before t
export function activeRipples(events: InteractionEvent[], display: DisplayInfo, t: number, windowMs = 600) {
  const out: Array<{ x: number; y: number; age: number }> = [];
  for (let i = upperBound(events, t) - 1; i >= 0; i--) {
    const ev = events[i];
    if (t - ev.timestamp > windowMs) break; // sorted: older events are all outside
    if (ev.type !== 'click' || ev.details.state !== 'down') continue;
    const p = toNormalized(ev, display);
    if (p) out.push({ ...p, age: t - ev.timestamp });
  }
  return out;
}

export function speedAt(regions: SpeedRegion[], t: number): number {
  for (const r of regions) if (t >= r.start && t < r.end) return r.rate;
  return 1;
}

const ease = (x: number) => x * x * (3 - 2 * x); // smoothstep

// Zoom regions crop the video inside its frame instead of moving the camera —
// overlays stay screen-fixed and the frame/background never scale.
export interface Crop { zoom: number; centerX: number; centerY: number }

// visible crop window at time t, eased over 400ms at both region edges
export function cropAt(regions: ZoomRegion[], t: number): Crop {
  for (const r of regions) {
    if (t < r.start || t >= r.end) continue;
    const edge = Math.min(400, (r.end - r.start) / 3);
    const k = Math.min(ease(Math.min(1, (t - r.start) / edge)), ease(Math.min(1, (r.end - t) / edge)));
    if (k === 0) break;
    const zoom = 1 + (r.scale - 1) * k;
    const half = 0.5 / zoom;
    // clamp the window inside the source so the crop never shows empty edges
    return {
      zoom,
      centerX: Math.max(half, Math.min(1 - half, r.centerX)),
      centerY: Math.max(half, Math.min(1 - half, r.centerY)),
    };
  }
  return { zoom: 1, centerX: 0.5, centerY: 0.5 };
}

// map normalized source coords through the crop → 0..1 inside the visible frame
export function cropMap(crop: Crop, x: number, y: number): { x: number; y: number } {
  const half = 0.5 / crop.zoom;
  return {
    x: (x - (crop.centerX - half)) * crop.zoom,
    y: (y - (crop.centerY - half)) * crop.zoom,
  };
}

export function activeCaption(captions: Caption[], t: number): Caption | null {
  for (const c of captions) if (t >= c.start && t < c.end) return c;
  return null;
}

export function activeAnnotations(annotations: Annotation[], t: number): Annotation[] {
  return annotations.filter(a => t >= a.start && t < a.end);
}

// Cluster clicks into auto-zoom regions: clicks closer than 1.2s merge,
// each cluster becomes a zoom centered on the mean click position.
export function autoZoomRegions(
  events: InteractionEvent[],
  display: DisplayInfo,
  duration: number,
  scale = 1.8,
  maxRegions = 20,
): ZoomRegion[] {
  const clicks = events
    .filter(e => e.type === 'click' && e.details.state === 'down')
    .map(e => ({ t: e.timestamp, p: toNormalized(e, display) }))
    .filter((c): c is { t: number; p: { x: number; y: number } } => !!c.p);

  const clusters: Array<{ t: number; p: { x: number; y: number } }[]> = [];
  for (const c of clicks) {
    const last = clusters[clusters.length - 1];
    if (last && c.t - last[last.length - 1].t <= 1200) last.push(c);
    else clusters.push([c]);
  }

  return clusters.slice(0, maxRegions).map((cluster, i) => {
    const first = cluster[0].t;
    const last = cluster[cluster.length - 1].t;
    const start = Math.max(0, first - 600);
    const end = Math.min(duration, last + 800);
    return {
      id: `zoom-auto-${i}-${Math.round(first)}`,
      start,
      end: Math.max(end, start + 1000),
      scale,
      centerX: cluster.reduce((s, c) => s + c.p.x, 0) / cluster.length,
      centerY: cluster.reduce((s, c) => s + c.p.y, 0) / cluster.length,
    };
  });
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
