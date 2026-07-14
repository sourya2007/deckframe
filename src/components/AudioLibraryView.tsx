import { useState, useEffect, useRef } from 'react';
import { Search, Play, Pause, Volume2 } from 'lucide-react';

export function AudioLibraryView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<{name:string, path:string}[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioPath = 'C:\\Users\\User\\Documents\\DeckFrame\\Sounds';
    window.electronAPI?.scanAudioFiles(audioPath).then(setFiles);
  }, []);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  function playFile(path: string) {
    audioRef.current?.pause();
    const audio = new Audio(path);
    audio.addEventListener('timeupdate', () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    });
    audio.addEventListener('ended', () => { setIsPlaying(false); setProgress(0); });
    audio.play();
    audioRef.current = audio;
    setIsPlaying(true);
  }

  useEffect(() => {
    if (!isPlaying) { audioRef.current?.pause(); return; }
  }, [isPlaying]);

  const sections = [
    { title: 'SFX', items: files.filter(f => f.name.toLowerCase().includes('whoosh') || f.name.toLowerCase().includes('sfx')) },
    { title: 'Ambient', items: files.filter(f => f.name.toLowerCase().includes('ambient') || f.name.toLowerCase().includes('drone') || f.name.toLowerCase().includes('cinematic')) },
    { title: 'UI Clicks', items: files.filter(f => f.name.toLowerCase().includes('click')) },
    { title: 'Music', items: files.filter(f => f.name.toLowerCase().includes('music') || f.name.toLowerCase().includes('somnath')) },
    { title: 'Other', items: files.filter(f => !['sfx','whoosh','ambient','drone','cinematic','click','music','somnath'].some(kw => f.name.toLowerCase().includes(kw))) },
  ].filter(s => s.items.length > 0);

  return (
    <div className="flex-1 flex bg-[#131316] min-h-0">
      <div className="flex-1 flex flex-col min-w-0 border-r border-neutral-800">
        <div className="h-14 border-b border-neutral-800 flex items-center px-6 justify-between shrink-0">
          <h1 className="text-sm font-medium text-neutral-300">Sound Asset Library Management</h1>
          <div className="flex gap-2">
            <select className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-400 outline-none">
              <option>Category</option>
            </select>
            <select className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-400 outline-none">
              <option>Mood</option>
            </select>
            <select className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-400 outline-none">
              <option>Duration</option>
            </select>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {sections.map((section, i) => (
            <div key={i}>
              <h2 className="text-sm font-medium text-neutral-300 mb-4">{section.title} ({section.items.length})</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {section.items.map((item, j) => {
                  const key = `${i}-${item.path}`;
                  const active = activeItem === key;
                  return (
                    <div key={key} onClick={() => { setActiveItem(key); playFile(item.path); }} className={`bg-neutral-900/50 border rounded-lg p-3 flex flex-col gap-3 cursor-pointer transition-colors ${active ? 'border-blue-500 bg-blue-500/5' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-medium truncate ${active ? 'text-blue-400' : 'text-neutral-300'}`}>{item.name}</span>
                      </div>
                      <div className="h-10 w-full flex items-center justify-center opacity-80">
                        <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxwYXRoIGQ9Ik0wLDUwIFExMCwyMCAyMCw1MCBUMDAsNTAgVDYwLDUwIFQ4MCw1MCBUMTAwLDUwIiBzdHJva2U9IiMzYjgyZjYiIGZpbGw9Im5vbmUiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==')] bg-center bg-no-repeat bg-contain" style={{ filter: active ? 'drop-shadow(0 0 4px rgba(59,130,246,0.5))' : 'none', opacity: active ? 1 : 0.6 }} />
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
        </div>
        
        <div className="h-20 border-t border-neutral-800 p-4 flex items-center gap-4 bg-neutral-900/50 shrink-0">
          <button onClick={() => setIsPlaying(p => !p)} className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shrink-0 hover:bg-blue-400 transition-colors">
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
  )
}
