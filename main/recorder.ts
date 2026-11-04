import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

if (ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}
if (ffprobeStatic?.path) {
  process.env.FFPROBE_PATH = ffprobeStatic.path;
}
const ffmpeg = require('fluent-ffmpeg') as any;

let recordingIdCounter = 0;

export async function stopRecording(buffer: Uint8Array, micBuffer?: Uint8Array, webcamBuffer?: Uint8Array): Promise<{ videoPath: string, eventsPath: string, micPath?: string, webcamPath?: string }> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Recording buffer is empty — no video data received.');
  }

  const userData = app.getPath('userData');
  const ts = Date.now();
  const recId = ++recordingIdCounter;
  const webmPath = path.join(userData, `recording-${ts}-${recId}.webm`);
  const mp4Path = path.join(userData, `recording-${ts}-${recId}.mp4`);
  const eventsPath = path.join(userData, `events-${ts}.json`);

  fs.writeFileSync(webmPath, buffer);

  // Mic is recorded as a separate sidecar track so it can be re-mixed at export
  let micPath: string | undefined;
  if (micBuffer && micBuffer.length > 0) {
    micPath = path.join(userData, `recording-${ts}-${recId}.mic.webm`);
    fs.writeFileSync(micPath, micBuffer);
  }

  // Webcam sidecar — rendered as the PIP bubble in the editor and burned in at export
  let webcamPath: string | undefined;
  if (webcamBuffer && webcamBuffer.length > 0) {
    webcamPath = path.join(userData, `recording-${ts}-${recId}.webcam.webm`);
    fs.writeFileSync(webcamPath, webcamBuffer);
  }

  return new Promise((resolve, reject) => {
    new ffmpeg({ source: webmPath })
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-c:a aac',
        '-b:a 128k'
      ])
      .toFormat('mp4')
      .on('end', () => {
        try { fs.unlinkSync(webmPath); } catch { /* ok */ }
        resolve({ videoPath: mp4Path, eventsPath, micPath, webcamPath });
      })
      .on('error', (err: Error) => {
        try { fs.unlinkSync(webmPath); } catch { /* ok */ }
        reject(err);
      })
      .save(mp4Path);
  });
}

// Native WGC recordings arrive as finished MP4 files; only the renderer-owned
// mic/webcam sidecars still need writing.
export function writeRecordingSidecars(videoPath: string, micBuffer?: Uint8Array, webcamBuffer?: Uint8Array): { micPath?: string; webcamPath?: string } {
  const base = videoPath.replace(/\.[^.]+$/, '');
  let micPath: string | undefined;
  if (micBuffer && micBuffer.length > 0) {
    micPath = `${base}.mic.webm`;
    fs.writeFileSync(micPath, micBuffer);
  }
  let webcamPath: string | undefined;
  if (webcamBuffer && webcamBuffer.length > 0) {
    webcamPath = `${base}.webcam.webm`;
    fs.writeFileSync(webcamPath, webcamBuffer);
  }
  return { micPath, webcamPath };
}
