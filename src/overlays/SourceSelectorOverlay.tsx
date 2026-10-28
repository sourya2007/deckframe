import {useEffect, useState} from 'react';
import type {SourceInfo} from '../types/electron';

export function SourceSelectorOverlay() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const api = window.electronAPI!;

  useEffect(() => {
    api.getSources(true).then(setSources);
  }, [api]);

  const cancel = () => api.cancelSourceSelector();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full h-full rounded-xl bg-[#1C1C1F] border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-medium text-white mb-0.5">Select Source</h2>
        <p className="text-sm text-neutral-400">Choose a screen or window to record</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-3 grid grid-cols-2 gap-2 content-start">
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => api.sourcePicked(s.id)}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 hover:border-neutral-700 transition-colors text-left overflow-hidden"
          >
            {s.thumbnail && (
              <img src={s.thumbnail} alt="" className="w-full aspect-video object-cover bg-black" />
            )}
            <span className="block text-xs text-neutral-200 truncate px-2 py-1.5">{s.name}</span>
          </button>
        ))}
        {sources.length === 0 && <span className="text-sm text-neutral-500 col-span-2">Loading sources…</span>}
      </div>

      <div className="p-5 pt-2">
        <button onClick={cancel} className="w-full py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
