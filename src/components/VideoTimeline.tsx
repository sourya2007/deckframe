import { useRef, useState } from 'react';
import { InteractionEvent, SoundEffect, CameraTransform, TrimState, ZoomRegion, SpeedRegion, Annotation, Caption } from '../types/project';
import { speedAt, toNormalized } from '../lib/timeline';
import type { DisplayInfo } from '../lib/timeline';

interface VideoTimelineProps {
  duration: number;
  events: InteractionEvent[];
  soundEffects: SoundEffect[];
  camera: CameraTransform;
  playhead: number;
  onSeek: (time: number) => void;
  onSoundEffectMove?: (id: string, newTimestamp: number) => void;
  onRemoveSoundEffect?: (id: string) => void;
  // phase 3
  trim: TrimState;
  onTrimChange?: (trim: TrimState) => void;
  zoomRegions: ZoomRegion[];
  onZoomRegionsChange?: (regions: ZoomRegion[]) => void;
  speedRegions: SpeedRegion[];
  onSpeedRegionsChange?: (regions: SpeedRegion[]) => void;
  annotations: Annotation[];
  onAnnotationsChange?: (annotations: Annotation[]) => void;
  captions: Caption[];
  onCaptionsChange?: (captions: Caption[]) => void;
  onAutoZoom?: () => void;
  onTranscribe?: () => void;
  displaySize?: DisplayInfo | null;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getRulerTicks(duration: number): number[] {
  if (duration <= 0) return [0];
  const rawStep = duration / 10;
  const step = rawStep <= 1000 ? 1000 :
    rawStep <= 5000 ? 5000 :
    rawStep <= 10000 ? 10000 : 30000;
  const ticks: number[] = [];
  for (let t = 0; t < duration; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < duration) ticks.push(duration);
  return ticks;
}

type Selection =
  | { kind: 'zoom' | 'speed' | 'annotation' | 'caption'; id: string }
  | null;

export function VideoTimeline({
  duration, events, soundEffects, camera, playhead, onSeek,
  onSoundEffectMove, onRemoveSoundEffect,
  trim, onTrimChange, zoomRegions, onZoomRegionsChange,
  speedRegions, onSpeedRegionsChange, annotations, onAnnotationsChange,
  captions, onCaptionsChange, onAutoZoom, onTranscribe, displaySize,
}: VideoTimelineProps) {
  const tracksRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragTimestamp, setDragTimestamp] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const rulerTicks = getRulerTicks(duration);
  const playheadPct = duration > 0 ? (playhead / duration) * 100 : 0;
  const currentSpeed = speedAt(speedRegions, playhead);

  const timeFromMouse = (e: MouseEvent | React.MouseEvent): number => {
    if (!tracksRef.current) return 0;
    const rect = tracksRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  // one drag system for every region type: grab body to move, edges to resize
  const startRegionDrag = (
    e: React.MouseEvent,
    region: { id: string; start: number; end: number },
    mode: 'move' | 'l' | 'r',
    commit: (start: number, end: number) => void,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const t0 = timeFromMouse(e);
    const orig = { start: region.start, end: region.end };

    const move = (ev: MouseEvent) => {
      const dt = timeFromMouse(ev) - t0;
      if (mode === 'move') {
        const dur = orig.end - orig.start;
        const s = Math.max(0, Math.min(duration - dur, orig.start + dt));
        commit(s, s + dur);
      } else if (mode === 'l') {
        commit(Math.max(0, Math.min(orig.end - 300, orig.start + dt)), orig.end);
      } else {
        commit(orig.start, Math.min(duration, Math.max(orig.start + 300, orig.end + dt)));
      }
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const handleSfxMouseDown = (e: React.MouseEvent, sfx: SoundEffect) => {
    e.stopPropagation();
    e.preventDefault();
    draggingIdRef.current = sfx.id;
    setDragTimestamp(sfx.timestamp);

    const handleMouseMove = (ev: MouseEvent) => setDragTimestamp(timeFromMouse(ev));
    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      const id = draggingIdRef.current;
      draggingIdRef.current = null;
      setDragTimestamp(null);
      if (id && onSoundEffectMove) {
        const newTs = timeFromMouse(ev);
        if (Math.abs(newTs - sfx.timestamp) > 50) onSoundEffectMove(id, newTs);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const startTrimDrag = (edge: 'start' | 'end') => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const t = timeFromMouse(ev);
      if (edge === 'start') onTrimChange?.({ start: Math.max(0, Math.min(trim.end - 500, t)), end: trim.end });
      else onTrimChange?.({ start: trim.start, end: Math.min(duration, Math.max(trim.start + 500, t)) });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const selected = (() => {
    if (!selection) return null;
    if (selection.kind === 'zoom') return zoomRegions.find(r => r.id === selection.id) ?? null;
    if (selection.kind === 'speed') return speedRegions.find(r => r.id === selection.id) ?? null;
    if (selection.kind === 'annotation') return annotations.find(a => a.id === selection.id) ?? null;
    return captions.find(c => c.id === selection.id) ?? null;
  })();

  const deleteSelected = () => {
    if (!selection) return;
    const { kind, id } = selection;
    if (kind === 'zoom') onZoomRegionsChange?.(zoomRegions.filter(r => r.id !== id));
    else if (kind === 'speed') onSpeedRegionsChange?.(speedRegions.filter(r => r.id !== id));
    else if (kind === 'annotation') onAnnotationsChange?.(annotations.filter(a => a.id !== id));
    else onCaptionsChange?.(captions.filter(c => c.id !== id));
    setSelection(null);
  };

  // shared bar renderer for range-type regions
  const regionBar = (
    region: { id: string; start: number; end: number },
    color: string,
    label: string,
    kind: 'zoom' | 'speed' | 'annotation' | 'caption',
    commit: (start: number, end: number) => void,
  ) => (
    <div
      key={region.id}
      className={`absolute top-1/2 -translate-y-1/2 h-5 rounded border cursor-grab select-none text-[9px] flex items-center overflow-hidden ${color} ${selection?.id === region.id ? 'ring-1 ring-white' : ''}`}
      style={{
        left: `${duration > 0 ? (region.start / duration) * 100 : 0}%`,
        width: `${duration > 0 ? ((region.end - region.start) / duration) * 100 : 0}%`,
      }}
      onMouseDown={(e) => { setSelection({ kind, id: region.id }); startRegionDrag(e, region, 'move', commit); }}
      onDoubleClick={(e) => { e.stopPropagation(); commit(region.start, region.end); /* no-op keeps signature */ setSelection({ kind, id: region.id }); }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => startRegionDrag(e, region, 'l', commit)} />
      <span className="px-2 truncate pointer-events-none">{label}</span>
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => startRegionDrag(e, region, 'r', commit)} />
    </div>
  );

  const trimActive = trim.start > 0 || (trim.end > 0 && trim.end < duration);
  const trimEnd = trim.end > 0 ? trim.end : duration;

  return (
    <div className="h-72 bg-[#131316] border-t border-neutral-800 flex flex-col shrink-0 text-xs">
      <div className="h-10 border-b border-neutral-800 flex items-center justify-between px-4 bg-[#0E0E11]">
        <div className="flex items-center gap-2 text-neutral-400">
          <button onClick={() => onTrimChange?.({ start: playhead, end: trimEnd })} title="Set trim start at playhead" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">[ Trim In</button>
          <button onClick={() => onTrimChange?.({ start: trim.start, end: playhead })} title="Set trim end at playhead" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">Trim Out ]</button>
          {trimActive && (
            <button onClick={() => onTrimChange?.({ start: 0, end: 0 })} className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800 text-[10px]">Reset</button>
          )}
          <div className="w-px h-4 bg-neutral-700 mx-1"></div>
          <button onClick={() => onZoomRegionsChange?.([...zoomRegions, { id: `zoom-${Date.now()}`, start: Math.max(0, playhead - 250), end: Math.min(duration, playhead + 2250), scale: 1.8, centerX: 0.5, centerY: 0.5 }])} title="Add zoom region at playhead" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">+ Zoom</button>
          <button onClick={onAutoZoom} title="Generate zoom regions from clicks" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">⚡ Auto-zoom</button>
          <button onClick={() => onSpeedRegionsChange?.([...speedRegions, { id: `speed-${Date.now()}`, start: Math.max(0, playhead), end: Math.min(duration, playhead + 3000), rate: 2 }])} title="Add 2x speed region" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">+ Speed</button>
          <div className="w-px h-4 bg-neutral-700 mx-1"></div>
          <button onClick={() => onAnnotationsChange?.([...annotations, { id: `ann-${Date.now()}`, kind: 'text', start: playhead, end: Math.min(duration, playhead + 3000), x: 0.5, y: 0.3, text: 'Text', color: '#ffffff', size: 0.08 }])} className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">+ Text</button>
          <button onClick={() => onAnnotationsChange?.([...annotations, { id: `ann-${Date.now()}`, kind: 'arrow', start: playhead, end: Math.min(duration, playhead + 3000), x: 0.5, y: 0.4, color: '#ffcc00', size: 0.1 }])} className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">+ Arrow</button>
          <button onClick={() => onCaptionsChange?.([...captions, { id: `cap-${Date.now()}`, start: playhead, end: Math.min(duration, playhead + 3000), text: '' }])} className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">+ Caption</button>
          <button onClick={onTranscribe} title="Transcribe audio (needs OpenAI key in Settings)" className="hover:text-white px-2 py-1 rounded hover:bg-neutral-800">🎙 Transcribe</button>
        </div>
        <div className="flex items-center gap-4 text-neutral-400">
          {currentSpeed !== 1 && <span className="text-emerald-400">{currentSpeed}x</span>}
          <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"></line></svg></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-32 border-r border-neutral-800 bg-[#0E0E11] flex flex-col pt-6 font-medium text-neutral-400 text-[10px]">
          {[['Video', '▶'], ['Interaction', 'Mic'], ['Zoom', '🔍'], ['Speed', '⏱'], ['Text', 'T'], ['Captions', 'CC'], ['SFX', '♪']].map(([label, icon]) => (
            <div key={label} className="h-8 border-b border-neutral-800/50 flex items-center px-3 gap-2">
              <span className="w-3.5 text-center">{icon}</span> {label}
            </div>
          ))}
        </div>

        <div className="flex-1 relative overflow-x-auto bg-[#131316]">
          <div
            className="h-6 border-b border-neutral-800 bg-[#0E0E11] flex items-end px-4 text-[10px] text-neutral-500 overflow-hidden select-none sticky top-0 z-10"
            onClick={(e) => onSeek(timeFromMouse(e))}
          >
            <div className="w-full flex justify-between">
              {rulerTicks.map((t, i) => (
                <span key={i}>{formatTime(t)}</span>
              ))}
            </div>
          </div>

          <div
            ref={tracksRef}
            className="relative pt-2 pb-2 h-[calc(100%-24px)]"
            onClick={(e) => onSeek(timeFromMouse(e))}
          >
            {/* trim shading + handles */}
            {trimActive && (
              <>
                {trim.start > 0 && <div className="absolute top-0 bottom-0 left-0 bg-black/50 z-10 pointer-events-none" style={{ width: `${(trim.start / duration) * 100}%` }} />}
                {trimEnd < duration && <div className="absolute top-0 bottom-0 right-0 bg-black/50 z-10 pointer-events-none" style={{ width: `${((duration - trimEnd) / duration) * 100}%` }} />}
                <div className="absolute top-0 bottom-0 w-2 bg-emerald-500/80 hover:bg-emerald-400 cursor-ew-resize z-20" style={{ left: `calc(${(trim.start / duration) * 100}% - 4px)` }} onMouseDown={startTrimDrag('start')} title="Trim start" />
                <div className="absolute top-0 bottom-0 w-2 bg-emerald-500/80 hover:bg-emerald-400 cursor-ew-resize z-20" style={{ left: `calc(${(trimEnd / duration) * 100}% - 4px)` }} onMouseDown={startTrimDrag('end')} title="Trim end" />
              </>
            )}

            <div
              className="absolute top-0 bottom-0 w-px bg-white z-20 pointer-events-none"
              style={{ left: `${playheadPct}%` }}
            >
              <div className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
            </div>

            <Lane label="Video">
              <div className="w-full h-6 bg-neutral-800 rounded border border-neutral-700/50 flex items-center px-2 gap-1">
                <span className="text-white text-[10px] font-medium">Video</span>
              </div>
            </Lane>

            <Lane label="Interaction">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative text-white text-[10px] font-medium">
                {events.filter(ev => ev.type !== 'move').map((ev, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rotate-45 bg-white border border-purple-600"
                    style={{ left: `${duration > 0 ? (ev.timestamp / duration) * 100 : 0}%` }}
                  />
                ))}
              </div>
            </Lane>

            <Lane label="Zoom">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative">
                {zoomRegions.map(r => regionBar(r, 'bg-blue-600/70 border-blue-500', `${r.scale.toFixed(1)}x`, 'zoom', (s, e2) =>
                  onZoomRegionsChange?.(zoomRegions.map(z => z.id === r.id ? { ...z, start: s, end: e2 } : z))))}
              </div>
            </Lane>

            <Lane label="Speed">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative">
                {speedRegions.map(r => regionBar(r, 'bg-emerald-600/70 border-emerald-500', `${r.rate}x`, 'speed', (s, e2) =>
                  onSpeedRegionsChange?.(speedRegions.map(z => z.id === r.id ? { ...z, start: s, end: e2 } : z))))}
              </div>
            </Lane>

            <Lane label="Text">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative">
                {annotations.map(a => regionBar(a, 'bg-amber-600/70 border-amber-500', a.kind === 'text' ? (a.text || 'Text') : '→ arrow', 'annotation', (s, e2) =>
                  onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, start: s, end: e2 } : z))))}
              </div>
            </Lane>

            <Lane label="Captions">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative">
                {captions.map(c => regionBar(c, 'bg-sky-600/70 border-sky-500', c.text || 'caption', 'caption', (s, e2) =>
                  onCaptionsChange?.(captions.map(z => z.id === c.id ? { ...z, start: s, end: e2 } : z))))}
              </div>
            </Lane>

            <Lane label="SFX">
              <div className="w-full h-6 bg-neutral-900 rounded border border-neutral-700/50 relative">
                {soundEffects.map((sfx, i) => {
                  const isDragging = draggingIdRef.current === sfx.id;
                  const ts = isDragging && dragTimestamp !== null ? dragTimestamp : sfx.timestamp;
                  return (
                    <div
                      key={sfx.id || i}
                      className="absolute top-1/2 -translate-y-1/2 h-5 bg-amber-700/80 rounded border border-amber-600/80 px-1 flex items-center cursor-grab select-none text-[9px]"
                      style={{ left: `${duration > 0 ? (ts / duration) * 100 : 0}%` }}
                      onMouseDown={(e) => handleSfxMouseDown(e, sfx)}
                      onDoubleClick={() => onRemoveSoundEffect?.(sfx.id)}
                    >
                      {sfx.trackType}
                    </div>
                  );
                })}
              </div>
            </Lane>
          </div>

          {/* selection inspector */}
          {selection && selected && (
            <div className="absolute top-8 right-4 z-30 bg-[#1C1C1F] border border-neutral-700 rounded-lg p-3 w-64 shadow-xl space-y-2 text-neutral-300">
              <div className="flex justify-between items-center">
                <span className="font-medium capitalize text-white">{selection.kind}</span>
                <div className="flex gap-2">
                  <button onClick={deleteSelected} className="text-red-400 hover:text-red-300 text-[11px]">Delete</button>
                  <button onClick={() => setSelection(null)} className="text-neutral-500 hover:text-white">✕</button>
                </div>
              </div>

              {selection.kind === 'zoom' && (() => {
                const z = selected as ZoomRegion;
                return (
                  <>
                    <label className="block text-[11px]">Scale {z.scale.toFixed(1)}x
                      <input type="range" min="1.2" max="4" step="0.1" value={z.scale}
                        onChange={e => onZoomRegionsChange?.(zoomRegions.map(r => r.id === z.id ? { ...r, scale: Number(e.target.value) } : r))}
                        className="w-full accent-blue-500" />
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <label>Center X
                        <input type="range" min="0" max="1" step="0.02" value={z.centerX}
                          onChange={e => onZoomRegionsChange?.(zoomRegions.map(r => r.id === z.id ? { ...r, centerX: Number(e.target.value) } : r))}
                          className="w-full accent-blue-500" />
                      </label>
                      <label>Center Y
                        <input type="range" min="0" max="1" step="0.02" value={z.centerY}
                          onChange={e => onZoomRegionsChange?.(zoomRegions.map(r => r.id === z.id ? { ...r, centerY: Number(e.target.value) } : r))}
                          className="w-full accent-blue-500" />
                      </label>
                    </div>
                    <button
                      onClick={() => {
                        const ev = events.find(ev => ev.type === 'click' && ev.timestamp >= z.start && ev.timestamp <= z.end);
                        const p = ev && displaySize ? toNormalized(ev, displaySize) : null;
                        if (!p) return;
                        onZoomRegionsChange?.(zoomRegions.map(r => r.id === z.id ? { ...r, centerX: p.x, centerY: p.y } : r));
                      }}
                      className="w-full text-[11px] bg-neutral-800 hover:bg-neutral-700 rounded py-1"
                    >Center on first click</button>
                  </>
                );
              })()}

              {selection.kind === 'speed' && (() => {
                const s = selected as SpeedRegion;
                return (
                  <div className="flex gap-1">
                    {[0.5, 1, 1.5, 2, 4].map(rate => (
                      <button key={rate}
                        onClick={() => onSpeedRegionsChange?.(speedRegions.map(r => r.id === s.id ? { ...r, rate } : r))}
                        className={`flex-1 text-[11px] rounded py-1 ${s.rate === rate ? 'bg-emerald-500 text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                      >{rate}x</button>
                    ))}
                  </div>
                );
              })()}

              {selection.kind === 'annotation' && (() => {
                const a = selected as Annotation;
                return (
                  <>
                    {a.kind === 'text' && (
                      <input value={a.text ?? ''} onChange={e => onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, text: e.target.value } : z))}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px]" placeholder="Text…" />
                    )}
                    <label className="block text-[11px]">Size {(a.size * 100).toFixed(0)}%
                      <input type="range" min="0.03" max="0.25" step="0.01" value={a.size}
                        onChange={e => onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, size: Number(e.target.value) } : z))}
                        className="w-full accent-amber-500" />
                    </label>
                    <div className="flex gap-2 items-center text-[11px]">
                      Color
                      <input type="color" value={a.color}
                        onChange={e => onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, color: e.target.value } : z))}
                        className="w-8 h-6 bg-transparent border-0" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <label>X {(a.x * 100).toFixed(0)}%
                        <input type="range" min="0.05" max="0.95" step="0.02" value={a.x}
                          onChange={e => onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, x: Number(e.target.value) } : z))}
                          className="w-full accent-amber-500" />
                      </label>
                      <label>Y {(a.y * 100).toFixed(0)}%
                        <input type="range" min="0.05" max="0.95" step="0.02" value={a.y}
                          onChange={e => onAnnotationsChange?.(annotations.map(z => z.id === a.id ? { ...z, y: Number(e.target.value) } : z))}
                          className="w-full accent-amber-500" />
                      </label>
                    </div>
                  </>
                );
              })()}

              {selection.kind === 'caption' && (() => {
                const c = selected as Caption;
                return (
                  <textarea value={c.text} rows={3}
                    onChange={e => onCaptionsChange?.(captions.map(z => z.id === c.id ? { ...z, text: e.target.value } : z))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] resize-none" placeholder="Caption text…" />
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="h-8 flex items-center" title={label}>
      {children}
    </div>
  );
}
