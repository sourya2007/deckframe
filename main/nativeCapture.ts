import { app, desktopCapturer, screen } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import { stopInputHook } from './inputHook';

// Native Windows Graphics Capture (WGC) backend. The helper records H.264 MP4
// directly and excludes the OS cursor, so recordings need no cursor-hiding hack
// and no webm→mp4 conversion. System audio is captured through WASAPI to a
// sidecar WAV and muxed back into the MP4 when recording stops.

interface NativeSession {
  proc: ChildProcessWithoutNullStreams;
  tempVideo: string;
  systemAudio: string | null;
  output: string;
  stopRequested: boolean;
}

let session: NativeSession | null = null;

function helperPath(): string {
  const archDir = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  const p = path.join(app.getAppPath(), 'native', 'bin', archDir, 'wgc-capture.exe');
  return app.isPackaged ? p.replace(/\.asar([/\\])/, '.asar.unpacked$1') : p;
}

export function isNativeCaptureAvailable(): boolean {
  if (process.platform !== 'win32') return false;
  const [, , build] = os.release().split('.').map(Number);
  if (!(build >= 19041)) return false;
  return fs.existsSync(helperPath());
}

export function isNativeCaptureActive(): boolean {
  return session !== null;
}

function parseWindowHandle(sourceId: string): number | null {
  const match = sourceId.match(/^window:(\d+)/);
  const handle = match ? Number.parseInt(match[1], 10) : NaN;
  return Number.isFinite(handle) && handle > 0 ? handle : null;
}

export async function startNativeCapture(sourceId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!isNativeCaptureAvailable()) {
    return { ok: false, error: 'Native Windows capture is not available on this system.' };
  }
  if (session) {
    return { ok: false, error: 'A native recording is already active.' };
  }
  if (!sourceId) {
    return { ok: false, error: 'No capture source selected.' };
  }

  let config: Record<string, unknown>;
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    const source = sources.find(s => s.id === sourceId);
    if (!source) {
      return { ok: false, error: 'Selected source is no longer available.' };
    }

    const ts = Date.now();
    const tempVideo = path.join(os.tmpdir(), `deckframe-native-${ts}.mp4`);
    const systemAudio = path.join(os.tmpdir(), `deckframe-native-${ts}.system.wav`);

    config = { outputPath: tempVideo, fps: 60, captureSystemAudio: true, audioOutputPath: systemAudio };

    const handle = parseWindowHandle(sourceId);
    if (sourceId.startsWith('window:')) {
      if (!handle) return { ok: false, error: 'Could not resolve the selected window.' };
      config.windowHandle = handle;
    } else {
      // Electron exposes the HMONITOR handle as display.id on Windows.
      const requestedId = Number(source.display_id);
      const display =
        screen.getAllDisplays().find(d => d.id === requestedId) ?? screen.getPrimaryDisplay();
      config.displayId = display.id;
      config.displayX = Math.round(display.bounds.x);
      config.displayY = Math.round(display.bounds.y);
      config.displayW = Math.round(display.bounds.width);
      config.displayH = Math.round(display.bounds.height);
    }

    const proc = spawn(helperPath(), [JSON.stringify(config)], {
      cwd: app.getPath('userData'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const current: NativeSession = {
      proc,
      tempVideo,
      systemAudio: null,
      output: '',
      stopRequested: false,
    };
    session = current;

    proc.stdout.on('data', (d: Buffer) => { current.output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { current.output += d.toString(); });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for native capture to start')), 12000);
      const onData = () => {
        if (current.output.includes('Recording started')) {
          clearTimeout(timer);
          proc.stdout.off('data', onData);
          resolve();
        }
      };
      proc.stdout.on('data', onData);
      proc.once('error', err => { clearTimeout(timer); reject(err); });
      proc.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(current.output.trim() || `Native capture exited before recording started (code ${code ?? 'unknown'})`));
      });
    });

    current.systemAudio = systemAudio;
    return { ok: true };
  } catch (err: any) {
    const failed = session;
    session = null;
    if (failed) {
      try { failed.proc.kill(); } catch { /* already gone */ }
      cleanup(failed);
    }
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function cleanup(s: NativeSession) {
  for (const p of [s.tempVideo, s.systemAudio]) {
    if (p) { try { fs.unlinkSync(p); } catch { /* best effort */ } }
  }
}

function muxSystemAudio(videoPath: string, audioPath: string | null, outPath: string): Promise<void> {
  const bin = ffmpegStatic ?? 'ffmpeg';
  if (!audioPath || !fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
    fs.renameSync(videoPath, outPath);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      '-y', '-i', videoPath, '-i', audioPath,
      '-filter_complex', '[1:a]apad[a]',
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
      outPath,
    ], { windowsHide: true });
    let stderr = '';
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.once('error', reject);
    proc.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg audio mux failed (${code}): ${stderr.slice(-400)}`));
    });
  });
}

export async function stopNativeCapture(): Promise<{ videoPath: string; eventsPath: string | null } | null> {
  const s = session;
  if (!s) return null;
  s.stopRequested = true;

  const eventsPath = stopInputHook();
  const closed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { s.proc.kill(); } catch { /* already gone */ }
      reject(new Error('Timed out waiting for native capture to stop'));
    }, 45000);
    s.proc.once('close', () => { clearTimeout(timer); resolve(); });
    s.proc.once('error', err => { clearTimeout(timer); reject(err); });
  });

  try {
    s.proc.stdin.write('stop\n');
  } catch {
    try { s.proc.kill(); } catch { /* already gone */ }
  }
  try {
    await closed;
  } finally {
    session = null;
  }

  const ts = Date.now();
  const outPath = path.join(app.getPath('userData'), `recording-${ts}.mp4`);
  try {
    await muxSystemAudio(s.tempVideo, s.systemAudio, outPath);
    cleanup(s);
  } catch (err) {
    console.error('System audio mux failed, keeping silent video:', err);
    try {
      fs.renameSync(s.tempVideo, outPath);
      cleanup(s);
    } catch (renameErr) {
      // never delete the only copy of the recording
      console.error('Could not move native recording, keeping temp file:', s.tempVideo, renameErr);
      if (s.systemAudio) {
        try { fs.unlinkSync(s.systemAudio); } catch { /* best effort */ }
      }
    }
  }

  return { videoPath: outPath, eventsPath: eventsPath ?? null };
}

export function pauseNativeCapture() {
  try { session?.proc.stdin.write('pause\n'); } catch { /* session closing */ }
}

export function resumeNativeCapture() {
  try { session?.proc.stdin.write('resume\n'); } catch { /* session closing */ }
}

export function killNativeCapture() {
  const s = session;
  session = null;
  if (!s) return;
  try { s.proc.kill(); } catch { /* already gone */ }
  cleanup(s);
}
