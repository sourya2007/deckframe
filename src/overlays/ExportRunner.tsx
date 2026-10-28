import {useEffect, useRef, useState} from 'react';
import {Viewport3D} from '../components/Viewport3D';
import type {CameraTransform} from '../types/project';

// Hidden export window: plays the recording through the shared 3D scene,
// captures the canvas + source audio, and streams webm chunks to main.

const params = new URLSearchParams(window.location.search);
const videoUrl = params.get('videoUrl');
const scene = JSON.parse(params.get('scene') || '{}') as {
  cameraTransform?: CameraTransform;
  isCinematic?: boolean;
  dofEnabled?: boolean;
  activeEffect?: string | null;
};

export function ExportRunner() {
  const [video] = useState(() => {
    const v = document.createElement('video');
    if (videoUrl) { v.src = videoUrl; v.crossOrigin = 'Anonymous'; }
    return v;
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const api = window.electronAPI!;

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

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        // connect to the stream only — don't monitor through speakers
        source.connect(dest);

        // wait for the R3F canvas to mount
        await new Promise(r => setTimeout(r, 300));
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Scene canvas never mounted');

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

        const duration = (video.duration || 1) * 1000;
        const progressTimer = setInterval(() => {
          api.exportProgressReport(Math.min(1, video.currentTime * 1000 / duration));
        }, 250);

        recorder.onstop = async () => {
          await writes;
          clearInterval(progressTimer);
          api.exportStreamClose();
        };

        video.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };

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

  return (
    <div className="w-full h-full bg-black">
      <Viewport3D
        videoUrl={null}
        externalVideo={video}
        freeRun
        onCanvas={c => { canvasRef.current = c; }}
        cameraTransform={scene.cameraTransform ?? {position: [0, 0, 10], rotation: [0, 0, 0], zoom: 50} as CameraTransform}
        isCinematic={scene.isCinematic ?? false}
        dofEnabled={scene.dofEnabled ?? false}
        playhead={0}
        activeEffect={scene.activeEffect ?? null}
      />
    </div>
  );
}
