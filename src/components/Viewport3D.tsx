import { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { EffectComposer, DepthOfField, Glitch, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type {
  CameraTransform, InteractionEvent, FrameStyle, Annotation, Caption, WebcamStyle, ZoomRegion,
  CameraKeyframe, MotionEffect, CursorStyleSettings, CursorVisualStyle,
} from '../types/project';
import { cursorAt, latestClick, activeAnnotations, activeCaption, cropAt, cropMap, cameraAtTime, motionAt } from '../lib/timeline';
import type { DisplayInfo, Crop } from '../lib/timeline';
import {
  DEFAULT_CURSOR_SETTINGS, createSpringState, stepSpring, cursorSpringConfig,
  swaySpringConfig, swayTargetRotation, clickVisualState, clickBounceScale,
} from '../lib/cursor';
import { wallpaperUrl } from '../lib/wallpapers';
import tahoeCursorUrl from '../assets/cursors/tahoe.svg';
import macosCursorUrl from '../assets/cursors/macos.svg';
import windows11CursorUrl from '../assets/cursors/windows11.svg';
import figmaCursorUrl from '../assets/cursors/figma.svg';

// The scene plane is 16x9 world units; every overlay renders as a mesh so the
// WebGL canvas capture at export time includes it.

interface Viewport3DProps {
  videoUrl: string | null;
  cameraTransform: CameraTransform;
  isCinematic: boolean;
  dofEnabled: boolean;
  playhead: number;
  // export window: reuse a video element owned by the caller (its audio feeds
  // MediaRecorder), play at its own rate (freeRun), and expose the canvas
  externalVideo?: HTMLVideoElement | null;
  freeRun?: boolean;
  paused?: boolean;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
  // phase 3 overlays
  events?: InteractionEvent[];
  displaySize?: DisplayInfo | null;
  frame?: FrameStyle;
  annotations?: Annotation[];
  captions?: Caption[];
  playbackRate?: number;
  webcamUrl?: string | null;
  webcam?: WebcamStyle;
  cursor?: CursorStyleSettings;
  zoomRegions?: ZoomRegion[];
  // phase 4: keyframed camera + motion effect regions
  cameraKeyframes?: CameraKeyframe[];
  motionEffects?: MotionEffect[];
}

// video content scale inside the frame (padding shrinks it)
const contentScale = (frame?: FrameStyle) =>
  frame && frame.mode !== 'none' ? 1 - 2 * frame.padding : 1;

// normalized video coords (0..1) → world coords on the content plane
function toWorld(nx: number, ny: number, vs: number): [number, number] {
  return [(nx - 0.5) * 16 * vs, (0.5 - ny) * 9 * vs];
}

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: any[], w: number, h: number) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function VideoPlane({ url, playhead, externalVideo, freeRun, paused, scale, radius, playbackRate, crop }: {
  url: string | null; playhead: number; externalVideo?: HTMLVideoElement | null; freeRun?: boolean; paused?: boolean;
  scale: number; radius: number; playbackRate?: number; crop: Crop;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);

  // zoom regions crop the source texture, not the camera: the frame, captions
  // and webcam stay screen-fixed while cursor/annotations are remapped
  useFrame(() => {
    const tex = textureRef.current;
    if (!tex) return;
    const s = 1 / crop.zoom;
    // texture V is flipped (flipY), so the crop's top edge maps to 1 - top
    tex.repeat.set(s, s);
    tex.offset.set(crop.centerX - s / 2, 1 - crop.centerY - s / 2);
  });

  // rounded-corner mask (white inside, black outside) for the alphaMap
  const rounded = radius > 0;
  const alphaTex = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    const r = (Math.min(w, h) * Math.min(50, Math.max(0, radius))) / 100;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, r);
    ctx.fill();
  }, [radius], 512, 288);

  useEffect(() => {
    if (!url && !externalVideo) return;
    const video = externalVideo ?? document.createElement('video');
    if (!externalVideo) {
      video.src = url!;
      video.muted = true;
      video.play();
    }
    videoRef.current = video;

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureRef.current = texture;

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.map = texture;
      mat.needsUpdate = true;
    }

    return () => {
      if (!externalVideo) video.pause();
      texture.dispose();
    };
  }, [url, externalVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || freeRun) return; // export window: video plays on its own clock
    if (paused) video.pause();
    else video.play().catch(() => { /* autoplay may be blocked */ });
  }, [paused, freeRun, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || freeRun) return; // export window: video plays on its own clock
    const target = playhead / 1000;
    if (Math.abs(video.currentTime - target) > 0.3) {
      video.currentTime = target;
    }
  }, [playhead, url, freeRun]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && playbackRate && video.playbackRate !== playbackRate) {
      video.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
    }
  }, [playbackRate]);

  return (
    <mesh ref={meshRef} scale={[scale, scale, 1]}>
      <planeGeometry args={[16, 9]} />
      <meshBasicMaterial
        color={0xffffff}
        side={THREE.DoubleSide}
        transparent={rounded}
        alphaMap={rounded ? alphaTex : null}
      />
    </mesh>
  );
}

// wallpaper textures are async; keep the previous one on screen until the new
// image decodes so switching wallpapers doesn't flash the fallback color
function useWallpaperTexture(frame: FrameStyle) {
  const url = frame.mode === 'image' ? wallpaperUrl(frame.wallpaper) : null;
  const key = url ? `${url}|${frame.blur}|${frame.colorA}` : '';
  const [entry, setEntry] = useState<{ key: string; tex: THREE.CanvasTexture } | null>(null);

  useEffect(() => {
    if (!url) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = 1920, h = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = frame.colorA;
      ctx.fillRect(0, 0, w, h);

      const blur = Math.max(0, Math.min(8, frame.blur));
      // overscan so the blur doesn't fade out at the canvas edges
      const pad = blur * 2;
      const scale = Math.max((w + pad * 2) / img.naturalWidth, (h + pad * 2) / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.filter = 'none';

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      setEntry({ key, tex });
    };
    img.onerror = () => { if (!cancelled) setEntry(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [key, url, frame.blur, frame.colorA]);

  useEffect(() => () => { entry?.tex.dispose(); }, [entry]);

  return entry?.tex ?? null;
}

function BackgroundPlane({ frame }: { frame: FrameStyle }) {
  const wallpaperTex = useWallpaperTexture(frame);
  const tex = useCanvasTexture((ctx, w, h) => {
    if (frame.mode === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, frame.colorA);
      g.addColorStop(1, frame.colorB);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = frame.colorA;
    }
    ctx.fillRect(0, 0, w, h);
  }, [frame.mode, frame.colorA, frame.colorB], 16, 256);

  const borderTex = useCanvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = frame.borderColor;
    ctx.lineWidth = Math.max(2, h * frame.borderWidth * 2);
    const r = Math.min(w, h) * 0.05;
    ctx.beginPath();
    ctx.roundRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r);
    ctx.stroke();
  }, [frame.borderColor, frame.borderWidth], 512, 288);

  return (
    <>
      <mesh position={[0, 0, -0.2]}>
        <planeGeometry args={[16, 9]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      {wallpaperTex && (
        <mesh position={[0, 0, -0.19]}>
          <planeGeometry args={[16, 9]} />
          <meshBasicMaterial map={wallpaperTex} />
        </mesh>
      )}
      {frame.borderWidth > 0 && (() => {
        const vs = contentScale(frame);
        return (
          <mesh position={[0, 0, -0.05]}>
            <planeGeometry args={[16 * vs + 0.08, 9 * vs + 0.08]} />
            <meshBasicMaterial map={borderTex} transparent />
          </mesh>
        );
      })()}
    </>
  );
}

// soft drop shadow behind the video; three passes approximate Recordly's CSS
// drop-shadow stack (wide + medium + tight)
function ShadowPlane({ frame, vs }: { frame: FrameStyle; vs: number }) {
  const tex = useCanvasTexture((ctx, w, h) => {
    const s = Math.max(0, Math.min(1, frame.shadow));
    if (s <= 0) return;
    ctx.clearRect(0, 0, w, h);
    const vw = w * 0.8, vh = h * 0.8;
    const vx = (w - vw) / 2, vy = (h - vh) / 2;
    const r = (vh * Math.min(50, Math.max(0, frame.radius))) / 100;
    for (const [blur, dy, alpha] of [[16, 4, 0.7], [5.5, 1.4, 0.5], [2.5, 0.6, 0.3]]) {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${(alpha * s).toFixed(3)})`;
      ctx.shadowBlur = blur * s;
      ctx.shadowOffsetY = dy * s;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(vx, vy, vw, vh, r);
      ctx.fill();
      ctx.restore();
    }
    // punch out the video area so only the halo remains (no hard black edge)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(vx, vy, vw, vh, r);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }, [frame.shadow, frame.radius], 640, 360);

  return (
    <mesh position={[0, 0, -0.06]}>
      <planeGeometry args={[20 * vs, 11.25 * vs]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

interface CursorAssetSpec {
  url: string | null;
  anchorX: number;
  anchorY: number;
  sizeMultiplier: number;
  preserveCanvas: boolean;
}

// hotspots/scale factors mirror Recordly's cursor assets; anchors are
// fractions of the full SVG and get re-based to the alpha-trimmed canvas
const CURSOR_ASSETS: Record<CursorVisualStyle, CursorAssetSpec> = {
  tahoe: { url: tahoeCursorUrl, anchorX: 0.14, anchorY: 0.06, sizeMultiplier: 1, preserveCanvas: false },
  macos: {
    url: macosCursorUrl, anchorX: 0.34, anchorY: 0.24,
    sizeMultiplier: (851 / 958) / (386 / 746), preserveCanvas: false,
  },
  windows11: { url: windows11CursorUrl, anchorX: 0, anchorY: 0, sizeMultiplier: 32 / 19.0625, preserveCanvas: true },
  figma: { url: figmaCursorUrl, anchorX: 40 / 396, anchorY: 22 / 433, sizeMultiplier: 1, preserveCanvas: false },
  dot: { url: null, anchorX: 0.5, anchorY: 0.5, sizeMultiplier: 1, preserveCanvas: true },
};

interface LoadedCursorSprite {
  texture: THREE.Texture;
  aspect: number;
  anchorX: number;
  anchorY: number;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cursor image failed to load'));
    img.src = url;
  });
}

function alphaBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
}

function drawDotCursor() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  const r = 26;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(56, 56, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return canvas;
}

async function loadCursorSprite(style: CursorVisualStyle): Promise<LoadedCursorSprite> {
  const spec = CURSOR_ASSETS[style];
  let canvas: HTMLCanvasElement;
  let anchorX = spec.anchorX;
  let anchorY = spec.anchorY;

  if (!spec.url) {
    canvas = drawDotCursor();
  } else {
    const img = await loadImage(spec.url);
    const scale = Math.max(1, 512 / Math.max(1, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const source = document.createElement('canvas');
    source.width = w;
    source.height = h;
    const sourceCtx = source.getContext('2d')!;
    sourceCtx.drawImage(img, 0, 0, w, h);

    if (spec.preserveCanvas) {
      canvas = source;
    } else {
      const bounds = alphaBounds(sourceCtx, w, h);
      if (!bounds) {
        canvas = source;
      } else {
        canvas = document.createElement('canvas');
        canvas.width = bounds.w;
        canvas.height = bounds.h;
        canvas.getContext('2d')!.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
        anchorX = (spec.anchorX * w - bounds.x) / bounds.w;
        anchorY = (spec.anchorY * h - bounds.y) / bounds.h;
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { texture, aspect: canvas.width / canvas.height, anchorX, anchorY };
}

function useCursorSprite(style: CursorVisualStyle) {
  const [sprite, setSprite] = useState<LoadedCursorSprite | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: LoadedCursorSprite | null = null;
    setSprite(null);
    loadCursorSprite(style)
      .then(next => {
        if (cancelled) {
          next.texture.dispose();
          return;
        }
        loaded = next;
        setSprite(next);
      })
      .catch(err => console.warn('Cursor asset failed:', err));
    return () => {
      cancelled = true;
      loaded?.texture.dispose();
    };
  }, [style]);
  return sprite;
}

// click effects are drawn into one canvas texture; 24 world units covers the
// largest cursor/effect-scale combination without clipping
const EFFECT_EXTENT = 24;
const EFFECT_CANVAS = 1024;

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  const a = Math.max(0, Math.min(1, alpha)).toFixed(3);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawClickEffect(
  canvas: HTMLCanvasElement,
  settings: CursorStyleSettings,
  cursorSizePx: number,
  progress: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (settings.clickEffect === 'none' || progress <= 0) return;

  const refPx = (EFFECT_EXTENT * 120) / canvas.width; // reference px per canvas px
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(1 / refPx, 1 / refPx);

  const reveal = 1 - progress;
  const alpha = progress * settings.clickEffectOpacity;
  const color = settings.clickEffectColor;
  const baseRadius = Math.max(12, cursorSizePx * 0.55 * settings.clickEffectScale);
  const strokeWidth = Math.max(2, cursorSizePx * 0.08);

  if (settings.clickEffect === 'ripple') {
    const eased = 1 - Math.pow(progress, 3);
    const fade = Math.pow(progress, 3);
    ctx.lineWidth = Math.max(1, 2 * fade);
    ctx.strokeStyle = hexToRgba(color, Math.max(0, Math.min(1, fade * 0.6 * settings.clickEffectOpacity)));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.5, eased * cursorSizePx * 1.95 * settings.clickEffectScale), 0, Math.PI * 2);
    ctx.stroke();
  } else if (settings.clickEffect === 'spotlight') {
    const glowRadius = baseRadius + reveal * cursorSizePx * settings.clickEffectScale;
    const innerRadius = Math.max(baseRadius * 0.72, glowRadius * 0.76);
    ctx.lineWidth = Math.max(1.25, strokeWidth * 0.68);
    ctx.strokeStyle = hexToRgba(color, alpha * 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, strokeWidth * 0.75);
    ctx.strokeStyle = hexToRgba(color, alpha * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const echoOuter = baseRadius + reveal * cursorSizePx * 1.22 * settings.clickEffectScale;
    const echoInner = Math.max(baseRadius * 0.58, echoOuter * 0.62);
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = hexToRgba(color, alpha * 0.72);
    ctx.beginPath();
    ctx.arc(0, 0, echoOuter, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, strokeWidth * 0.72);
    ctx.strokeStyle = hexToRgba(color, alpha * 0.42);
    ctx.beginPath();
    ctx.arc(0, 0, echoInner, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(color, alpha * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, baseRadius * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function CursorOverlay({ events, display, playhead, vs, crop, settings }: {
  events: InteractionEvent[]; display: DisplayInfo; playhead: number; vs: number; crop: Crop;
  settings: CursorStyleSettings;
}) {
  const target = useMemo(() => cursorAt(events, display, playhead), [events, display, playhead]);
  const click = useMemo(() => latestClick(events, display, playhead), [events, display, playhead]);
  const sprite = useCursorSprite(settings.style);

  const groupRef = useRef<THREE.Group>(null);
  const ghostRefs = useRef<Array<THREE.Group | null>>([]);
  const effectRef = useRef<THREE.Mesh>(null);
  const smoothX = useRef(createSpringState());
  const smoothY = useRef(createSpringState());
  const swaySpring = useRef(createSpringState());
  const lastRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  const effectCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = EFFECT_CANVAS;
    return c;
  }, []);
  const effectTexture = useMemo(() => {
    const t = new THREE.CanvasTexture(effectCanvas);
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [effectCanvas]);
  useEffect(() => () => effectTexture.dispose(), [effectTexture]);

  const spec = CURSOR_ASSETS[settings.style];
  const hRef = 28 * settings.size * spec.sizeMultiplier;
  const height = (hRef * vs) / 120; // 16 world units = 1920 reference px
  const width = sprite ? height * sprite.aspect : height;
  const offsetX = sprite ? (0.5 - sprite.anchorX) * width : 0;
  const offsetY = sprite ? (sprite.anchorY - 0.5) * height : 0;

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !sprite) return;

    const t = playhead;
    const mapped = target ? cropMap(crop, target.x, target.y) : null;
    const cursorVisible = !!mapped && mapped.x >= 0 && mapped.x <= 1 && mapped.y >= 0 && mapped.y <= 1;

    if (cursorVisible && mapped) {
      group.visible = true;
      const last = lastRef.current;
      const dt = last ? t - last.time : 0;
      const jump = !last || dt < 0 || dt > 100;
      const config = cursorSpringConfig(settings.smoothing);

      let nx = mapped.x;
      let ny = mapped.y;
      if (jump || settings.smoothing <= 0) {
        smoothX.current.value = nx;
        smoothX.current.velocity = 0;
        smoothX.current.initialized = true;
        smoothY.current.value = ny;
        smoothY.current.velocity = 0;
        smoothY.current.initialized = true;
        swaySpring.current.value = 0;
        swaySpring.current.velocity = 0;
        swaySpring.current.initialized = true;
        trailRef.current = [];
      } else if (dt > 0) {
        nx = stepSpring(smoothX.current, nx, dt, config);
        ny = stepSpring(smoothY.current, ny, dt, config);
      }

      const [wx, wy] = toWorld(nx, ny, vs);
      group.position.set(wx, wy, 0.1);

      const clickState = clickVisualState(
        click ? click.age : null,
        settings.clickBounceDuration,
        settings.clickEffectDurationMs,
      );
      group.scale.setScalar(clickBounceScale(clickState.bounceProgress, settings.clickBounce));

      const dx = last && !jump ? wx - last.x : 0;
      const dy = last && !jump ? wy - last.y : 0;
      const swayTarget = jump || dt <= 0 ? 0 : swayTargetRotation(dx, dy, dt, settings.sway);
      group.rotation.z = stepSpring(
        swaySpring.current,
        swayTarget,
        jump ? 16.67 : dt,
        swaySpringConfig(settings.smoothing),
      );

      if (dt > 0 && !jump) {
        trailRef.current.unshift({ x: wx, y: wy });
        if (trailRef.current.length > 9) trailRef.current.length = 9;
      }

      // ghosts approximate Pixi's directional motion-blur filter
      const speed = (Math.hypot(dx, dy) / Math.max(1, dt)) * 16.67;
      const motion = settings.motionBlur * Math.min(1, speed / 0.15);
      for (let i = 0; i < 3; i++) {
        const ghost = ghostRefs.current[i];
        if (!ghost) continue;
        const point = trailRef.current[(i + 1) * 2];
        const on = !!point && motion > 0.01;
        ghost.visible = on;
        if (on && point) {
          ghost.position.set(point.x, point.y, 0.09);
          ghost.rotation.z = group.rotation.z;
          const mesh = ghost.children[0] as THREE.Mesh;
          (mesh.material as THREE.MeshBasicMaterial).opacity = motion * (0.22 - i * 0.055);
        }
      }

      lastRef.current = { time: t, x: wx, y: wy };
    } else {
      group.visible = false;
      lastRef.current = null;
      trailRef.current = [];
      for (const ghost of ghostRefs.current) {
        if (ghost) ghost.visible = false;
      }
    }

    const effect = effectRef.current;
    if (effect) {
      const clickState = clickVisualState(
        click ? click.age : null,
        settings.clickBounceDuration,
        settings.clickEffectDurationMs,
      );
      const draw = !!click && settings.clickEffect !== 'none' && clickState.effectProgress > 0;
      effect.visible = false;
      if (draw && click) {
        const p = cropMap(crop, click.x, click.y);
        if (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) {
          const [ex, ey] = toWorld(p.x, p.y, vs);
          effect.position.set(ex, ey, 0.095);
          drawClickEffect(effectCanvas, settings, hRef, clickState.effectProgress);
          effectTexture.needsUpdate = true;
          effect.visible = true;
        }
      }
    }
  });

  if (!sprite) return null;

  return (
    <>
      {[0, 1, 2].map(i => (
        <group key={i} ref={el => { ghostRefs.current[i] = el; }} visible={false}>
          <mesh position={[offsetX, offsetY, 0]}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={sprite.texture} transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <group ref={groupRef} visible={false}>
        <mesh position={[offsetX, offsetY, 0]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={sprite.texture} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={effectRef} visible={false}>
        <planeGeometry args={[EFFECT_EXTENT, EFFECT_EXTENT]} />
        <meshBasicMaterial map={effectTexture} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

function AnnotationLayer({ annotations, playhead, vs, crop }: { annotations: Annotation[]; playhead: number; vs: number; crop: Crop }) {
  const active = useMemo(() => activeAnnotations(annotations, playhead), [annotations, playhead]);
  return (
    <>
      {active.map(a => {
        const p = cropMap(crop, a.x, a.y);
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
        const [x, y] = toWorld(p.x, p.y, vs);
        const h = a.size * 9 * vs;
        return <AnnotationMesh key={a.id} ann={a} x={x} y={y} h={h} />;
      })}
    </>
  );
}

function AnnotationMesh({ ann, x, y, h }: { ann: Annotation; x: number; y: number; h: number }) {
  const isArrow = ann.kind === 'arrow';
  // rough glyph estimate: char ≈ 0.55 of text height, with a floor
  const w = isArrow ? h : Math.max(h * 2, (ann.text?.length ?? 1) * h * 0.55);
  const tex = useCanvasTexture((ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    if (isArrow) {
      // callout arrow pointing down-right
      ctx.strokeStyle = ann.color; ctx.fillStyle = ann.color;
      ctx.lineWidth = ch * 0.09; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cw * 0.12, ch * 0.12);
      ctx.lineTo(cw * 0.72, ch * 0.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cw * 0.88, ch * 0.86);
      ctx.lineTo(cw * 0.56, ch * 0.78);
      ctx.lineTo(cw * 0.76, ch * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = `bold ${ch * 0.62}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // outline for readability on any background
      ctx.lineWidth = ch * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const text = ann.text ?? '';
      ctx.strokeText(text, cw / 2, ch / 2);
      ctx.fillStyle = ann.color;
      ctx.fillText(text, cw / 2, ch / 2);
    }
  }, [ann.kind, ann.text, ann.color], isArrow ? 256 : 1024, 256);

  return (
    <mesh position={[x, y, 0.15]} scale={[w, h, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function CaptionLayer({ captions, playhead, vs }: { captions: Caption[]; playhead: number; vs: number }) {
  const cap = useMemo(() => activeCaption(captions, playhead), [captions, playhead]);
  if (!cap) return null;
  return <CaptionMesh cap={cap} vs={vs} />;
}

function CaptionMesh({ cap, vs }: { cap: Caption; vs: number }) {
  const tex = useCanvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const r = h * 0.28;
    ctx.beginPath();
    ctx.roundRect(w * 0.02, h * 0.12, w * 0.96, h * 0.76, r);
    ctx.fill();
    // shrink font until the text fits
    let size = h * 0.42;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    do {
      ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
      size *= 0.92;
    } while (ctx.measureText(cap.text).width > w * 0.9 && size > h * 0.15);
    ctx.fillStyle = '#fff';
    ctx.fillText(cap.text, w / 2, h / 2, w * 0.92);
  }, [cap.text], 1024, 128);

  const w = 11 * vs;
  const h = w * (128 / 1024);
  const y = -(0.5 * 9 * vs) + h * 1.2;
  return (
    <mesh position={[0, y, 0.15]} scale={[w, h, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function WebcamBubble({ url, style, playhead, freeRun, paused, vs, syncVideo }: {
  url: string; style: WebcamStyle; playhead: number; freeRun?: boolean; paused?: boolean; vs: number;
  syncVideo?: HTMLVideoElement | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);
  const circle = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
  }, [], 256, 256);

  useEffect(() => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.play();
    videoRef.current = video;
    const t = new THREE.VideoTexture(video);
    t.minFilter = THREE.LinearFilter;
    setTex(t);
    return () => { video.pause(); t.dispose(); };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || freeRun) return;
    if (paused) video.pause();
    else video.play().catch(() => { /* autoplay may be blocked */ });
  }, [paused, freeRun, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (freeRun) {
      // export: follow the source clock so speed/trim regions stay in sync
      if (!syncVideo) return;
      const id = setInterval(() => {
        if (Math.abs(video.currentTime - syncVideo.currentTime) > 0.3) {
          video.currentTime = syncVideo.currentTime;
        }
      }, 250);
      return () => clearInterval(id);
    }
    const target = playhead / 1000;
    if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = target;
  }, [playhead, freeRun, syncVideo]);

  const size = style.size * 16 * vs;
  const margin = 0.35;
  const halfW = 8 * vs;
  const halfH = 4.5 * vs;
  const x = style.corner === 'bl' || style.corner === 'tl'
    ? -(halfW - margin - size / 2) : (halfW - margin - size / 2);
  const y = style.corner === 'tl' || style.corner === 'tr'
    ? (halfH - margin - size / 2) : -(halfH - margin - size / 2);

  return (
    <mesh position={[x, y, 0.3]}>
      {style.circle
        ? <circleGeometry args={[size / 2, 48]} />
        : <planeGeometry args={[size, size * 0.75]} />}
      {style.circle
        ? <meshBasicMaterial map={tex ?? undefined} transparent alphaMap={circle} />
        : <meshBasicMaterial map={tex ?? undefined} />}
    </mesh>
  );
}

function CameraRig({ transform }: { transform: CameraTransform }) {
  const lastRef = useRef<{ t: CameraTransform; zoom: number } | null>(null);

  useFrame(({ camera, size }) => {
    const t = transform;
    // fit the 16x9 plane to the viewport; camera.zoom stays a 1x-style multiplier
    const zoom = (camera as THREE.OrthographicCamera).isOrthographicCamera
      ? Math.min(size.width / 16, size.height / 9) * t.zoom
      : t.zoom;
    const last = lastRef.current;
    if (
      last &&
      last.zoom === zoom &&
      last.t.position[0] === t.position[0] &&
      last.t.position[1] === t.position[1] &&
      last.t.position[2] === t.position[2] &&
      last.t.rotation[0] === t.rotation[0] &&
      last.t.rotation[1] === t.rotation[1] &&
      last.t.rotation[2] === t.rotation[2] &&
      last.t.zoom === t.zoom
    ) return;

    camera.position.set(t.position[0], t.position[1], t.position[2]);
    camera.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    lastRef.current = { t: { ...t }, zoom };
  });
  return null;
}

export function Viewport3D({
  videoUrl, cameraTransform, isCinematic, dofEnabled, playhead,
  externalVideo, freeRun, onCanvas,
  events, displaySize, frame, annotations, captions, playbackRate, webcamUrl, webcam, zoomRegions,
  cameraKeyframes, motionEffects, paused, cursor,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onCanvas) return;
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) onCanvas(canvas);
  }, [onCanvas]);

  const vs = contentScale(frame);
  const motion = useMemo(() => motionAt(motionEffects ?? [], playhead), [motionEffects, playhead]);
  // keyframed pose replaces the static camera; shake rides on top of it
  const camera = useMemo(() => {
    const pose = cameraAtTime(cameraTransform, cameraKeyframes ?? [], playhead);
    if (!motion.shakeX && !motion.shakeY) return pose;
    return {
      ...pose,
      position: [pose.position[0] + motion.shakeX, pose.position[1] + motion.shakeY, pose.position[2]] as [number, number, number],
    };
  }, [cameraTransform, cameraKeyframes, playhead, motion.shakeX, motion.shakeY]);
  // one crop per rendered frame, shared by the video texture and the overlays;
  // the pulse effect swells the crop zoom around its existing center
  const crop = useMemo(() => {
    const c = cropAt(zoomRegions ?? [], playhead);
    return motion.pulse === 1 ? c : { ...c, zoom: c.zoom * motion.pulse };
  }, [zoomRegions, playhead, motion.pulse]);
  const glitch = motion.glitch;
  const showCursor = !!(events && events.length && displaySize);
  const showFrame = !!frame && frame.mode !== 'none';
  const showAnnotations = !!(annotations && annotations.length);
  const showCaptions = !!(captions && captions.length);
  const showWebcam = !!(webcamUrl && webcam?.enabled);

  return (
    <div ref={containerRef} className="w-full h-full bg-neutral-950">
      <Canvas>
        {isCinematic ? (
          <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
        ) : (
          <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={50} />
        )}

        <CameraRig transform={camera} />

        <ambientLight intensity={1} />

        {showFrame && <BackgroundPlane frame={frame!} />}
        {showFrame && frame!.shadow > 0 && <ShadowPlane frame={frame!} vs={vs} />}

        <VideoPlane
          url={videoUrl}
          playhead={playhead}
          externalVideo={externalVideo}
          freeRun={freeRun}
          paused={paused}
          scale={vs}
          radius={showFrame ? frame!.radius : 0}
          playbackRate={playbackRate}
          crop={crop}
        />

        {showCursor && <CursorOverlay events={events!} display={displaySize!} playhead={playhead} vs={vs} crop={crop} settings={cursor ?? DEFAULT_CURSOR_SETTINGS} />}
        {showAnnotations && <AnnotationLayer annotations={annotations!} playhead={playhead} vs={vs} crop={crop} />}
        {showCaptions && <CaptionLayer captions={captions!} playhead={playhead} vs={vs} />}
        {showWebcam && <WebcamBubble url={webcamUrl!} style={webcam!} playhead={playhead} freeRun={freeRun} paused={paused} vs={vs} syncVideo={externalVideo} />}

        {motion.fadeOpacity > 0.001 && (
          <mesh position={[0, 0, 0.6]}>
            <planeGeometry args={[60, 60]} />
            <meshBasicMaterial color={motion.fadeColor} transparent opacity={motion.fadeOpacity} depthWrite={false} />
          </mesh>
        )}

        {(isCinematic || glitch) && (
          <EffectComposer>
            <>
              {isCinematic && dofEnabled && <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />}
              {isCinematic && <Vignette eskil={false} offset={0.5} darkness={0.5} />}
              {glitch && <Glitch />}
            </>
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
