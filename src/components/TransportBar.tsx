import { useRef, useEffect } from 'react';

interface TransportBarProps {
  playhead: number;
  duration: number;
  onSeek: (p: number) => void;
  onPlayPause: () => void;
  paused: boolean;
}

export function TransportBar({ playhead, duration, onSeek, onPlayPause, paused }: TransportBarProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isPlaying = !paused;

  // keyboard listeners
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.key === ' ') {
        e.preventDefault();
        onPlayPause();
      } else if (e.key === 'ArrowLeft') {
        onSeek(Math.max(0, playhead - 100));
      } else if (e.key === 'ArrowRight') {
        onSeek(Math.min(duration, playhead + 100));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [playhead, duration, onSeek, onPlayPause]);

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const target = Math.max(0, Math.min(duration, ratio * duration));
    onSeek(target);
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="h-14 bg-[#0E0E11] border-t border-neutral-800 flex items-center px-4 shrink-0 text-neutral-300 text-sm">
      {/* Play/Pause button */}
      <button
        onClick={onPlayPause}
        className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-white transition-colors"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="6" width="4" height="12" /><rect x="14" y="6" width="4" height="12" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="5 4 15 12 5 20 5 4" /></svg>
        )}
      </button>

      {/* Seek slider */}
      <div
        ref={sliderRef}
        className="flex-1 mx-4 h-1 bg-neutral-700 rounded-full cursor-pointer relative"
        onMouseDown={handleSliderMouseDown}
      >
        <div
          className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
          style={{ width: duration > 0 ? `${(playhead / duration) * 100}%` : '0%' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full border border-neutral-800"
          style={{ left: duration > 0 ? `calc(${(playhead / duration) * 100}% - 4px)` : '0' }}
        />
      </div>

      {/* Time display */}
      <div className="text-neutral-400 tabular-nums min-w-[5rem] text-center">
        {formatTime(playhead)} / {formatTime(duration)}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Extra controls placeholder */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>Speed: 1x</span>
        <span className="w-px h-4 bg-neutral-800" />
        <span>Zoom: 1.0x</span>
      </div>
    </div>
  );
}