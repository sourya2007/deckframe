import { useState, useEffect, useRef } from 'react';
import { Search, Play, Pause, Volume2, Plus } from 'lucide-react';

interface AudioLibraryViewProps {
  onAddSoundEffect?: (file: { name: string; path: string }) => void;
}

const SECTIONS = ['SFX', 'Ambient', 'UI Clicks', 'Music', 'Other'];
const KEYWORDS: Record<string, string[]> = {
  SFX: ['whoosh', 'sfx'],
  Ambient: ['ambient', 'drone', 'cinematic'],
  'UI Clicks': ['click'],
  Music: ['music', 'somnath'],
};

const toFileUrl = (p: string) => 'file:///' + p.replace(/\\/g, '/');

function categoryOf(name: string): string {
  const n = name.toLowerCase();
  for (const section of SECTIONS) {
    if (section === 'Other') continue;
    if (KEYWORDS[section].some(k => n.includes(k))) return section;
  }
  return 'Other';
}

export function AudioLibraryView({ onAddSoundEffect }: AudioLibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [durationFilter, setDurationFilter] = useState('any');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [soundPath, setSoundPath] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await window.electronAPI?.loadSettings?.();
      if (saved?.soundPath) setSoundPath(saved.soundPath);
    })();
  }, []);

  useEffect(() => {
    if (!soundPath) return;
    window.electronAPI?.scanAudioFiles(soundPath).then(setFiles);
  }, [soundPath]);

  // durations come from the browser's metadata loader; only needed for the
  // length filter, so a failed/unsupported file is simply excluded from it
  useEffect(() => {
    if (files.length === 0) { setDurations({}); return; }
    let cancelled = false;
    const found: Record<string, number> = {};
    let pending = files.length;
    const done = (path: string, audio: HTMLAudioElement) => {
      if (cancelled) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) found[path] = audio.duration;
      if (--pending === 0) setDurations(found);
    };
    for (const file of files) {
      const audio = new Audio(toFileUrl(file.path));
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => done(file.path, audio), { once: true });
      audio.addEventListener('error', () => done(file.path, audio), { once: true });
    }
    return () => { cancelled = true; };
  }, [files]);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  useEffect(() => {
    if (!added) return;
    const id = setTimeout(() => setAdded(null), 2500);
    return () => clearTimeout(id);
  }, [added]);

  function playFile(path: string) {
    audioRef.current?.pause();
    const audio = new Audio(toFileUrl(path));
    audio.addEventListener('timeupdate', () => {
      if (audio.duration > 0) setProgress((audio.currentTime / audio.duration) * 100);
    });
    audio.addEventListener('ended', () => { setIsPlaying(false); setProgress(0); });
    audio.play().catch(() => setIsPlaying(false));
    audioRef.current = audio;
    setIsPlaying(true);
    setProgress(0);
  }

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().catch(() => setIsPlaying(false)); setIsPlaying(true); }
  };

  const query = searchQuery.trim().toLowerCase();
  const matches = files.filter(file => {
    if (query && !file.name.toLowerCase().includes(query)) return false;
    if (category !== 'All' && categoryOf(file.name) !== category) return false;
    const duration = durations[file.path];
    if (durationFilter === 'short' && !(duration !== undefined && duration < 3)) return false;
    if (durationFilter === 'medium' && !(duration !== undefined && duration >= 3 && duration <= 10)) return false;
    if (durationFilter === 'long' && !(duration !== undefined && duration > 10)) return false;
    return true;
  });

  const sections = SECTIONS
    .map(title => ({ title, items: matches.filter(f => categoryOf(f.name) === title) }))
    .filter(section => section.items.length > 0);

  return (
    <div className="flex-1 flex bg-[#131316] min-h-0">
      <div className="flex-1 flex flex-col min-w-0 border-r border-neutral-800">
        <div className="h-14 border-b border-neutral-800 flex items-center px-6 justify-between shrink-0">
          <h1 className="text-sm font-medium text-neutral-300">Sound Asset Library Management</h1>
          <div className="flex gap-2">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-400 outline-none"
            >
              <option value="All">All categories</option>
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={durationFilter}
              onChange={e => setDurationFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-400 outline-none"
            >
              <option value="any">Any length</option>
              <option value="short">Under 3s</option>
              <option value="medium">3–10s</option>
              <option value="long">Over 10s</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {sections.length === 0 && (
            <div className="text-sm text-neutral-500">
              {!soundPath
                ? 'Set a sound library folder in Settings.'
                : files.length === 0
                  ? 'No audio files found in that folder.'
                  : 'No sounds match these filters.'}
            </div>
          )}
          {sections.map(section => (
            <div key={section.title}>
              <h2 className="text-sm font-medium text-neutral-300 mb-4">{section.title} ({section.items.length})</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {section.items.map(item => {
                  const key = item.path;
                  const active = activeItem === key;
                  return (
                    <div key={key} onClick={() => { setActiveItem(key); playFile(item.path); }} className={`bg-neutral-900/50 border rounded-lg p-3 flex flex-col gap-3 cursor-pointer transition-colors ${active ? 'border-blue-500 bg-blue-500/5' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-xs font-medium truncate ${active ? 'text-blue-400' : 'text-neutral-300'}`}>{item.name}</span>
                        {onAddSoundEffect && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onAddSoundEffect(item);
                              setAdded(item.name);
                            }}
                            title="Add at the playhead"
                            className="shrink-0 w-5 h-5 rounded bg-neutral-800 hover:bg-blue-600 text-neutral-300 hover:text-white flex items-center justify-center"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                      <div className="h-10 w-full flex items-center justify-center opacity-80">
                        <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZW5naXQ9IjEwMCUiPjxwYXRoIGQ9Ik0wLDUwIFExMCwyMCAyMCw1MCBUMDAsNTAgVDYwLDUwIFQ4MCw1MCBUMTAwLDUwIiBzdHJva2U9IiMzYjgyZjYiIGZpbGw9Im5vbmUiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==')] bg-center bg-no-repeat bg-contain" style={{ filter: active ? 'drop-shadow(0 0 4px rgba(59,130,246,0.5))' : 'none', opacity: active ? 1 : 0.6 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-80 bg-[#0E0E11] flex flex-col">
        <div className="h-14 border-b border-neutral-800 px-4 flex items-center shrink-0">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
            <input
              placeholder="Search Audio..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-full pl-8 pr-4 py-1.5 text-xs text-neutral-200 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 p-6 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center opacity-80 pointer-events-none">
            <div className="w-full h-2/3 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxwYXRoIGQ9Ik0wLDUwIFExMCwwIDIwLDUwIFQ0MCw1MCBUNjAsNTAgVDgwLDUwIFQxMDAsNTAiIHN0cm9rZT0iIzNiODJmNiIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PC9zdmc+')] bg-center bg-no-repeat bg-cover" style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.6))' }} />
          </div>
          {added && (
            <div className="relative z-10 text-center text-[11px] text-emerald-400">
              Added “{added}” at the playhead
            </div>
          )}
        </div>

        <div className="h-20 border-t border-neutral-800 p-4 flex items-center gap-4 bg-neutral-900/50 shrink-0">
          <button onClick={togglePlay} className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shrink-0 hover:bg-blue-400 transition-colors">
            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <Volume2 size={16} className="text-neutral-400 shrink-0" />
          <div className="flex-1 flex items-center gap-2">
            <div className="h-1 flex-1 bg-neutral-800 rounded-full overflow-hidden relative">
              <div className="absolute left-0 top-0 bottom-0 bg-blue-500 rounded-full" style={{ width: `${progress}%` }}></div>
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow" style={{ left: `${progress}%` }}></div>
            </div>
          </div>
          <div className="text-[10px] text-neutral-400 font-medium shrink-0">{progress.toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}
