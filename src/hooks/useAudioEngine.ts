import { useEffect, useMemo, useRef } from 'react';
import { InteractionEvent } from '../types/project';

function disposeNodes(osc: OscillatorNode, gain: GainNode) {
  osc.onended = () => {
    try { osc.disconnect(); } catch { /* already disconnected */ }
    try { gain.disconnect(); } catch { /* already disconnected */ }
  };
}

function playScrollSound(ctx: AudioContext, amount: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80 + Math.abs(amount) * 20, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
  disposeNodes(osc, gain);
}

function playDragSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  gain.gain.setValueAtTime(0.02, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
  disposeNodes(osc, gain);
}

function playProceduralSound(ctx: AudioContext, type: string, isDown: boolean) {
  if (type === 'scroll') { playScrollSound(ctx, 1); return; }
  if (type === 'drag') { playDragSound(ctx); return; }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'keypress') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDown ? 400 : 350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    disposeNodes(osc, gain);
  } else {
    osc.type = 'square';
    osc.frequency.setValueAtTime(isDown ? 800 : 600, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
    disposeNodes(osc, gain);
  }
}

export function useAudioEngine(events: InteractionEvent[], playhead: number) {
  const playedKeys = useRef<Set<string>>(new Set());
  const synthRef = useRef<AudioContext | null>(null);
  // move telemetry is 20/s — never a sound, and filtering once keeps the loop cheap
  const actionable = useMemo(() => events.filter(e => e.type !== 'move'), [events]);

  useEffect(() => {
    synthRef.current = new AudioContext();
    return () => {
      synthRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!synthRef.current) return;
    const ctx = synthRef.current;

    actionable.forEach((e, i) => {
      const key = `${i}-${e.timestamp}-${e.type}`;
      if (e.timestamp <= playhead && !playedKeys.current.has(key)) {
        playedKeys.current.add(key);
        playProceduralSound(ctx, e.type, e.details.state === 'down');
      }
    });

    if (playhead === 0) {
      playedKeys.current.clear();
    }
  }, [playhead, actionable]);

  return {};
}
