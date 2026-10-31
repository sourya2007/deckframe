import { useState } from 'react';
import type { RecentProject } from '../types/electron';

interface TopBarProps {
  onSave?: () => void;
  onOpen?: () => void;
  onOpenRecent?: (filePath: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function TopBar({ onSave, onOpen, onOpenRecent, onUndo, onRedo, canUndo, canRedo }: TopBarProps) {
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<RecentProject[]>([]);

  const toggleRecent = async () => {
    const next = !recentOpen;
    setRecentOpen(next);
    if (next) {
      const list = await window.electronAPI?.getRecentProjects?.();
      setRecent(list ?? []);
    }
  };

  return (
    <div className="h-10 border-b border-neutral-800/80 flex items-center px-4 justify-between bg-[#131316] z-10 shrink-0 text-xs">
      <div className="flex items-center gap-6">
        <div className="font-medium text-neutral-200 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-500" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 22 2 22"></polygon></svg>
          <span className="text-sm">DeckFrame</span>
        </div>
        <div className="flex gap-4 text-neutral-400 font-medium ml-4 items-center">
          <button onClick={onOpen} className="hover:text-white cursor-pointer">Open</button>
          <div className="relative">
            <button onClick={toggleRecent} className="hover:text-white cursor-pointer">Recent</button>
            {recentOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRecentOpen(false)} />
                <div className="absolute left-0 top-6 z-50 w-80 bg-[#1C1C1F] border border-neutral-800 rounded-lg shadow-2xl overflow-hidden">
                  {recent.length === 0 ? (
                    <div className="px-4 py-3 text-neutral-500">No recent projects yet.</div>
                  ) : recent.map(item => (
                    <button
                      key={item.path}
                      onClick={() => { setRecentOpen(false); onOpenRecent?.(item.path); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0"
                      title={item.path}
                    >
                      <div className="text-neutral-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-neutral-500 truncate">
                        {new Date(item.savedAt).toLocaleDateString()} · {item.path}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={onSave} className="hover:text-white cursor-pointer">Save</button>
          <div className="w-px h-4 bg-neutral-800 mx-1" />
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={canUndo ? 'hover:text-white cursor-pointer' : 'text-neutral-700 cursor-not-allowed'}
          >Undo</button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            className={canRedo ? 'hover:text-white cursor-pointer' : 'text-neutral-700 cursor-not-allowed'}
          >Redo</button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden">
          {/* Avatar placeholder */}
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-neutral-500 p-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </div>
      </div>
    </div>
  );
}
