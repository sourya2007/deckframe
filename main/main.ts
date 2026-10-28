import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupInputHook, stopInputHook } from './inputHook';
import { stopRecording } from './recorder';
import { hideOsCursor, restoreOsCursor } from './cursorHider';
import { encodeExport, probeVideoSize, killEncode } from './exporter';
import {
  showSourceSelector, showCountdown, sendCountdownTick, sendHudTick,
  setHudPassthrough, showHud, closeOverlay, closeAllOverlays,
} from './overlayWindows';

let mainWindow: BrowserWindow | null = null;
let isRecordingActive = false;
let pendingSourceId: string | null = null;
let countdownTimer: NodeJS.Timeout | null = null;
let hudTimer: NodeJS.Timeout | null = null;

// Export session state (one export at a time — concurrent sessions would
// interleave stream chunks on the shared IPC channels)
let exportWindow: BrowserWindow | null = null;
let exportWriteStream: fs.WriteStream | null = null;
let exportTempWebm: string | null = null;
let exportResolve: ((v: { outPath: string }) => void) | null = null;
let exportReject: ((e: Error) => void) | null = null;
let exportOpts: any = null;
let exportDurationMs = 0;
let exportCancelled = false;

// Capture lifecycle log — one line per state change, for diagnosing field reports
function diag(msg: string) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'recording-diagnostics.log'), line); } catch { /* ok */ }
}

function userSettings(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf-8')); } catch { return {}; }
}

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

  // Renderer calls getDisplayMedia(); this auto-approves with the source the
  // user picked in our overlay instead of Chromium's own picker.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['window', 'screen'] }).then(sources => {
      const source = sources.find(s => s.id === pendingSourceId) ?? sources[0];
      if (!source) { callback({}); return; }
      callback({ video: source, audio: 'loopback' as any });
    }).catch(() => callback({}));
  });

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
  if (countdownTimer) clearInterval(countdownTimer);
  if (hudTimer) clearInterval(hudTimer);
  restoreOsCursor();
  closeAllOverlays();
});
process.on('exit', restoreOsCursor);

ipcMain.handle('show-source-selector', async () => {
  showSourceSelector();
});

ipcMain.handle('source-picked', async (_e, sourceId: string) => {
  pendingSourceId = sourceId;
  diag(`source-selected id=${sourceId}`);
  closeOverlay('source-selector');
  mainWindow?.webContents.send('source-selected', sourceId);
});

let pendingCountdownResolve: ((result: 'started' | 'cancelled') => void) | null = null;

ipcMain.on('countdown-cancel', () => {
  if (!pendingCountdownResolve) return;
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  closeOverlay('countdown');
  diag('countdown-cancelled');
  const resolve = pendingCountdownResolve;
  pendingCountdownResolve = null;
  resolve('cancelled');
});

ipcMain.handle('begin-countdown', async () => {
  const delay = Number(userSettings().countdownDelay) || 3;
  showCountdown(delay);
  return new Promise<'started' | 'cancelled'>((resolve) => {
    pendingCountdownResolve = resolve;
    let remaining = delay;
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimer!);
        countdownTimer = null;
        closeOverlay('countdown');
        diag('countdown-complete');
        pendingCountdownResolve = null;
        resolve('started');
      } else {
        sendCountdownTick(remaining);
      }
    }, 1000);
  });
});

ipcMain.handle('hud-control', async (_e, action: string) => {
  diag(`hud-control ${action}`);
  mainWindow?.webContents.send('hud-control', action);
});

ipcMain.handle('hud-set-passthrough', async (_e, enabled: boolean) => {
  setHudPassthrough(enabled);
});

ipcMain.handle('cancel-source-selector', async () => {
  closeOverlay('source-selector');
});

ipcMain.handle('get-sources', async (_e, opts?: { thumbnails?: boolean }) => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: opts?.thumbnails ? { width: 320, height: 200 } : undefined,
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: opts?.thumbnails ? s.thumbnail.toDataURL() : undefined,
  }));
});

ipcMain.handle('start-recording', async (_, sourceId: string) => {
  if (isRecordingActive) return process.hrtime.bigint().toString();
  const startTime = process.hrtime.bigint();
  try {
    await setupInputHook(startTime, (ev) => mainWindow?.webContents.send('cursor-telemetry', ev));
    if (userSettings().hideCursorDuringRecording !== false) hideOsCursor();
    isRecordingActive = true;
    diag(`recording-start source=${sourceId}`);
    showHud();
    const startedAt = Date.now();
    hudTimer = setInterval(() => sendHudTick(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return startTime.toString();
  } catch (err) {
    console.error('Failed to start recording:', err);
    diag(`recording-start-error ${err}`);
    throw new Error('Failed to start input hook for recording.');
  }
});

ipcMain.handle('stop-recording', async (_, chunks: Uint8Array, micChunks?: Uint8Array) => {
  if (!isRecordingActive) {
    throw new Error('No recording in progress.');
  }
  isRecordingActive = false;
  if (hudTimer) { clearInterval(hudTimer); hudTimer = null; }
  closeOverlay('hud-overlay');
  const eventsPath = stopInputHook();
  try {
    const result = await stopRecording(chunks, micChunks);
    diag(`recording-stop video=${result.videoPath} mic=${result.micPath ?? 'none'}`);
    return { videoPath: result.videoPath, eventsPath: eventsPath || result.eventsPath, micPath: result.micPath };
  } catch (err) {
    console.error('FFmpeg conversion failed:', err);
    diag(`recording-stop-error ${err}`);
    throw new Error('Failed to convert recording. The source file may be corrupt.');
  } finally {
    restoreOsCursor();
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

ipcMain.handle('export-open', async (_e, opts: any) => {
  if (exportWindow || exportWriteStream) throw new Error('An export is already running.');
  const { videoPath, format, resolution } = opts;
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error('Recording file not found.');

  const size = await probeVideoSize(videoPath);
  let w = size.width, h = size.height;
  if (resolution === '1920x1080') { w = 1920; h = 1080; }
  else if (resolution === '3840x2160') { w = 3840; h = 2160; }
  // even dimensions required by h264; hard cap for GPU texture limits
  w = Math.min(w, 3840) & ~1;
  h = Math.min(h, 2160) & ~1;

  exportOpts = opts;
  exportDurationMs = size.durationMs;
  exportCancelled = false;
  exportTempWebm = path.join(app.getPath('userData'), `export-${Date.now()}.webm`);
  exportWriteStream = fs.createWriteStream(exportTempWebm);
  diag(`export-open format=${format} ${w}x${h} src=${videoPath}`);

  // Hidden window renders the live scene at output resolution; the editor
  // stays fully usable while it records canvas frames into the webm stream
  exportWindow = new BrowserWindow({
    width: w,
    height: h,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  exportWindow.webContents.setBackgroundThrottling(false);
  exportWindow.on('closed', () => { exportWindow = null; });
  exportWindow.webContents.on('render-process-gone', (_e, details) => {
    if (!exportCancelled) failExport(new Error(`Export renderer crashed: ${details.reason}`));
  });

  const qs = new URLSearchParams({
    windowType: 'export',
    videoUrl: `file:///${String(videoPath).replace(/\\/g, '/')}`,
    scene: JSON.stringify(opts.scene ?? {}),
  }).toString();
  const loaded = (process.env.NODE_ENV === 'development' || !app.isPackaged)
    ? exportWindow.loadURL(`http://localhost:5173/?${qs}`)
    : exportWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: `?${qs}` });
  // without this, a failed load leaves the export-open promise hanging forever
  loaded.catch(err => failExport(new Error(`Export window failed to load: ${err.message}`)));

  return new Promise<{ outPath: string }>((resolve, reject) => {
    exportResolve = resolve;
    exportReject = reject;
  });
});

ipcMain.on('export-stream-write', (_e, bytes: Uint8Array) => {
  exportWriteStream?.write(Buffer.from(bytes));
});

// renderer capture phase maps to 0-85%, the ffmpeg encode tail to 85-99%
ipcMain.on('export-progress-report', (_e, pct: number) => {
  mainWindow?.webContents.send('export-progress', Math.min(85, Math.round(pct * 85)));
});

function failExport(err: Error) {
  diag(`export-error ${err.message}`);
  const ws = exportWriteStream; exportWriteStream = null; ws?.destroy();
  if (exportWindow && !exportWindow.isDestroyed()) { exportWindow.destroy(); }
  exportWindow = null;
  if (exportTempWebm) { try { fs.unlinkSync(exportTempWebm); } catch { /* ok */ } exportTempWebm = null; }
  exportReject?.(err);
  exportResolve = null; exportReject = null;
}

ipcMain.on('export-stream-close', async () => {
  const ws = exportWriteStream; exportWriteStream = null;
  await new Promise<void>(r => (ws ? ws.end(() => r()) : r()));
  if (exportWindow && !exportWindow.isDestroyed()) { exportWindow.destroy(); exportWindow = null; }
  if (exportCancelled) return;
  try {
    fs.mkdirSync(exportOpts.destPath, { recursive: true });
    const ext = exportOpts.format === 'prores' ? 'mov' : exportOpts.format;
    const outFile = path.join(exportOpts.destPath, `deckframe_${Date.now()}.${ext}`);
    await encodeExport({
      webmPath: exportTempWebm!,
      micPath: exportOpts.micPath || undefined,
      outPath: outFile,
      format: exportOpts.format,
      quality: exportOpts.quality,
      gifFps: exportOpts.gifFps,
      gifWidth: exportOpts.gifWidth,
      gifLoopForever: exportOpts.gifLoopForever,
      onProgress: pct => mainWindow?.webContents.send('export-progress', 85 + Math.round(pct * 14)),
    }, exportDurationMs);
    if (exportTempWebm) { try { fs.unlinkSync(exportTempWebm); } catch { /* ok */ } exportTempWebm = null; }
    mainWindow?.webContents.send('export-progress', 100);
    diag(`export-complete ${outFile}`);
    const resolve = exportResolve;
    exportResolve = null; exportReject = null;
    resolve?.({ outPath: outFile });
  } catch (err) {
    failExport(err as Error);
  }
});

ipcMain.handle('export-cancel', async (_e, reason?: string) => {
  if (!exportWindow && !exportWriteStream && !exportResolve) return;
  exportCancelled = true;
  killEncode();
  // 'cancelled' (no reason) = user pressed Stop; anything else is a renderer failure
  failExport(new Error(reason || 'cancelled'));
});

ipcMain.handle('reveal-file', async (_e, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});
