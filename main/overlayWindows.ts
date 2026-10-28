import { BrowserWindow, screen } from 'electron';
import path from 'path';

// Overlay windows (source selector, countdown, HUD) rendered by the same
// renderer bundle via index.html?windowType=<type> — transparent, frameless,
// always-on-top so they can float above other apps while recording.

type OverlayType = 'source-selector' | 'countdown' | 'hud-overlay';

const overlays = new Map<OverlayType, BrowserWindow>();

function overlayUrl(type: OverlayType, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ windowType: type, ...params }).toString();
  if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
    return `http://localhost:5173/?${qs}`;
  }
  return { pathname: path.join(__dirname, '../dist/index.html'), search: `?${qs}` };
}

function createOverlay(type: OverlayType, width: number, height: number, extra: Electron.BrowserWindowConstructorOptions = {}, params: Record<string, string> = {}): BrowserWindow {
  const existing = overlays.get(type);
  if (existing && !existing.isDestroyed()) return existing;

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...extra,
  });

  win.setMenuBarVisibility(false);
  const url = overlayUrl(type, params);
  if (typeof url === 'string') win.loadURL(url);
  else win.loadFile(url.pathname, { search: url.search });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => overlays.delete(type));
  overlays.set(type, win);
  return win;
}

export function showSourceSelector() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = createOverlay('source-selector', Math.min(720, width), Math.min(560, height), {
    x: Math.round((width - Math.min(720, width)) / 2),
    y: Math.round((height - Math.min(560, height)) / 2),
  });
  win.focus();
}

export function showCountdown(delaySeconds: number) {
  const size = 240;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // delay goes in the query string — the overlay isn't loaded yet when this
  // runs, so an IPC tick here would be lost
  createOverlay('countdown', size, size, {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    alwaysOnTop: true,
    focusable: false,
  }, { delay: String(delaySeconds) });
}

export function sendCountdownTick(remaining: number) {
  overlays.get('countdown')?.webContents.send('countdown-tick', { remaining });
}

export function sendHudTick(elapsedSeconds: number) {
  overlays.get('hud-overlay')?.webContents.send('hud-tick', { elapsedSeconds });
}

export function setHudPassthrough(enabled: boolean) {
  overlays.get('hud-overlay')?.setIgnoreMouseEvents(enabled, { forward: true });
}

export function showHud() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 260, h = 48;
  createOverlay('hud-overlay', w, h, {
    x: wa.x + wa.width - w - 16,
    y: wa.y + 16,
    focusable: false,
  });
}

export function closeOverlay(type: OverlayType) {
  const win = overlays.get(type);
  if (win && !win.isDestroyed()) win.close();
}

export function closeAllOverlays() {
  for (const type of [...overlays.keys()]) closeOverlay(type);
}
