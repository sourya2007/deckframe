import { useRef, useState } from 'react';
import { InteractionEvent, SoundEffect, CameraTransform } from '../types/project';

interface VideoTimelineProps {
  duration: number;
  events: InteractionEvent[];
  soundEffects: SoundEffect[];
  camera: CameraTransform;
  playhead: number;
  onSeek: (time: number) => void;
  onSoundEffectMove?: (id: string, newTimestamp: number) => void;
  onRemoveSoundEffect?: (id: string) => void;
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

function seekFromEvent(e: React.MouseEvent, container: HTMLElement, duration: number, onSeek: (t: number) => void) {
  const rect = container.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 16) / (rect.width - 32)));
  onSeek(ratio * duration);
}

export function VideoTimeline({ duration, events, soundEffects, camera, playhead, onSeek, onSoundEffectMove, onRemoveSoundEffect }: VideoTimelineProps) {
  const tracksRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragTimestamp, setDragTimestamp] = useState<number | null>(null);
  const rulerTicks = getRulerTicks(duration);
  const playheadPct = duration > 0 ? (playhead / duration) * 100 : 0;

  const handleSfxMouseDown = (e: React.MouseEvent, sfx: SoundEffect) => {
    e.stopPropagation();
    e.preventDefault();
    draggingIdRef.current = sfx.id;
    setDragTimestamp(sfx.timestamp);

    const handleMouseMove = (e: MouseEvent) => {
      if (!tracksRef.current) return;
      const rect = tracksRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 16) / (rect.width - 32)));
      setDragTimestamp(ratio * duration);
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      const id = draggingIdRef.current;
      draggingIdRef.current = null;
      setDragTimestamp(null);
      if (id && onSoundEffectMove && tracksRef.current) {
        const rect = tracksRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 16) / (rect.width - 32)));
        const newTs = ratio * duration;
        const originalTs = soundEffects.find(s => s.id === id)?.timestamp;
        if (originalTs !== undefined && Math.abs(newTs - originalTs) > 50) {
          onSoundEffectMove(id, newTs);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="h-64 bg-[#131316] border-t border-neutral-800 flex flex-col shrink-0 text-xs">
      <div className="h-10 border-b border-neutral-800 flex items-center justify-between px-4 bg-[#0E0E11]">
        <div className="flex items-center gap-3 text-neutral-400">
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></button>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></button>
           <div className="w-px h-4 bg-neutral-700 mx-1"></div>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"></path><path d="M21 17v-6h-6"></path><path d="M21 3v6h-6"></path><path d="M3 21v-6h6"></path></svg></button>
        </div>
        <div className="flex items-center gap-4 text-neutral-400">
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"></line></svg></button>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg></button>
           <button className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-white hover:bg-neutral-700"><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg></button>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="19 4 9 12 19 20 19 4"></polygon><line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="2"></line></svg></button>
        </div>
        <div className="flex items-center gap-3 text-neutral-400">
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></button>
           <div className="flex items-center gap-2">
             <div className="w-24 h-1 bg-neutral-800 rounded-full relative">
                <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-blue-500 rounded-full"></div>
                <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border border-neutral-300"></div>
             </div>
           </div>
           <button className="hover:text-white"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg></button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-40 border-r border-neutral-800 bg-[#0E0E11] flex flex-col pt-6 font-medium text-neutral-400">
          <div className="h-10 border-b border-neutral-800/50 flex items-center px-3 gap-2">
             <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
             Video
             <button className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="h-10 border-b border-neutral-800/50 flex items-center px-3 gap-2">
             <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
             Interaction
             <button className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="h-10 border-b border-neutral-800/50 flex items-center px-3 gap-2">
             <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
             SFX
             <button className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="h-10 border-b border-neutral-800/50 flex items-center px-3 gap-2">
             <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
             Camera
             <button className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
        </div>
        
        <div className="flex-1 relative overflow-x-auto bg-[#131316]">
          <div
            className="h-6 border-b border-neutral-800 bg-[#0E0E11] flex items-end px-4 text-[10px] text-neutral-500 overflow-hidden select-none sticky top-0 z-10"
            onClick={(e) => seekFromEvent(e, e.currentTarget, duration, onSeek)}
          >
            <div className="w-full flex justify-between">
              {rulerTicks.map((t, i) => (
                <span key={i}>{formatTime(t)}</span>
              ))}
            </div>
          </div>
          
          <div
            ref={tracksRef}
            className="relative pt-2 pb-2 px-4 h-[calc(100%-24px)]"
            onClick={(e) => { if (tracksRef.current) seekFromEvent(e, tracksRef.current, duration, onSeek); }}
          >
            <div
              className="absolute top-0 bottom-0 w-px bg-white z-20 pointer-events-none"
              style={{ left: `calc(16px + ${playheadPct}% - ${playheadPct * 0.32}px)` }}
            >
              <div className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
              <div className="absolute top-[-10px] -translate-x-1/2 -translate-y-full flex flex-col items-center">
                <div className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                  {formatTime(playhead)}
                </div>
                <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-blue-500"></div>
              </div>
            </div>

            <div className="h-10 mb-0 flex items-center">
              <div className="w-full h-7 bg-neutral-800 rounded border border-neutral-700/50 flex items-center px-2 gap-1">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white shrink-0"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span className="text-white text-[10px] font-medium">Video</span>
              </div>
            </div>
            
            <div className="h-10 mb-0 flex items-center">
              <div className="w-full h-7 bg-neutral-900 rounded border border-neutral-700/50 flex items-center px-2 relative text-white text-[10px] font-medium">
                <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 mr-1 shrink-0" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>
                Interaction
                {events.map((ev, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-white border border-purple-600 shadow-sm"
                    style={{ left: `${duration > 0 ? (ev.timestamp / duration) * 100 : 0}%` }}
                  />
                ))}
              </div>
            </div>
            
            <div className="h-10 mb-0 flex items-center">
              <div className="w-full h-7 bg-neutral-900 rounded border border-neutral-700/50 flex items-center px-2 relative text-white text-[10px] font-medium">
                <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 mr-1 shrink-0" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>
                SFX
                {soundEffects.map((sfx, i) => {
                  const isDragging = draggingIdRef.current === sfx.id;
                  const ts = isDragging && dragTimestamp !== null ? dragTimestamp : sfx.timestamp;
                  return (
                    <div
                      key={sfx.id || i}
                      className="absolute top-1/2 -translate-y-1/2 h-5 bg-amber-700/80 rounded border border-amber-600/80 px-1 flex items-center cursor-grab select-none"
                      style={{ left: `${duration > 0 ? (ts / duration) * 100 : 0}%` }}
                      onMouseDown={(e) => handleSfxMouseDown(e, sfx)}
                      onDoubleClick={() => onRemoveSoundEffect?.(sfx.id)}
                    >
                      {sfx.trackType}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="h-10 flex items-center">
              <div className="w-full h-7 bg-neutral-900 rounded border border-neutral-700/50 flex items-center px-2 relative text-white text-[10px] font-medium">
                <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 mr-1 shrink-0" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path></svg>
                Camera
                <div className="bg-white/20 px-1 rounded ml-1 text-[8px] border border-white/30">Z {camera.zoom.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
