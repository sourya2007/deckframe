import { useRef, type ChangeEvent, type DragEvent } from 'react';
import { PlaySquare, Settings, Mic } from 'lucide-react';
import { WALLPAPERS } from '../lib/wallpapers';
import type { FrameStyle } from '../types/project';

interface EmptyStateViewProps {
  onRecord: () => void;
  isRecording: boolean;
  onVideoImport?: (file: File) => void;
  recordingTimer?: string;
  webcamEnabled?: boolean;
  onToggleWebcam?: (enabled: boolean) => void;
  frame?: FrameStyle;
  onFrameChange?: (frame: Partial<FrameStyle>) => void;
}

export function EmptyStateView({ onRecord, isRecording, onVideoImport, recordingTimer, webcamEnabled, onToggleWebcam, frame, onFrameChange }: EmptyStateViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onVideoImport) onVideoImport(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && onVideoImport) onVideoImport(file);
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  if (isRecording) {
    return (
      <div className="flex-1 bg-[#0E0E11] flex items-center justify-center p-12">
         {/* The recording window layout */}
         <div className="w-full max-w-4xl bg-[#1C1C1F] rounded-xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col relative">
           <div className="h-14 flex items-center justify-between px-6 bg-[#131316] border-b border-neutral-800">
             <div className="text-white font-medium">DeckFrame</div>
             <div className="flex items-center gap-3">
               <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-neutral-200 font-medium">{recordingTimer || '00:00:00'}</span>
             </div>
             <div className="flex items-center gap-4 text-neutral-400">
               <span className="flex items-center gap-1.5 hover:text-white cursor-pointer"><Settings size={14}/> Settings</span>
               <span className="hover:text-white cursor-pointer">—</span>
               <span className="hover:text-white cursor-pointer">□</span>
               <span className="hover:text-white cursor-pointer">✕</span>
             </div>
           </div>
           
           <div className="relative aspect-video bg-[#3F51B5]/10 p-8 flex items-center justify-center">
             <div className="absolute inset-4 border-2 border-dashed border-white/20 pointer-events-none"></div>
             {/* Mock desktop background inside */}
             <div className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1000&q=80)' }}></div>
             
             {/* Overlay controls */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-xl rounded-[2rem] p-6 flex gap-6 shadow-2xl border border-white/10 z-10">
                <button onClick={onRecord} className="flex flex-col items-center gap-2 group">
                  <div className="w-16 h-16 bg-[#ff4a4a] rounded-full flex items-center justify-center group-hover:bg-[#ff5c5c] transition-colors shadow-lg">
                     <div className="w-5 h-5 bg-white rounded-sm"></div>
                  </div>
                  <span className="text-white text-sm font-medium drop-shadow-md">Stop</span>
                </button>
                <button className="flex flex-col items-center gap-2 group">
                  <div className="w-16 h-16 bg-neutral-600/80 rounded-full flex items-center justify-center group-hover:bg-neutral-500/80 transition-colors shadow-lg">
                     <div className="flex gap-1.5">
                        <div className="w-1.5 h-5 bg-white rounded-sm"></div>
                        <div className="w-1.5 h-5 bg-white rounded-sm"></div>
                     </div>
                  </div>
                  <span className="text-white text-sm font-medium drop-shadow-md">Pause</span>
                </button>
             </div>
           </div>
           
           <div className="h-12 bg-[#131316] border-t border-neutral-800 px-6 flex items-center justify-between shrink-0">
             <div className="text-neutral-400 text-sm">Recording in Progress - Region: Full Screen</div>
             <div className="flex items-center gap-4">
               {/* Audio meters */}
               <div className="flex items-end gap-[3px] h-4">
                 <div className="w-[3px] bg-emerald-500 h-[30%] rounded-sm"></div>
                 <div className="w-[3px] bg-emerald-500 h-[60%] rounded-sm"></div>
                 <div className="w-[3px] bg-emerald-500 h-[80%] rounded-sm"></div>
                 <div className="w-[3px] bg-emerald-500 h-[40%] rounded-sm"></div>
                 <div className="w-[3px] bg-emerald-500 h-[20%] rounded-sm"></div>
               </div>
               <div className="w-6 h-6 rounded-full bg-neutral-800/80 flex items-center justify-center text-emerald-500 border border-neutral-700">
                  <Mic size={12} strokeWidth={2.5} />
               </div>
             </div>
           </div>
         </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 bg-[#0E0E11]">
      <div className="flex-1 flex flex-col p-6 items-center justify-center relative border-r border-neutral-800">
        
        {/* Editor Grid Background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
        
        <div className="w-full max-w-md space-y-6 relative z-10 flex flex-col items-center">
          <input
            type="file"
            accept="video/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <button 
            onClick={onRecord}
            className="w-full py-4 rounded-3xl text-white font-medium text-lg transition-all shadow-lg bg-blue-600 hover:bg-blue-500 shadow-blue-600/20"
          >
            Start Recording
          </button>

          <label className="flex items-center gap-2 text-neutral-400 text-sm -mt-2">
            <input
              type="checkbox"
              checked={!!webcamEnabled}
              onChange={e => onToggleWebcam?.(e.target.checked)}
            />
            Include webcam bubble
          </label>
          
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleDropZoneClick}
            className="w-full h-32 border-2 border-dashed border-neutral-700/50 rounded-3xl flex flex-col items-center justify-center text-neutral-500 gap-2 hover:border-neutral-600 hover:bg-neutral-800/30 transition-colors cursor-pointer"
          >
             <PlaySquare size={24} className="opacity-50" />
             <span className="text-sm font-medium">or Drag video to start editing</span>
          </div>
        </div>
      </div>
      
      {/* Right Properties Panel */}
      <div className="w-72 bg-[#131316] p-6 flex flex-col gap-6 shrink-0 text-sm">
        <div>
          <h3 className="text-neutral-200 font-medium mb-4">Background</h3>
          <div className="space-y-2">
            {(['image', 'solid', 'gradient'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => onFrameChange?.({ mode })}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  frame?.mode === mode
                    ? 'border-blue-500/60 bg-blue-500/10 text-neutral-100'
                    : 'border-neutral-800 text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {mode === 'image' ? 'Image' : mode === 'solid' ? 'Color' : 'Gradient'}
              </button>
            ))}
          </div>
          {frame?.mode === 'image' && (
            <>
              <div className="grid grid-cols-4 gap-1 mt-3 max-h-48 overflow-y-auto">
                {WALLPAPERS.map(w => (
                  <button
                    key={w.id}
                    title={w.label}
                    onClick={() => onFrameChange?.({ wallpaper: w.id })}
                    className={`aspect-video overflow-hidden rounded border ${frame.wallpaper === w.id ? 'border-blue-500' : 'border-neutral-800'}`}
                  >
                    <img src={w.url} alt={w.label} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              <button
                onClick={() => wallpaperInputRef.current?.click()}
                className="w-full py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-500 mt-3 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
              >
                Upload Custom
              </button>
              <input
                ref={wallpaperInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const path = window.electronAPI?.filePathForFile?.(file);
                  onFrameChange?.({ mode: 'image', wallpaper: path || URL.createObjectURL(file) });
                }}
              />
            </>
          )}
          {(frame?.mode === 'solid' || frame?.mode === 'gradient') && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="color"
                value={frame.colorA}
                onChange={e => onFrameChange?.({ colorA: e.target.value })}
                className="w-8 h-6 bg-transparent border-0"
              />
              {frame.mode === 'gradient' && (
                <input
                  type="color"
                  value={frame.colorB}
                  onChange={e => onFrameChange?.({ colorB: e.target.value })}
                  className="w-8 h-6 bg-transparent border-0"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
