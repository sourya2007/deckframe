import { app, BrowserWindow, ipcMain, desktopCapturer, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { setupInputHook, stopInputHook } from './inputHook';
import { stopRecording } from './recorder';

let mainWindow: BrowserWindow | null = null;
let isRecordingActive = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (isRecordingActive) stopInputHook();
});

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

ipcMain.handle('start-recording', async (_, sourceId: string) => {
  if (isRecordingActive) return process.hrtime.bigint().toString();
  const startTime = process.hrtime.bigint();
  try {
    await setupInputHook(startTime);
    isRecordingActive = true;
    return startTime.toString();
  } catch (err) {
    console.error('Failed to start recording:', err);
    throw new Error('Failed to start input hook for recording.');
  }
});

ipcMain.handle('stop-recording', async (_, chunks: Uint8Array) => {
  if (!isRecordingActive) {
    throw new Error('No recording in progress.');
  }
  isRecordingActive = false;
  const eventsPath = stopInputHook();
  try {
    const result = await stopRecording(chunks);
    return { videoPath: result.videoPath, eventsPath: eventsPath || result.eventsPath };
  } catch (err) {
    console.error('FFmpeg conversion failed:', err);
    throw new Error('Failed to convert recording. The source file may be corrupt.');
  }
});

ipcMain.handle('load-events', async (_, filePath: string) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data;
  } catch (err) {
    console.error('Failed to load events file:', err);
    throw new Error('Could not load events file.');
  }
});

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('load-settings', async () => {
  try {
    const data = fs.readFileSync(settingsPath(), 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
});

ipcMain.handle('save-settings', async (_, settings: any) => {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  return true;
});

ipcMain.handle('scan-audio-files', async (_, dirPath: string) => {
  const audioExts = ['.wav','.mp3','.ogg','.flac','.aac','.m4a'];
  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter(f => audioExts.some(ext => f.toLowerCase().endsWith(ext)))
      .map(f => ({ name: f, path: path.join(dirPath, f) }));
  } catch { return []; }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('export-video', async (event, opts: any) => {
  const { format, resolution, quality, destPath, duration, videoPath } = opts;
  const outFile = `${destPath}\\output_${Date.now()}.${format === 'mp4' ? 'mp4' : format === 'webm' ? 'webm' : 'mov'}`;
  const [w, h] = resolution === 'custom' ? ['1920', '1080'] : resolution.split('x');
  const crf = Math.round(51 - (quality / 100) * 41);
  const codec = format === 'mp4' ? 'libx264' : format === 'webm' ? 'libvpx-vp9' : 'prores_ks';

  const args = videoPath
    ? ['-y', '-i', videoPath, '-c:v', codec, '-crf', `${crf}`, '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', outFile]
    : ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=${(duration / 1000).toFixed(3)}`, '-c:v', codec, '-crf', `${crf}`, '-preset', 'medium', outFile];

  const proc = spawn('ffmpeg', args);

  proc.stderr?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    const match = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      const totalSecs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
      const pct = Math.min(99, Math.round((totalSecs / (duration / 1000)) * 100));
      event.sender.send('export-progress', pct);
    }
  });

  return new Promise<void>((resolve, reject) => {
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        event.sender.send('export-progress', 100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
});
