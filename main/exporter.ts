import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

// ffmpeg encode step for exports. Input: the renderer-streamed webm
// (scene + source audio), optional mic sidecar webm. Output: mp4/webm/prores/gif.

export interface EncodeOpts {
  webmPath: string;
  micPath?: string;
  outPath: string;
  format: 'mp4' | 'webm' | 'prores' | 'gif';
  quality: number;              // 10..100
  gifFps?: number;
  gifWidth?: number;
  gifLoopForever?: boolean;
  onProgress?: (pct: number) => void;  // 0..1 within the encode phase
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    currentEncodeProc = proc;
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      currentEncodeProc = null;
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

let currentEncodeProc: ReturnType<typeof spawn> | null = null;

export function killEncode() {
  try { currentEncodeProc?.kill(); } catch { /* ok */ }
}

function parseTimeMs(stderr: string): number | null {
  const m = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (!m) return null;
  return (parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000;
}

async function runWithProgress(bin: string, args: string[], durationMs: number, onProgress?: (pct: number) => void): Promise<void> {
  if (!onProgress) return run(bin, args);
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    currentEncodeProc = proc;
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      const t = parseTimeMs(stderr);
      if (t !== null && durationMs > 0) onProgress(Math.min(1, t / durationMs));
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      currentEncodeProc = null;
      if (code === 0) { onProgress(1); resolve(); }
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function encodeExport(opts: EncodeOpts, durationMs: number): Promise<void> {
  const bin = ffmpegStatic ?? 'ffmpeg';
  const crf = Math.round(51 - (opts.quality / 100) * 41); // 10→47, 100→10
  const base = ['-y', '-i', opts.webmPath];

  if (opts.format === 'gif') {
    const fps = opts.gifFps ?? 12;
    const w = opts.gifWidth ?? 1280;
    // -loop 0 = loop forever, -loop 1 = play once (gif muxer semantics)
    const loop = opts.gifLoopForever === false ? '1' : '0';
    const vf = `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
    await runWithProgress(bin, [...base, '-filter_complex', vf, '-loop', loop, opts.outPath], durationMs, opts.onProgress);
    return;
  }

  // mic sidecar: mix with the source audio (labeled + mapped — an unmapped
  // filter output makes ffmpeg bail with "unconnected output")
  const hasMic = !!opts.micPath;
  // shortcut: mic sidecar is mixed at 1x — speed regions desync mic audio;
  // add an atempo chain driven by speedAt when speed editing matters
  const mixArgs = hasMic
    ? ['-i', opts.micPath!, '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first[a]', '-map', '0:v', '-map', '[a]']
    : ['-map', '0:v', '-map', '0:a?'];

  const videoCodec =
    opts.format === 'webm'  ? ['-c:v', 'copy'] :
    opts.format === 'prores' ? ['-c:v', 'prores_ks', '-profile:v', '3'] :
    ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', `${crf}`];
  const audioCodec =
    opts.format === 'webm'  ? ['-c:a', 'libopus', '-b:a', '160k'] :
    opts.format === 'prores' ? ['-c:a', 'pcm_s16le'] :
    ['-c:a', 'aac', '-b:a', '192k'];

  const args = [...base, ...mixArgs, ...videoCodec, ...audioCodec, opts.outPath];

  if (opts.format !== 'mp4') {
    await runWithProgress(bin, args, durationMs, opts.onProgress);
    return;
  }

  // mp4: NVENC when available (5-10x faster), libx264 fallback
  try {
    await runWithProgress(bin, args, durationMs, opts.onProgress);
  } catch (e) {
    if (!String(e).match(/nvenc|Cannot load|Encoder .* not found|Unknown encoder/i)) throw e;
    const x264 = [...base, ...mixArgs, '-c:v', 'libx264', '-preset', 'medium', '-crf', `${crf}`, ...audioCodec, opts.outPath];
    await runWithProgress(bin, x264, durationMs, opts.onProgress);
  }
}

export async function probeVideoSize(videoPath: string): Promise<{ width: number; height: number; durationMs: number }> {
  const ffprobe = require('ffprobe-static').path as string;
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', videoPath]);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const j = JSON.parse(out);
        resolve({
          width: j.streams?.[0]?.width ?? 1920,
          height: j.streams?.[0]?.height ?? 1080,
          durationMs: Math.round((parseFloat(j.format?.duration) || 0) * 1000),
        });
      } catch (e) { reject(e as Error); }
    });
  });
}
