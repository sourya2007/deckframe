import { useState, useMemo } from 'react';
import { Search, Filter, PlayCircle } from 'lucide-react';

const categories = [
  {
    title: 'Favorites',
    items: [
      { name: 'Cross Dissolve', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Speed Ramp', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Cinematic Flare', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
    ]
  },
  {
    title: 'Transitions',
    items: [
      { name: 'Zoom In', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80', badge: 'Add' },
      { name: 'Zoom Out', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Fade to Black', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Fade to White', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Slide Left', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Slide Right', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Wipe', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Glitch', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Push', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
    ]
  },
  {
    title: 'Planar Movements',
    items: [
      { name: 'Tilt-Shift', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Parallax', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: '3D Rotate', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Perspective Warp', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Corner Pin', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Camera Shake', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
    ]
  },
  {
    title: 'Motion Graphics',
    items: [
      { name: 'Cursor Follow', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Highlight Pulse', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Lower Thirds', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Text Animation', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Animated Icons', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
      { name: 'Data Visualization', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&q=80' },
    ]
  }
];

interface EffectsViewProps {
  onEffectSelect?: (effectName: string) => void;
}

export function EffectsView({ onEffectSelect }: EffectsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => item.name.toLowerCase().includes(q))
      }))
      .filter(cat => cat.items.length > 0);
  }, [searchQuery]);

  return (
    <div className="flex-1 bg-[#131316] flex flex-col min-h-0">
       <div className="p-4 border-b border-neutral-800 flex items-center gap-4 shrink-0">
         <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input 
              placeholder="Search effects, transitions, and motion graphics..." 
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-neutral-200 outline-none focus:border-blue-500 transition-colors"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
         </div>
          <button className="p-2 text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-lg">
            <Filter size={16} />
          </button>
       </div>
       <div className="flex-1 overflow-y-auto p-6 space-y-8">
         {filteredCategories.map((cat, i) => (
           <section key={i}>
             <div className="flex items-center gap-2 mb-4 text-blue-400 font-medium text-sm">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                {cat.title}
             </div>
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {cat.items.map((item, j) => {
                  const active = selectedEffect === item.name;
                  return (
                    <div
                      key={j}
                      onClick={() => {
                        setSelectedEffect(prev => prev === item.name ? null : item.name);
                        onEffectSelect?.(item.name);
                      }}
                      className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-colors bg-neutral-900 ${active ? 'border-blue-500' : 'border-transparent hover:border-neutral-700'}`}
                    >
                      <div className="aspect-video relative overflow-hidden bg-neutral-800">
                        <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-gradient-to-br from-blue-500 to-purple-500"></div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                           <PlayCircle size={24} className="text-white drop-shadow-md" />
                        </div>
                      </div>
                      <div className="p-2 text-xs text-neutral-300 font-medium flex justify-between items-center">
                        <span className="truncate">{item.name}</span>
                        {item.badge && <span className="bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">{item.badge}</span>}
                      </div>
                    </div>
                  );
                })}
             </div>
           </section>
         ))}
       </div>
    </div>
  )
}
