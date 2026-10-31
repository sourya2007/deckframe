import { useEffect, useMemo, useRef } from 'react';
import { InteractionEvent, SoundEffect } from '../types/project';

const toFileUrl = (p: string) => 'file:///' + p.replace(/\\/g, '/');

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

export function useAudioEngine(events: InteractionEvent[], playhead: number, soundEffects: SoundEffect[] = []) {
  const playedKeys = useRef<Set<string>>(new Set());
  const playedSfx = useRef<Set<string>>(new Set());
  const sfxAudios = useRef<HTMLAudioElement[]>([]);
  const synthRef = useRef<AudioContext | null>(null);
  // move telemetry is 20/s — never a sound, and filtering once keeps the loop cheap
  const actionable = useMemo(() => events.filter(e => e.type !== 'move'), [events]);

  useEffect(() => {
    synthRef.current = new AudioContext();
    return () => {
      synthRef.current?.close();
      sfxAudios.current.forEach(a => a.pause());
      sfxAudios.current = [];
    };
  }, []);

  const prevPlayheadRef = useRef(playhead);
  useEffect(() => {
    const prev = prevPlayheadRef.current;
    prevPlayheadRef.current = playhead;
    const jumped = Math.abs(playhead - prev) > 500;
    if (jumped) playedKeys.current.clear();

    const ctx = synthRef.current;
    if (!ctx) return;

    actionable.forEach((e, i) => {
      const key = `${i}-${e.timestamp}-${e.type}`;
      if (playedKeys.current.has(key)) return;
      // after a seek only fire sounds near the new playhead, not the whole
      // history behind it (that used to burst on every scrub)
      const due = jumped
        ? e.timestamp <= playhead && e.timestamp > playhead - 200
        : e.timestamp >= prev && e.timestamp <= playhead;
      if (!due) return;
      playedKeys.current.add(key);
      playProceduralSound(ctx, e.type, e.details.state === 'down');
    });
  }, [playhead, actionable]);

  // library SFX play through HTMLAudioElements so any codec Chromium supports works
  const prevSfxPlayheadRef = useRef(playhead);
  useEffect(() => {
    const prev = prevSfxPlayheadRef.current;
    prevSfxPlayheadRef.current = playhead;
    const jumped = Math.abs(playhead - prev) > 500;
    if (jumped) playedSfx.current.clear();

    for (const sfx of soundEffects) {
      if (!sfx.path || playedSfx.current.has(sfx.id)) continue;
      const due = jumped
        ? sfx.timestamp <= playhead && sfx.timestamp > playhead - 200
        : sfx.timestamp >= prev && sfx.timestamp <= playhead;
      if (!due) continue;
      playedSfx.current.add(sfx.id);
      const audio = new Audio(toFileUrl(sfx.path));
      audio.volume = Math.max(0, Math.min(1, sfx.volume ?? 1));
      audio.play().catch(() => { /* missing file — keep editing */ });
      sfxAudios.current.push(audio);
      audio.addEventListener('ended', () => {
        sfxAudios.current = sfxAudios.current.filter(a => a !== audio);
      }, { once: true });
    }
  }, [playhead, soundEffects]);

  return {};
}
