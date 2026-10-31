import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import type { ProjectState } from '../types/project';
import type { AiToolCall } from '../lib/aiActions';
import { toNormalized } from '../lib/timeline';

interface SidebarAgentProps {
  state: ProjectState;
  duration: number;
  playhead: number;
  onToolCalls: (calls: AiToolCall[]) => void;
  onOpenSettings: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
  error?: boolean;
}

const fmt = (ms: unknown) => {
  const n = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const s = n / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

function describeCall(call: AiToolCall): string {
  const a = call.args ?? {};
  switch (call.name) {
    case 'addZoomRegion': return `Zoom ${a.scale ?? 1.8}× · ${fmt(a.start)}–${fmt(a.end)}`;
    case 'addCameraKeyframe': return `Camera keyframe · ${fmt(a.time)} · zoom ${a.zoom ?? 1}×`;
    case 'addMotionEffect': return `${a.type} · ${fmt(a.start)}–${fmt(a.end)} · ${Math.round((a.intensity ?? 0.7) * 100)}%`;
    case 'addCaption': return `Caption · ${fmt(a.start)}–${fmt(a.end)} · "${String(a.text ?? '').slice(0, 60)}"`;
    case 'trimVideo': return `Trim · ${fmt(a.start)}–${a.end === 0 ? 'end' : fmt(a.end)}`;
    case 'setSpeed': return `Speed ${a.rate ?? 1}× · ${fmt(a.start)}–${fmt(a.end)}`;
    case 'autoZoom': return 'Auto-zoom from clicks';
    case 'setCinematic': return `Cinematic ${a.enabled ? 'on' : 'off'}${a.frameMode ? ` · ${a.frameMode} frame` : ''}`;
    case 'clearTrack': return `Clear ${a.track} track`;
    default: return call.name;
  }
}

// Compact project summary so the model can reference real times/positions
// without shipping the whole event log.
function buildSystemPrompt(state: ProjectState, duration: number, playhead: number): string {
  const clicks = state.events.filter(e => e.type === 'click' && e.details.state === 'down');
  const clickLines = clicks.slice(0, 80).map(e => {
    const p = state.displaySize ? toNormalized(e, state.displaySize) : null;
    return p ? `t=${Math.round(e.timestamp)} x=${p.x.toFixed(2)} y=${p.y.toFixed(2)}` : `t=${Math.round(e.timestamp)}`;
  });
  const lines = [
    'You are DeckFrame Autopilot, an editing assistant for screen recordings.',
    'You can only change the project by calling tools. Never say an edit was made unless you call a tool for it.',
    `Source video duration: ${Math.round(duration)} ms. Current playhead: ${Math.round(playhead)} ms.`,
    'All tool times are milliseconds along the source video.',
  ];
  if (state.displaySize) lines.push(`Display: ${state.displaySize.width}x${state.displaySize.height} px. Click coordinates below are normalized 0..1.`);
  lines.push(`Clicks (${clicks.length}): ${clickLines.join('; ') || 'none'}`);
  lines.push('Current timeline:');
  lines.push(`- trim: ${Math.round(state.trim.start)}..${Math.round(state.trim.end)} ms (0 end = full video)`);
  lines.push(`- zoom regions: ${state.zoomRegions.slice(0, 12).map(r => `${Math.round(r.start)}-${Math.round(r.end)} ${r.scale}x @${r.centerX.toFixed(2)},${r.centerY.toFixed(2)}`).join('; ') || 'none'}`);
  lines.push(`- camera keyframes: ${state.cameraKeyframes.slice(0, 12).map(k => `${Math.round(k.time)} zoom=${k.camera.zoom}`).join('; ') || 'none'}`);
  lines.push(`- motion effects: ${state.motionEffects.slice(0, 12).map(fx => `${fx.type} ${Math.round(fx.start)}-${Math.round(fx.end)}`).join('; ') || 'none'}`);
  lines.push(`- speed regions: ${state.speedRegions.slice(0, 12).map(r => `${Math.round(r.start)}-${Math.round(r.end)} ${r.rate}x`).join('; ') || 'none'}`);
  lines.push(`- captions: ${state.captions.length}`);
  lines.push(`- cinematic: ${state.isCinematic ? 'on' : 'off'}; frame: ${state.frame.mode}`);
  lines.push(
    'Guidance:',
    '- "Zoom into the click": pick the matching click and call addZoomRegion around it (start ~600ms before, end ~800ms after, scale 1.6-2.2).',
    '- A new zoom or speed region replaces overlapping ones.',
    '- "Fade", "shake", "pulse", "glitch": call addMotionEffect with the matching type; 2000ms is a good default length.',
    '- "Cinematic": call setCinematic with enabled=true and frameMode="gradient" unless the user says otherwise.',
    '- "Auto zoom": call autoZoom; it replaces existing zoom regions.',
    '- Camera moves need two addCameraKeyframe calls (start pose and end pose).',
    '- Use addCaption only with text the user provided; never invent transcript text.',
    '- If the request is ambiguous or needs information you do not have, ask a short question instead of guessing.',
  );
  return lines.join('\n');
}

export function SidebarAgent({ state, duration, playhead, onToolCalls, onOpenSettings }: SidebarAgentProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerInfo, setProviderInfo] = useState('AI provider not configured');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const saved = await window.electronAPI?.loadSettings();
      if (!saved) return;
      const provider = saved.provider === 'claude' || saved.provider === 'local' ? saved.provider : 'openai';
      const model = (saved.aiModel || '').trim()
        || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'claude' ? 'claude-sonnet-4-5' : 'qwen2.5:7b');
      const key = provider === 'local' ? 'ollama' : provider === 'claude' ? saved.claudeKey : saved.openaiKey;
      const label = provider === 'local' ? 'Local' : provider === 'claude' ? 'Claude' : 'OpenAI';
      setProviderInfo(key ? `${label} · ${model}` : `${label} · no API key — open Settings`);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;

    setPrompt('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const api = window.electronAPI;
      if (!api?.aiChat) throw new Error('AI assist needs the desktop app.');
      const history = [...messages, { role: 'user' as const, content: text }]
        .slice(-12)
        .map(m => ({ role: m.role, content: m.content }));
      const reply = await api.aiChat({ system: buildSystemPrompt(state, duration, playhead), messages: history });
      if (reply.toolCalls.length) onToolCalls(reply.toolCalls);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply.text || (reply.toolCalls.length ? 'Applied the edits.' : 'No changes.'),
        actions: reply.toolCalls.map(describeCall),
      }]);
    } catch (err: any) {
      const message = String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setMessages(prev => [...prev, { role: 'assistant', content: message, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 bg-[#131316] border-l border-neutral-800 flex flex-col h-full text-sm shrink-0">
      <div className="h-12 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 font-medium text-neutral-200">
          <Sparkles size={15} className="text-purple-400" />
          Autopilot
        </div>
        <button onClick={onOpenSettings} className="text-[10px] text-neutral-500 hover:text-neutral-200">
          Settings
        </button>
      </div>
      <div className="px-4 py-1.5 text-[10px] text-neutral-500 border-b border-neutral-800/60 truncate" title={providerInfo}>
        {providerInfo}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && (
          <div className="text-[11px] text-neutral-500 leading-relaxed space-y-2">
            <p>Tell Autopilot what to change. It edits the timeline directly.</p>
            <p className="text-neutral-600">
              Try “Zoom into each click”, “Add a fade to black at 0:12”, or “Make it cinematic with a gradient background”.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`p-3 rounded-2xl max-w-[92%] whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : m.error
                  ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-tl-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div className="mt-2 w-full space-y-1">
                {m.actions.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-neutral-400">
                    <Sparkles size={12} className="text-purple-400 shrink-0" />
                    <span className="truncate">{action}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-neutral-500 text-xs animate-pulse ml-1">Thinking…</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-800 bg-[#0E0E11] shrink-0">
        <div className="relative">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask Autopilot to edit…"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-4 pr-10 py-3 text-xs text-neutral-200 outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            title="Send"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-white disabled:opacity-40 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}
