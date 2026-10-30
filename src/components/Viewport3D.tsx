import { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { EffectComposer, DepthOfField, Glitch, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type {
  CameraTransform, InteractionEvent, FrameStyle, Annotation, Caption, WebcamStyle, ZoomRegion,
} from '../types/project';
import { cursorAt, activeRipples, activeAnnotations, activeCaption, cropAt, cropMap } from '../lib/timeline';
import type { DisplayInfo, Crop } from '../lib/timeline';

// The scene plane is 16x9 world units; every overlay renders as a mesh so the
// WebGL canvas capture at export time includes it.

interface Viewport3DProps {
  videoUrl: string | null;
  cameraTransform: CameraTransform;
  isCinematic: boolean;
  dofEnabled: boolean;
  playhead: number;
  activeEffect?: string | null;
  // export window: reuse a video element owned by the caller (its audio feeds
  // MediaRecorder), play at its own rate (freeRun), and expose the canvas
  externalVideo?: HTMLVideoElement | null;
  freeRun?: boolean;
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
  zoomRegions?: ZoomRegion[];
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

function VideoPlane({ url, playhead, externalVideo, freeRun, scale, rounded, playbackRate, crop }: {
  url: string | null; playhead: number; externalVideo?: HTMLVideoElement | null; freeRun?: boolean;
  scale: number; rounded: boolean; playbackRate?: number; crop: Crop;
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
  const alphaTex = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    const r = Math.min(w, h) * 0.045;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, r);
    ctx.fill();
  }, [rounded], 512, 288);

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

function BackgroundPlane({ frame }: { frame: FrameStyle }) {
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

function CursorOverlay({ events, display, playhead, vs, crop }: {
  events: InteractionEvent[]; display: DisplayInfo; playhead: number; vs: number; crop: Crop;
}) {
  const cursor = useMemo(() => cursorAt(events, display, playhead), [events, display, playhead]);
  const ripples = useMemo(() => activeRipples(events, display, playhead), [events, display, playhead]);

  return (
    <>
      {cursor && (() => {
        const p = cropMap(crop, cursor.x, cursor.y);
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
        const [x, y] = toWorld(p.x, p.y, vs);
        return (
          <group position={[x, y, 0.1]}>
            <mesh>
              <circleGeometry args={[0.085, 24]} />
              <meshBasicMaterial color={0xffffff} transparent opacity={0.9} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.085, 0.115, 24]} />
              <meshBasicMaterial color={0x000000} transparent opacity={0.5} />
            </mesh>
          </group>
        );
      })()}
      {ripples.map((r, i) => {
        const p = cropMap(crop, r.x, r.y);
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
        const [x, y] = toWorld(p.x, p.y, vs);
        const k = r.age / 600; // 0..1 over the ripple lifetime
        return (
          <mesh key={i} position={[x, y, 0.09]}>
            <ringGeometry args={[0.1 + k * 0.35, 0.16 + k * 0.42, 32]} />
            <meshBasicMaterial color={0xffffff} transparent opacity={0.6 * (1 - k)} />
          </mesh>
        );
      })}
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

function WebcamBubble({ url, style, playhead, freeRun, vs, syncVideo }: {
  url: string; style: WebcamStyle; playhead: number; freeRun?: boolean; vs: number;
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
  videoUrl, cameraTransform, isCinematic, dofEnabled, playhead, activeEffect,
  externalVideo, freeRun, onCanvas,
  events, displaySize, frame, annotations, captions, playbackRate, webcamUrl, webcam, zoomRegions,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onCanvas) return;
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) onCanvas(canvas);
  }, [onCanvas]);

  const vs = contentScale(frame);
  // one crop per rendered frame, shared by the video texture and the overlays
  const crop = useMemo(() => cropAt(zoomRegions ?? [], playhead), [zoomRegions, playhead]);
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

        <CameraRig transform={cameraTransform} />

        <ambientLight intensity={1} />

        {showFrame && <BackgroundPlane frame={frame!} />}

        <VideoPlane
          url={videoUrl}
          playhead={playhead}
          externalVideo={externalVideo}
          freeRun={freeRun}
          scale={vs}
          rounded={!!frame?.rounded && showFrame}
          playbackRate={playbackRate}
          crop={crop}
        />

        {showCursor && <CursorOverlay events={events!} display={displaySize!} playhead={playhead} vs={vs} crop={crop} />}
        {showAnnotations && <AnnotationLayer annotations={annotations!} playhead={playhead} vs={vs} crop={crop} />}
        {showCaptions && <CaptionLayer captions={captions!} playhead={playhead} vs={vs} />}
        {showWebcam && <WebcamBubble url={webcamUrl!} style={webcam!} playhead={playhead} freeRun={freeRun} vs={vs} syncVideo={externalVideo} />}

        {(isCinematic || activeEffect === 'Glitch' || activeEffect === 'ChromaticAberration') && (
          <EffectComposer>
            <>
              {isCinematic && dofEnabled && <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />}
              {isCinematic && <Vignette eskil={false} offset={0.5} darkness={0.5} />}
              {activeEffect === 'Glitch' && <Glitch />}

            </>
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
