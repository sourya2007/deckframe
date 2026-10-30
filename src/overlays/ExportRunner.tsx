import {useCallback, useEffect, useRef, useState} from 'react';
import {Viewport3D} from '../components/Viewport3D';
import {speedAt} from '../lib/timeline';
import type {
  CameraTransform, InteractionEvent, ZoomRegion, SpeedRegion, Annotation, Caption, FrameStyle, WebcamStyle,
  CameraKeyframe, MotionEffect,
} from '../types/project';

// Hidden export window: plays the recording through the shared 3D scene,
// captures the canvas + source audio, and streams webm chunks to main.

const params = new URLSearchParams(window.location.search);
const videoUrl = params.get('videoUrl');
const sceneFile = params.get('sceneFile');

interface ExportScene {
  cameraTransform?: CameraTransform;
  isCinematic?: boolean;
  dofEnabled?: boolean;
  events?: InteractionEvent[];
  displaySize?: { width: number; height: number } | null;
  trim?: { start: number; end: number };
  zoomRegions?: ZoomRegion[];
  speedRegions?: SpeedRegion[];
  annotations?: Annotation[];
  captions?: Caption[];
  frame?: FrameStyle;
  webcam?: WebcamStyle;
  webcamPath?: string | null;
  cameraKeyframes?: CameraKeyframe[];
  motionEffects?: MotionEffect[];
}

const toFileUrl = (p: string) => 'file:///' + p.replace(/\\/g, '/');

export function ExportRunner() {
  const [scene, setScene] = useState<ExportScene | null>(null);
  const [video] = useState(() => {
    const v = document.createElement('video');
    if (videoUrl) { v.src = videoUrl; }
    return v;
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // overlays (cursor/captions/annotations) render from playhead — drive it from
  // the export video's clock at capture rate, or they freeze at t=0
  const [playhead, setPlayhead] = useState(0);
  const api = window.electronAPI!;

  useEffect(() => {
    const id = setInterval(() => setPlayhead(video.currentTime * 1000), 33);
    return () => clearInterval(id);
  }, [video]);

  const onCanvas = useCallback((c: HTMLCanvasElement) => { canvasRef.current = c; }, []);

  useEffect(() => {
    // StrictMode double-mount guard: one capture session per window
    if (startedRef.current) return;
    startedRef.current = true;
    if (!videoUrl) { setError('No video URL'); return; }

    const start = async () => {
      try {
        if (video.readyState < 1) {
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Could not load recording'));
          });
        }
        if (!video.duration) throw new Error('Could not load recording');

        const loaded: ExportScene = sceneFile ? JSON.parse(await api.getExportScene()) : {};
        setScene(loaded);

        // canvas mounts only after the scene state renders — poll instead of guessing a delay
        const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
          const t0 = Date.now();
          const timer = setInterval(() => {
            if (canvasRef.current) { clearInterval(timer); resolve(canvasRef.current); }
            else if (Date.now() - t0 > 5000) { clearInterval(timer); reject(new Error('Scene canvas never mounted')); }
          }, 50);
        });

        const audioCtx = new AudioContext();
        await audioCtx.resume();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        // connect to the stream only — don't monitor through speakers
        source.connect(dest);

        const canvasStream = canvas.captureStream(30);
        for (const track of dest.stream.getAudioTracks()) canvasStream.addTrack(track);

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus' : 'video/webm';
        const recorder = new MediaRecorder(canvasStream, {mimeType: mime, videoBitsPerSecond: 8_000_000});
        // serialize chunk sends so the last dataavailable lands before close
        let writes = Promise.resolve();
        recorder.ondataavailable = e => {
          if (e.data.size > 0) {
            writes = writes.then(() => e.data.arrayBuffer())
              .then(buf => api.exportStreamWrite(new Uint8Array(buf)));
          }
        };

        const sourceMs = video.duration * 1000;
        const trim = loaded.trim ?? {start: 0, end: 0};
        const startMs = Math.max(0, Math.min(trim.start, sourceMs - 500));
        const endMs = trim.end > 0 ? Math.min(trim.end, sourceMs) : sourceMs;
        const span = Math.max(1, endMs - startMs);

        if (startMs > 0) {
          await new Promise<void>(resolve => {
            video.onseeked = () => resolve();
            video.currentTime = startMs / 1000;
          });
        }
        video.playbackRate = speedAt(loaded.speedRegions ?? [], startMs);

        const stopPlayback = () => {
          video.pause();
          if (recorder.state !== 'inactive') recorder.stop();
        };

        const progressTimer = setInterval(() => {
          const t = video.currentTime * 1000;
          // speed regions re-time the source; 250ms granularity is plenty for 0.25-4x
          video.playbackRate = speedAt(loaded.speedRegions ?? [], t);
          api.exportProgressReport(Math.min(1, Math.max(0, (t - startMs) / span)));
          if (t >= endMs - 30) stopPlayback();
        }, 250);

        recorder.onstop = async () => {
          await writes;
          clearInterval(progressTimer);
          api.exportStreamClose();
        };

        video.onended = stopPlayback;

        // recorder first, playback second — otherwise the opening frames are lost
        recorder.start(1000);
        await video.play();
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        setError(msg);
        api.exportCancel(msg);
      }
    };

    start();
    return () => { video.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <div className="w-full h-full flex items-center justify-center text-red-400 text-sm">{error}</div>;
  }

  if (!scene) {
    return <div className="w-full h-full bg-black" />;
  }

  return (
    <div className="w-full h-full bg-black">
      <Viewport3D
        videoUrl={null}
        externalVideo={video}
        freeRun
        onCanvas={onCanvas}
        cameraTransform={scene.cameraTransform ?? {position: [0, 0, 10], rotation: [0, 0, 0], scale: [1, 1, 1], zoom: 1} as CameraTransform}
        isCinematic={scene.isCinematic ?? false}
        dofEnabled={scene.dofEnabled ?? false}
        playhead={playhead}
        events={scene.events ?? []}
        displaySize={scene.displaySize ?? null}
        frame={scene.frame}
        annotations={scene.annotations ?? []}
        captions={scene.captions ?? []}
        webcamUrl={scene.webcamPath ? toFileUrl(scene.webcamPath) : null}
        webcam={scene.webcam}
        zoomRegions={scene.zoomRegions ?? []}
        cameraKeyframes={scene.cameraKeyframes ?? []}
        motionEffects={scene.motionEffects ?? []}
      />
    </div>
  );
}
