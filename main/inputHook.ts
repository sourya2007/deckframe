import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let startTime: bigint | null = null;
let events: any[] = [];
let isRecording = false;
let uiohook: any = null;

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
  isRecording = true;

  // Live telemetry stream (moves included) for the renderer; the events file
  // keeps clicks/scroll/keys only — moves would bloat it for no editor benefit.
  const emit = (ev: any) => {
    if (!isRecording) return;
    onEvent?.(ev);
    if (ev.type !== 'move') events.push(ev);
  };

  hook.uIOhook.on('mousemove', (e: any) => {
    emit({ timestamp: getRelativeTime(), type: 'move', coordinates: { x: e.x, y: e.y } });
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
  try {
    fs.writeFileSync(outputPath, JSON.stringify(events, null, 2));
  } catch (err) {
    console.error('Failed to write events file:', err);
    return null;
  }
  events = [];
  return outputPath;
}
