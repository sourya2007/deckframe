import {useEffect, useState} from 'react';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function HudOverlay() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [passthrough, setPassthrough] = useState(false);
  const api = window.electronAPI!;

  useEffect(() => api.onHudTick(p => setElapsed(p.elapsedSeconds)), [api]);

  const control = (action: 'stop' | 'pause' | 'resume') => {
    api.hudControl(action);
    if (action === 'pause') setPaused(true);
    if (action === 'resume') setPaused(false);
  };

  const togglePassthrough = () => {
    const next = !passthrough;
    setPassthrough(next);
    api.setHudPassthrough(next);
  };

  return (
    <div className={`w-full h-full flex items-center gap-2 px-3 rounded-xl bg-[#1C1C1F]/95 border border-neutral-800 shadow-xl backdrop-blur ${passthrough ? 'opacity-60' : ''}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${paused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
      <span className="text-sm text-neutral-200 tabular-nums font-medium">{fmt(elapsed)}</span>
      <div className="flex-1" />
      <button onClick={() => control(paused ? 'resume' : 'pause')} className="text-[11px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button onClick={togglePassthrough} title="Let clicks pass through the HUD" className="text-[11px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
        {passthrough ? 'Anchor' : 'Passthrough'}
      </button>
      <button onClick={() => control('stop')} className="text-[11px] px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium">
        Stop
      </button>
    </div>
  );
}
