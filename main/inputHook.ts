import fs from 'fs';
import path from 'path';
import { app, screen } from 'electron';

let startTime: bigint | null = null;
let events: any[] = [];
let isRecording = false;
let uiohook: any = null;
let lastMoveAt = 0;

async function ensureUiohook() {
  if (uiohook) return uiohook;
  try {
    uiohook = await Function('return import("uiohook-napi")')();
    return uiohook;
  } catch {
    console.warn('uiohook-napi not available — input recording disabled');
    return null;
  }
}

function getRelativeTime() {
  if (!startTime) return 0;
  const now = process.hrtime.bigint();
  return Number((now - startTime) / 1000000n);
}

function mapButton(b: number): 'left' | 'right' | 'middle' {
  if (b === 1) return 'left';
  if (b === 2) return 'right';
  return 'middle';
}

export async function setupInputHook(startTick: bigint, onEvent?: (ev: any) => void) {
  const hook = await ensureUiohook();
  if (!hook) return;

  startTime = startTick;
  events = [];
  lastMoveAt = 0;
  isRecording = true;

  const emit = (ev: any) => {
    if (!isRecording) return;
    onEvent?.(ev);
    events.push(ev);
  };

  // moves go in the file too (cursor overlay + auto-zoom need the path),
  // throttled to ~20/s — raw rate would bloat the file for no visual gain
  hook.uIOhook.on('mousemove', (e: any) => {
    const ts = getRelativeTime();
    if (ts - lastMoveAt < 50) return;
    lastMoveAt = ts;
    emit({ timestamp: ts, type: 'move', coordinates: { x: e.x, y: e.y }, details: {} });
  });

  hook.uIOhook.on('keydown', (e: any) => {
    emit({
      timestamp: getRelativeTime(),
      type: 'keypress',
      details: { key: e.keycode, state: 'down' }
    });
  });

  hook.uIOhook.on('keyup', (e: any) => {
    emit({
      timestamp: getRelativeTime(),
      type: 'keypress',
      details: { key: e.keycode, state: 'up' }
    });
  });

  hook.uIOhook.on('mousedown', (e: any) => {
    emit({
      timestamp: getRelativeTime(),
      type: 'click',
      coordinates: { x: e.x, y: e.y },
      details: { button: mapButton(e.button as number), state: 'down' }
    });
  });

  hook.uIOhook.on('mouseup', (e: any) => {
    emit({
      timestamp: getRelativeTime(),
      type: 'click',
      coordinates: { x: e.x, y: e.y },
      details: { button: mapButton(e.button as number), state: 'up' }
    });
  });

  hook.uIOhook.on('wheel', (e: any) => {
    emit({
      timestamp: getRelativeTime(),
      type: 'scroll',
      coordinates: { x: e.x, y: e.y },
      details: { amount: e.rotation }
    });
  });

  try {
    hook.uIOhook.start();
  } catch (err) {
    console.error('Failed to start input hook:', err);
  }
}

export function stopInputHook(): string | null {
  if (!isRecording) return null;
  isRecording = false;
  try { uiohook?.uIOhook.stop(); } catch { /* ok */ }
  const ts = Date.now();
  const outputPath = path.join(app.getPath('userData'), `events-${ts}.json`);
  // shortcut: coordinates map through the primary display only — window or
  // secondary-display captures overlay the cursor approximately
  const display = screen.getPrimaryDisplay();
  try {
    fs.writeFileSync(outputPath, JSON.stringify({
      version: 1,
      display: { width: display.size.width, height: display.size.height, x: display.bounds.x, y: display.bounds.y },
      events,
    }));
  } catch (err) {
    console.error('Failed to write events file:', err);
    return null;
  }
  events = [];
  return outputPath;
}
