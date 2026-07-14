import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

let recordingIdCounter = 0;

export async function stopRecording(buffer: Uint8Array): Promise<{ videoPath: string, eventsPath: string }> {
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

  return new Promise((resolve, reject) => {
    ffmpeg(webmPath)
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
        resolve({ videoPath: mp4Path, eventsPath });
      })
      .on('error', (err) => {
        try { fs.unlinkSync(webmPath); } catch { /* ok */ }
        reject(err);
      })
      .save(mp4Path);
  });
}
