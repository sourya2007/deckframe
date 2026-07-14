export interface SourceInfo {
  id: string;
  name: string;
}

interface SourceSelectorProps {
  sources: SourceInfo[];
  onSelect: (sourceId: string) => void;
  onCancel: () => void;
}

export function SourceSelector({ sources, onSelect, onCancel }: SourceSelectorProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1C1C1F] border border-neutral-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-medium text-white mb-1">Select Source</h2>
          <p className="text-sm text-neutral-400 mb-4">Choose a screen or window to record</p>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sources.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 hover:border-neutral-700 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm text-neutral-200 truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
