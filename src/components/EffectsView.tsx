import type { MotionEffectType } from '../types/project';

// Only effects the shared scene can actually render. Clicking adds a 2s region
// at the playhead; adjust intensity and timing in the timeline FX lane.
const effects: Array<{ name: string; type: MotionEffectType; blurb: string }> = [
  { name: 'Camera Shake', type: 'shake', blurb: 'Handheld jitter for emphasis' },
  { name: 'Highlight Pulse', type: 'pulse', blurb: 'Smooth zoom swell on the video' },
  { name: 'Glitch', type: 'glitch', blurb: 'Digital glitch burst' },
  { name: 'Fade to Black', type: 'fade-black', blurb: 'Dip to black and back' },
  { name: 'Fade to White', type: 'fade-white', blurb: 'Dip to white and back' },
];

export function EffectsView({ onEffectSelect }: { onEffectSelect?: (type: MotionEffectType) => void }) {
  return (
    <div className="flex-1 bg-[#131316] flex flex-col min-h-0">
      <div className="p-4 border-b border-neutral-800 shrink-0">
        <h2 className="text-sm font-medium text-neutral-200">Motion effects</h2>
        <p className="text-[11px] text-neutral-500 mt-1">
          Click to add a 2s effect at the playhead. Edit intensity and timing in the FX lane.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
        {effects.map(fx => (
          <button
            key={fx.type}
            onClick={() => onEffectSelect?.(fx.type)}
            className="text-left rounded-lg border border-neutral-800 hover:border-blue-500 bg-neutral-900 p-4 transition-colors"
          >
            <div className="text-sm text-neutral-200 font-medium">{fx.name}</div>
            <div className="text-[11px] text-neutral-500 mt-1">{fx.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
