// OpenAI-compatible + Anthropic chat with a fixed tool catalog. The renderer
// applies the returned calls to project state; this module only talks HTTP.

export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiToolCall { name: string; args: Record<string, unknown> }
export interface AiReply { text: string; toolCalls: AiToolCall[] }

type Provider = 'openai' | 'claude' | 'local';
type Settings = Record<string, unknown>;

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-sonnet-4-5',
  local: 'qwen2.5:7b',
};

const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });

export const AI_TOOLS = [
  {
    name: 'addZoomRegion',
    description: 'Add a zoom (crop) region that magnifies part of the video. Replaces any existing zoom region that overlaps it.',
    parameters: {
      type: 'object',
      properties: {
        start: num('Region start in ms along the source video'),
        end: num('Region end in ms'),
        scale: num('Magnification, 1..4 (1.8 is a good default)', { minimum: 1, maximum: 4 }),
        centerX: num('Focus X, 0=left 1=right', { minimum: 0, maximum: 1 }),
        centerY: num('Focus Y, 0=top 1=bottom', { minimum: 0, maximum: 1 }),
      },
      required: ['start', 'end', 'scale', 'centerX', 'centerY'],
      additionalProperties: false,
    },
  },
  {
    name: 'addCameraKeyframe',
    description: 'Snapshot a camera pose at a time. Two keyframes make a camera move; the pose holds before the first and after the last keyframe.',
    parameters: {
      type: 'object',
      properties: {
        time: num('Keyframe time in ms'),
        zoom: num('Camera zoom, 0.5..3', { minimum: 0.5, maximum: 3 }),
        x: num('Camera X offset, -8..8', { minimum: -8, maximum: 8 }),
        y: num('Camera Y offset, -4.5..4.5', { minimum: -4.5, maximum: 4.5 }),
        easing: { type: 'string', enum: ['linear', 'ease', 'hold'], description: 'Easing into the next keyframe' },
      },
      required: ['time'],
      additionalProperties: false,
    },
  },
  {
    name: 'addMotionEffect',
    description: 'Add a motion effect region (2000ms is a good default length).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['shake', 'pulse', 'glitch', 'fade-black', 'fade-white'], description: 'Effect type' },
        start: num('Region start in ms'),
        end: num('Region end in ms'),
        intensity: num('Strength, 0.1..1', { minimum: 0.1, maximum: 1 }),
      },
      required: ['type', 'start', 'end', 'intensity'],
      additionalProperties: false,
    },
  },
  {
    name: 'addCaption',
    description: 'Add a caption cue. Only use text the user provided — never invent transcript text.',
    parameters: {
      type: 'object',
      properties: {
        start: num('Caption start in ms'),
        end: num('Caption end in ms'),
        text: { type: 'string', description: 'Caption text' },
      },
      required: ['start', 'end', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'trimVideo',
    description: 'Set the trim range. end=0 keeps the video running to its end.',
    parameters: {
      type: 'object',
      properties: {
        start: num('Trim start in ms'),
        end: num('Trim end in ms, 0 = full video'),
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
  },
  {
    name: 'setSpeed',
    description: 'Add a speed region that re-times playback. Replaces any overlapping speed region.',
    parameters: {
      type: 'object',
      properties: {
        start: num('Region start in ms'),
        end: num('Region end in ms'),
        rate: num('Playback rate, 0.25..4', { minimum: 0.25, maximum: 4 }),
      },
      required: ['start', 'end', 'rate'],
      additionalProperties: false,
    },
  },
  {
    name: 'autoZoom',
    description: 'Replace zoom regions with auto-zoom regions generated from the recording clicks.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'setCinematic',
    description: 'Toggle cinematic mode and optionally set the background frame style.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Cinematic mode on/off' },
        frameMode: { type: 'string', enum: ['none', 'solid', 'gradient'], description: 'Background frame style' },
      },
      required: ['enabled'],
      additionalProperties: false,
    },
  },
  {
    name: 'clearTrack',
    description: 'Remove every item from one timeline track.',
    parameters: {
      type: 'object',
      properties: {
        track: { type: 'string', enum: ['zoom', 'speed', 'captions', 'keyframes', 'effects', 'annotations'], description: 'Track to clear' },
      },
      required: ['track'],
      additionalProperties: false,
    },
  },
];

async function postJson(url: string, init: RequestInit, label: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error(`${label} request failed — check your connection${label === 'Local AI' ? ' and that Ollama is running' : ''}.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function cleanHistory(messages: AiMessage[]) {
  const out = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function aiChat(settings: Settings, system: string, messages: AiMessage[]): Promise<AiReply> {
  const raw = settings.provider;
  const provider: Provider = raw === 'claude' || raw === 'local' ? raw : 'openai';
  const custom = typeof settings.aiModel === 'string' ? settings.aiModel.trim() : '';
  const model = custom || DEFAULT_MODELS[provider];
  const history = cleanHistory(messages);

  if (provider === 'claude') {
    const key = typeof settings.claudeKey === 'string' ? settings.claudeKey : '';
    if (!key) throw new Error('No Claude API key set — add one in Settings → AI Configuration.');
    return anthropicChat(key, model, system, history);
  }

  const key = provider === 'local' ? 'ollama' : (typeof settings.openaiKey === 'string' ? settings.openaiKey : '');
  if (!key) throw new Error('No OpenAI API key set — add one in Settings → AI Configuration.');
  const base = provider === 'local' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1';
  return openAiChat(base, key, model, system, history, provider === 'local' ? 'Local AI' : 'OpenAI');
}

async function openAiChat(
  base: string, key: string, model: string, system: string,
  history: Array<{ role: string; content: string }>, label: string,
): Promise<AiReply> {
  const json = await postJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...history],
      tools: AI_TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: 'auto',
      temperature: 0.2,
    }),
  }, label);

  const message = json?.choices?.[0]?.message ?? {};
  const toolCalls: AiToolCall[] = [];
  for (const tc of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const name = tc?.function?.name;
    if (typeof name !== 'string') continue;
    try {
      const args = JSON.parse(typeof tc.function.arguments === 'string' ? tc.function.arguments : '{}');
      if (args && typeof args === 'object' && !Array.isArray(args)) toolCalls.push({ name, args });
    } catch { /* malformed args — skip this call */ }
  }
  return { text: typeof message.content === 'string' ? message.content.trim() : '', toolCalls };
}

async function anthropicChat(
  key: string, model: string, system: string,
  history: Array<{ role: string; content: string }>,
): Promise<AiReply> {
  const json = await postJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: history,
      tools: AI_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
  }, 'Claude');

  const blocks: any[] = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.filter(b => b?.type === 'text').map(b => b.text).join('\n').trim();
  const toolCalls = blocks
    .filter(b => b?.type === 'tool_use' && typeof b.name === 'string')
    .map(b => ({ name: b.name, args: b.input && typeof b.input === 'object' ? b.input : {} }));
  return { text, toolCalls };
}
