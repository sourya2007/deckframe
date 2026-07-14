import { useState, useEffect } from 'react';
import { EyeOff } from 'lucide-react';

const DEFAULT_SETTINGS = {
  provider: 'claude' as const,
  claudeKey: '',
  openaiKey: '',
  soundPath: 'C:\\Users\\User\\Documents\\DeckFrame\\Sounds',
  autoScan: true,
  communityPack: false,
};

export function SettingsView() {
  const [provider, setProvider] = useState<'claude' | 'openai' | 'local'>(DEFAULT_SETTINGS.provider);
  const [claudeKey, setClaudeKey] = useState(DEFAULT_SETTINGS.claudeKey);
  const [openaiKey, setOpenaiKey] = useState(DEFAULT_SETTINGS.openaiKey);
  const [soundPath, setSoundPath] = useState(DEFAULT_SETTINGS.soundPath);
  const [autoScan, setAutoScan] = useState(DEFAULT_SETTINGS.autoScan);
  const [communityPack, setCommunityPack] = useState(DEFAULT_SETTINGS.communityPack);

  useEffect(() => {
    (async () => {
      const saved = await window.electronAPI?.loadSettings();
      if (saved) {
        if (saved.provider) setProvider(saved.provider);
        if (saved.claudeKey) setClaudeKey(saved.claudeKey);
        if (saved.openaiKey) setOpenaiKey(saved.openaiKey);
        if (saved.soundPath) setSoundPath(saved.soundPath);
        if (saved.autoScan !== undefined) setAutoScan(saved.autoScan);
        if (saved.communityPack !== undefined) setCommunityPack(saved.communityPack);
      }
    })();
  }, []);

  const handleSave = async () => {
    const settings = { provider, claudeKey, openaiKey, soundPath, autoScan, communityPack };
    if (window.electronAPI?.saveSettings) {
      await window.electronAPI.saveSettings(settings);
    }
    console.log('Settings saved:', settings);
    alert('Settings saved!');
  };

  const handleReset = () => {
    setProvider(DEFAULT_SETTINGS.provider);
    setClaudeKey(DEFAULT_SETTINGS.claudeKey);
    setOpenaiKey(DEFAULT_SETTINGS.openaiKey);
    setSoundPath(DEFAULT_SETTINGS.soundPath);
    setAutoScan(DEFAULT_SETTINGS.autoScan);
    setCommunityPack(DEFAULT_SETTINGS.communityPack);
  };

  const handleBrowse = async () => {
    const dir = await window.electronAPI?.selectDirectory();
    if (dir) setSoundPath(dir);
  };

  return (
    <div className="flex-1 bg-[#131316] overflow-y-auto p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-white mb-8">Application Settings</h1>
        
        {/* AI Config */}
        <section className="mb-10">
           <h2 className="text-lg text-neutral-200 mb-4">AI Configuration</h2>
           <div className="space-y-4">
             <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-neutral-400 text-sm">Provider</span>
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800/80 w-fit">
                  <button
                    onClick={() => setProvider('claude')}
                    className={`px-8 py-1.5 rounded-md text-sm font-medium ${provider === 'claude' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >Claude</button>
                  <button
                    onClick={() => setProvider('openai')}
                    className={`px-8 py-1.5 rounded-md text-sm font-medium ${provider === 'openai' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >OpenAI</button>
                  <button
                    onClick={() => setProvider('local')}
                    className={`px-8 py-1.5 rounded-md text-sm font-medium ${provider === 'local' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >Local</button>
                </div>
             </div>
             <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-neutral-400 text-sm">API Key (Claude)</span>
                <div className="relative">
                  <input
                    type="password"
                    value={claudeKey}
                    onChange={e => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-300 text-sm outline-none placeholder-neutral-600"
                  />
                  <EyeOff size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                </div>
             </div>
             <div className="grid grid-cols-[200px_1fr] items-center gap-4">
                <span className="text-neutral-400 text-sm">API Key (OpenAI)</span>
                <div className="relative">
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={e => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-300 text-sm outline-none placeholder-neutral-600"
                  />
                  <EyeOff size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                </div>
             </div>
           </div>
        </section>

        {/* Hotkey Mapping */}
        <section className="mb-10">
           <h2 className="text-lg text-neutral-200 mb-4 border-b border-neutral-800/80 pb-2">Hotkey Mapping</h2>
           <div className="grid grid-cols-[1fr_1fr] text-sm text-neutral-400 mb-2 font-medium">
             <div>Action</div>
             <div>Shortcut (Monospace)</div>
           </div>
           <div className="space-y-2">
             {[
               { label: 'Record/Pause', key: 'Ctrl + Shift + R' },
               { label: 'Stop Recording', key: 'Ctrl + Shift + S' },
               { label: 'Add Marker', key: 'M' },
               { label: 'Split Clip', key: 'S' },
               { label: 'Toggle AI Analysis', key: 'Ctrl + Alt + A' },
               { label: 'Open Settings', key: 'Ctrl + ,' },
             ].map((hk, i) => (
               <div key={i} className="grid grid-cols-[1fr_1fr] items-center gap-4 py-1.5">
                 <div className="text-neutral-300 text-sm">{hk.label}</div>
                 <div className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-neutral-400 font-mono text-xs w-full">
                   {hk.key}
                 </div>
               </div>
             ))}
           </div>
        </section>

        {/* Sound Asset Library Management */}
        <section className="mb-10">
           <h2 className="text-lg text-neutral-200 mb-4 border-b border-neutral-800/80 pb-2">Sound Asset Library Management</h2>
           <div className="space-y-4">
             <div className="grid grid-cols-[200px_1fr_auto] items-center gap-4">
                <span className="text-neutral-400 text-sm">Default Path</span>
                <input
                  value={soundPath}
                  onChange={e => setSoundPath(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-neutral-300 text-sm outline-none w-full"
                />
                <button
                  onClick={handleBrowse}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-1.5 rounded text-sm font-medium"
                >Browse</button>
             </div>
             <label className="flex items-center gap-2 text-neutral-300 text-sm">
                <input
                  type="checkbox"
                  checked={autoScan}
                  onChange={e => setAutoScan(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-900 accent-emerald-500 w-4 h-4"
                />
                Auto-scan for new sounds
             </label>
             <label className="flex items-center gap-2 text-neutral-300 text-sm">
                <input
                  type="checkbox"
                  checked={communityPack}
                  onChange={e => setCommunityPack(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-900 accent-emerald-500 w-4 h-4"
                />
                Download community pack
             </label>
           </div>
        </section>
        
        <div className="flex justify-end gap-3 pt-6">
           <button onClick={handleReset} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-6 py-2 rounded-lg text-sm font-medium transition-colors">Reset Defaults</button>
           <button onClick={handleSave} className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-2 rounded-lg text-sm font-medium transition-colors">Save Settings</button>
        </div>
      </div>
    </div>
  )
}
