import {useEffect, useState} from 'react';

export function CountdownOverlay() {
  const [remaining, setRemaining] = useState(
    Number(new URLSearchParams(window.location.search).get('delay')) || 3,
  );

  useEffect(() => {
    const unsub = window.electronAPI!.onCountdownTick(p => setRemaining(p.remaining));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.electronAPI!.cancelCountdown();
    };
    window.addEventListener('keydown', onKey);
    return () => { unsub(); window.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div
      className="w-full h-full flex items-center justify-center cursor-pointer select-none"
      onClick={() => window.electronAPI!.cancelCountdown()}
      title="Click or press Esc to cancel"
    >
      <div className="w-40 h-40 rounded-full bg-black/70 border-2 border-orange-500/80 backdrop-blur flex items-center justify-center shadow-2xl">
        <span className="text-7xl font-bold text-white tabular-nums">{remaining}</span>
      </div>
    </div>
  );
}
