import { useState } from 'react';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { aiTools } from '../lib/aiTools';

interface SidebarAgentProps {
  onToolCall: (name: string, args: any) => void;
}

export function SidebarAgent({ onToolCall }: SidebarAgentProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; actions?: string[] }[]>([]);
  const [loading, setLoading] = useState(false);

  const openai = createOpenAI({
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    
    try {
      const result = await generateText({
        model: openai('qwen2.5:7b'),
        prompt,
        tools: aiTools,
        maxSteps: 1,
      });

      const text = result.text || 'Action applied.';
      const actions: string[] = [];
      if (result.toolCalls) {
        for (const tc of result.toolCalls) {
          onToolCall(tc.toolName, tc.args);
          actions.push(`${tc.toolName}\n${JSON.stringify(tc.args)}`);
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: text, actions: actions.length > 0 ? actions : undefined }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Simulating action locally (AI provider unavailable).' }]);
      const q = prompt.toLowerCase();
      if (q.includes('tilt') || q.includes('cinematic')) {
        onToolCall('applyCinematicTilt', { pitch: 0.5, yaw: -0.3, roll: 0 });
      } else if (q.includes('zoom')) {
        onToolCall('zoomToEvent', { eventId: '1', zoomFactor: 2.5, speed: 1 });
      } else if (q.includes('sound') || q.includes('effect') || q.includes('audio')) {
        onToolCall('addSoundEffect', { trackType: 'whoosh', volume: 0.5, timestamp: 0 });
      }
    }
    
    setPrompt('');
    setLoading(false);
  };

  return (
    <div className="w-80 bg-[#131316] border-l border-neutral-800 flex flex-col h-full text-sm shrink-0">
      <div className="h-12 border-b border-neutral-800 flex items-center px-4 justify-between font-medium text-neutral-200 shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-purple-400" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Autopilot
        </div>
        <button className="text-neutral-500 hover:text-white">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            {m.role === 'assistant' && <div className="text-[10px] text-neutral-500 mb-1 ml-1">AI responses, you can enable audio and complex noise reduction and boosted dialogue.</div>}
            <div className={`p-3 rounded-2xl max-w-[90%] ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-tl-sm'}`}>
              {m.content && m.content}
              {m.actions && m.actions.map((act, idx) => {
                const [title, desc] = act.split('\n');
                return (
                  <div key={idx} className={`${m.content ? 'mt-3' : 'mt-0 mb-3'} bg-neutral-950 rounded p-3 text-xs border border-neutral-800`}>
                    <div className="flex items-center gap-2 mb-1">
                      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-purple-400 shrink-0" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                      <span className="font-medium text-neutral-200">{title}</span>
                    </div>
                    <div className="text-neutral-500 mb-2">{desc}</div>
                    <div className="flex items-center justify-between text-neutral-500 border-t border-neutral-800/80 pt-2 mt-2">
                       <span className="flex items-center gap-1"><svg viewBox="0 0 24 24" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg> action card</span>
                    </div>
                  </div>
                );
              })}
              {m.role === 'assistant' && !m.actions && (
                <div className="mt-3 bg-neutral-950 rounded p-2 text-xs border border-neutral-800">
                  <div className="flex items-center justify-between text-neutral-400">
                     <span>action card</span>
                     <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-neutral-500 text-xs animate-pulse ml-1">Thinking...</div>}
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-800 bg-[#0E0E11] shrink-0">
        <div className="relative">
          <input 
            value={prompt} 
            onChange={e => setPrompt(e.target.value)}
            placeholder="Type a message..." 
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-4 pr-10 py-3 text-xs text-neutral-200 outline-none focus:border-blue-500 transition-colors"
          />
          <button type="submit" disabled={loading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-white disabled:opacity-50 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
