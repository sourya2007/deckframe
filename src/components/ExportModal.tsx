import { useState, useEffect } from 'react';

interface ExportModalProps {
  onClose: () => void;
  videoPath?: string | null;
  events: any[];
  duration: number;
}

export function ExportModal({ onClose, videoPath, events, duration }: ExportModalProps) {
  const [format, setFormat] = useState('mp4');
  const [resolution, setResolution] = useState('3840x2160');
  const [quality, setQuality] = useState(80);
  const [destPath, setDestPath] = useState('C:\\Users\\Admin\\Videos\\DeckFrame_Proj');
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [eta, setEta] = useState('');

  useEffect(() => {
    if (!rendering) return;
    const unsub = window.electronAPI?.onExportProgress((pct: number) => {
      setProgress(pct);
      if (pct < 100) {
        setEta(`Estimated time remaining: 0${Math.floor((100 - pct) / 20)} minutes, ${((100 - pct) % 20) * 3} seconds`);
      } else {
        setEta('Complete');
      }
    });
    return () => { unsub?.(); };
  }, [rendering]);

  const handleRender = async () => {
    if (!window.electronAPI || !window.electronAPI.exportVideo) {
      alert('Export requires the Electron environment.');
      return;
    }
    setRendering(true);
    setProgress(0);
    setEta('Starting render...');
    try {
      await window.electronAPI.exportVideo({ format, resolution, quality, destPath, events, duration, videoPath });
      setEta('Export complete!');
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
      setRendering(false);
      setProgress(0);
    }
  };

  const handleStop = () => {
    setRendering(false);
    setProgress(0);
    setEta('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1C1C1F] border border-neutral-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 pb-4">
          <h2 className="text-xl font-medium text-white mb-6">Export Project</h2>
          
          <div className="grid grid-cols-[1fr_1fr] gap-8">
            <div className="space-y-6">
              <div>
                <label className="text-sm text-neutral-400 mb-2 block">Format</label>
                <div className="space-y-2">
                  {['mp4','webm','prores'].map(f => {
                    const sel = format === f;
                    return (
                      <div key={f} onClick={() => setFormat(f)} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${sel ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-neutral-800 bg-neutral-900/50'}`}>
                        <div className={`w-4 h-4 rounded-full border-4 ${sel ? 'border-emerald-500 bg-[#1C1C1F]' : 'border-neutral-600'}`}></div>
                        <span className={`text-sm font-medium ${sel ? 'text-emerald-500' : 'text-neutral-400'}`}>
                          {f === 'mp4' ? 'MP4 (H.264)' : f === 'webm' ? 'WebM (VP9)' : 'ProRes (422 HQ)'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 mb-2 block">Resolution</label>
                <div className="space-y-2">
                  {[
                    { label: '4K (3840x2160)', val: '3840x2160' },
                    { label: '1080p (1920x1080)', val: '1920x1080' },
                    { label: 'Custom', val: 'custom' },
                  ].map(r => {
                    const sel = resolution === r.val;
                    return (
                      <div key={r.val} onClick={() => setResolution(r.val)} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${sel ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-neutral-800 bg-neutral-900/50'}`}>
                        <div className={`w-4 h-4 rounded-full border-4 ${sel ? 'border-emerald-500 bg-[#1C1C1F]' : 'border-neutral-600'}`}></div>
                        <span className={`text-sm font-medium ${sel ? 'text-emerald-500' : 'text-neutral-400'}`}>{r.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-neutral-400">Quality</label>
                </div>
                <div className="pt-2 pb-6 relative">
                  <input type="range" min="10" max="100" value={quality} onChange={e => setQuality(Number(e.target.value))} className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow" />
                  <div className="absolute bottom-0 left-0 text-[10px] text-neutral-500">Standard</div>
                  <div className="absolute bottom-0 right-0 text-[10px] text-neutral-500">High</div>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 mb-2 block">Destination Path</label>
                <div className="flex gap-2">
                  <input readOnly value={destPath} className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-400 outline-none truncate" />
                  <button onClick={async () => { const d = await window.electronAPI?.selectDirectory(); if (d) setDestPath(d); }} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-lg text-sm transition-colors">Browse...</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-neutral-900/50 border-t border-neutral-800 mt-2 space-y-4">
           <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-neutral-300 font-medium">Render Progress</span>
                <span className="text-neutral-400">{progress}% Complete</span>
              </div>
              <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{width: `${progress}%`}}></div>
              </div>
              <div className="text-xs text-neutral-500 mt-2">{eta || 'Ready'}</div>
           </div>
           <div className="flex justify-between items-center pt-2">
             <button onClick={onClose} className="px-6 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">Cancel</button>
             <div className="flex gap-3">
                <button onClick={handleRender} disabled={rendering || !videoPath} className={`px-8 py-2 rounded-lg text-sm font-medium ${rendering || !videoPath ? 'bg-emerald-500/20 text-emerald-500 cursor-not-allowed' : 'bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer'} transition-colors`}>{rendering ? 'Rendering...' : 'Render'}</button>
                {rendering && <button onClick={handleStop} className="px-6 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer">Stop Render</button>}
             </div>
           </div>
        </div>
      </div>
    </div>
  )
}
