import { MousePointer2, Move, Scissors, Wand2, Sparkles, FolderArchive, Share, Settings } from 'lucide-react';

interface SidebarNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setShowExport: (show: boolean) => void;
}

export function SidebarNav({ activeTab, setActiveTab, setShowExport }: SidebarNavProps) {
  const navItems = [
    { id: 'project', icon: MousePointer2, label: 'Select' },
    { id: 'move', icon: Move, label: 'Move' },
    { id: 'cut', icon: Scissors, label: 'Cut' },
    { id: 'effects', icon: Wand2, label: 'Effects' },
    { id: 'ai', icon: Sparkles, label: 'AI' },
    { id: 'library', icon: FolderArchive, label: 'Library' },
  ];

  return (
    <div className="w-16 bg-[#0E0E11] border-r border-neutral-800 flex flex-col items-center py-4 z-20 shrink-0">
      <div className="flex flex-col gap-6 w-full">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 w-full relative ${
              activeTab === item.id ? 'text-blue-500' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {activeTab === item.id && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />
            )}
            <item.icon size={20} strokeWidth={1.5} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
      
      <div className="mt-auto flex flex-col gap-6 w-full">
        <button
          onClick={() => setShowExport(true)}
          className="flex flex-col items-center gap-1 w-full text-neutral-500 hover:text-neutral-300"
        >
          <Share size={20} strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Export</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 w-full relative ${
            activeTab === 'settings' ? 'text-blue-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {activeTab === 'settings' && (
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />
          )}
          <Settings size={20} strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </div>
    </div>
  );
}
