import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { setupInputHook, stopInputHook, pauseInputHook, resumeInputHook } from './inputHook';
import { stopRecording } from './recorder';
import { hideOsCursor, restoreOsCursor } from './cursorHider';
import { encodeExport, probeVideoSize, killEncode } from './exporter';
import { aiChat } from './ai';
import { autoUpdater } from 'electron-updater';
import {
  showSourceSelector, showCountdown, sendCountdownTick, sendHudTick,
  setHudPassthrough, showHud, closeOverlay, closeAllOverlays,
} from './overlayWindows';

let mainWindow: BrowserWindow | null = null;
let isRecordingActive = false;
let pendingSourceId: string | null = null;
let countdownTimer: NodeJS.Timeout | null = null;
let hudTimer: NodeJS.Timeout | null = null;
let hudStartedAt = 0;
let hudPausedAt: number | null = null;

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
      // shortcut: local recordings are file:// and must feed WebGL textures;
      // the renderer only runs bundled code — switch to a custom media protocol
      // if untrusted content ever enters the renderer
      webSecurity: false,
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
  if (action === 'pause') {
    hudPausedAt = Date.now();
    pauseInputHook();
  } else if (action === 'resume' && hudPausedAt !== null) {
    hudStartedAt += Date.now() - hudPausedAt;
    hudPausedAt = null;
    resumeInputHook();
  }
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
    hudStartedAt = Date.now();
    hudPausedAt = null;
    hudTimer = setInterval(() => sendHudTick(Math.floor((Date.now() - hudStartedAt) / 1000)), 1000);
    return startTime.toString();
  } catch (err) {
    console.error('Failed to start recording:', err);
    diag(`recording-start-error ${err}`);
    throw new Error('Failed to start input hook for recording.');
  }
});

ipcMain.handle('stop-recording', async (_, chunks: Uint8Array, micChunks?: Uint8Array, webcamChunks?: Uint8Array) => {
  if (!isRecordingActive) {
    throw new Error('No recording in progress.');
  }
  isRecordingActive = false;
  if (hudTimer) { clearInterval(hudTimer); hudTimer = null; }
  hudPausedAt = null;
  closeOverlay('hud-overlay');
  const eventsPath = stopInputHook();
  try {
    const result = await stopRecording(chunks, micChunks, webcamChunks);
    diag(`recording-stop video=${result.videoPath} mic=${result.micPath ?? 'none'} webcam=${result.webcamPath ?? 'none'}`);
    return { videoPath: result.videoPath, eventsPath: eventsPath || result.eventsPath, micPath: result.micPath, webcamPath: result.webcamPath };
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

// ---- .deckframe projects ----

const autosavePath = () => path.join(app.getPath('userData'), 'autosave.deckframe');
const recentProjectsPath = () => path.join(app.getPath('userData'), 'recent-projects.json');

function readRecentProjects(): Array<{ path: string; name: string; savedAt: number }> {
  try {
    const list = JSON.parse(fs.readFileSync(recentProjectsPath(), 'utf-8'));
    return Array.isArray(list) ? list.filter(r => r && typeof r.path === 'string') : [];
  } catch { return []; }
}

function addRecentProject(filePath: string) {
  const list = readRecentProjects().filter(r => r.path !== filePath);
  list.unshift({ path: filePath, name: path.basename(filePath), savedAt: Date.now() });
  try {
    fs.writeFileSync(recentProjectsPath(), JSON.stringify(list.slice(0, 10), null, 2));
  } catch { /* recent list is best-effort */ }
}

function readProjectFile(filePath: string) {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.deckframe') {
    throw new Error('Not a DeckFrame project file.');
  }
  const data = fs.readFileSync(filePath, 'utf-8');
  addRecentProject(filePath);
  diag(`project-open ${filePath}`);
  return { filePath, project: JSON.parse(data) };
}

ipcMain.handle('save-project', async (_e, projectJson: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: 'untitled.deckframe',
    filters: [{ name: 'DeckFrame Project', extensions: ['deckframe'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, projectJson);
  addRecentProject(result.filePath);
  diag(`project-save ${result.filePath}`);
  return result.filePath;
});

ipcMain.handle('open-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'DeckFrame Project', extensions: ['deckframe'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  try {
    return readProjectFile(result.filePaths[0]);
  } catch (err) {
    console.error('Failed to open project:', err);
    throw new Error('Could not open project file.');
  }
});

ipcMain.handle('open-project-path', async (_e, filePath: string) => {
  try {
    return readProjectFile(filePath);
  } catch (err) {
    console.error('Failed to open recent project:', err);
    throw new Error('Could not open project file.');
  }
});

ipcMain.handle('get-recent-projects', async () => readRecentProjects());

ipcMain.handle('autosave-project', async (_e, projectJson: string) => {
  try {
    fs.writeFileSync(autosavePath(), projectJson);
    return true;
  } catch { return false; }
});

ipcMain.handle('load-autosave', async () => {
  try {
    const project = JSON.parse(fs.readFileSync(autosavePath(), 'utf-8'));
    return { project, savedAt: fs.statSync(autosavePath()).mtimeMs };
  } catch { return null; }
});

// ---- captions (whisper via OpenAI key from settings) ----
// shortcut: hosted whisper-1 instead of a local whisper.cpp binary — no model
// download, but needs network + key; whole-file upload also caps at 25MB
// (~13 min of 16k mono wav) — chunk longer audio when offline/long-form matters

ipcMain.handle('transcribe-audio', async (_e, audioPath: string) => {
  const key = userSettings().openaiKey as string | undefined;
  if (!key) throw new Error('No OpenAI API key set in Settings — needed for transcription.');
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('Audio file not found.');

  const wavPath = path.join(app.getPath('userData'), `transcribe-${Date.now()}.wav`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegStatic ?? 'ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);
    proc.on('error', reject);
    proc.on('close', (c: number | null) => c === 0 ? resolve() : reject(new Error('ffmpeg audio extract failed')));
  });

  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(wavPath)], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as { segments?: Array<{ start: number; end: number; text: string }> };
    return (json.segments ?? []).map((s, i) => ({
      id: `cap-${i}-${Math.round(s.start * 1000)}`,
      start: Math.round(s.start * 1000),
      end: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
  } finally {
    try { fs.unlinkSync(wavPath); } catch { /* ok */ }
  }
});

// ---- AI assistant (tool calls are applied by the renderer) ----
ipcMain.handle('ai-chat', async (_e, payload: { system?: string; messages?: any[] }) => {
  const system = typeof payload?.system === 'string' ? payload.system.slice(0, 12000) : '';
  const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  return aiChat(userSettings(), system, messages);
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

ipcMain.handle('check-for-updates', async (_e) => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Update check failed.' };
  }
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
      webSecurity: false, // file:// recording → WebGL canvas, same as the editor
    },
  });
  exportWindow.webContents.setBackgroundThrottling(false);
  exportWindow.on('closed', () => { exportWindow = null; });
  exportWindow.webContents.on('render-process-gone', (_e, details) => {
    if (!exportCancelled) failExport(new Error(`Export renderer crashed: ${details.reason}`));
  });

  // scene (incl. events) goes in a temp file — URL length caps (~2MB) can't
  // hold a long recording's move telemetry
  cleanupSceneFile();
  exportSceneFile = path.join(app.getPath('userData'), `export-scene-${Date.now()}.json`);
  fs.writeFileSync(exportSceneFile, JSON.stringify(opts.scene ?? {}));
  const qs = new URLSearchParams({
    windowType: 'export',
    videoUrl: `file:///${String(videoPath).replace(/\\/g, '/')}`,
    sceneFile: exportSceneFile,
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
  cleanupSceneFile();
  exportReject?.(err);
  exportResolve = null; exportReject = null;
}

let exportSceneFile: string | null = null;
function cleanupSceneFile() {
  if (exportSceneFile) { try { fs.unlinkSync(exportSceneFile); } catch { /* ok */ } exportSceneFile = null; }
}

// export window fetches its scene through IPC — file:// fetch is blocked in renderers
ipcMain.handle('get-export-scene', async () => {
  if (!exportSceneFile) throw new Error('No export scene available.');
  return fs.readFileSync(exportSceneFile, 'utf-8');
});

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
      onProgress: pct => mainWindow?.webContents.send('export-progress', Math.min(99, 85 + Math.round(pct * 14))),
    }, exportDurationMs);
    if (exportTempWebm) { try { fs.unlinkSync(exportTempWebm); } catch { /* ok */ } exportTempWebm = null; }
    cleanupSceneFile();
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
