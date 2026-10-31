const assert = require('assert');
const { aiChat, AI_TOOLS } = require(process.argv[2]);

const calls = [];
global.fetch = async (url, init) => {
  calls.push({ url: String(url), init, body: JSON.parse(init.body) });
  if (String(url).includes('anthropic.com')) {
    return new Response(JSON.stringify({
      content: [
        { type: 'text', text: 'Added a fade.' },
        { type: 'tool_use', name: 'addMotionEffect', input: { type: 'fade-black', start: 1000, end: 3000, intensity: 0.8 } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).includes('localhost:11434')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Local reply', tool_calls: [] } }] }), { status: 200 });
  }
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: 'Zooming.',
        tool_calls: [
          { function: { name: 'addZoomRegion', arguments: JSON.stringify({ start: 1000, end: 3000, scale: 2, centerX: 0.5, centerY: 0.5 }) } },
          { function: { name: 'badJson', arguments: '{oops' } },
        ],
      },
    }],
  }), { status: 200 });
};

(async () => {
  const openai = await aiChat({ provider: 'openai', openaiKey: 'sk-test' }, 'SYS', [{ role: 'user', content: 'zoom' }]);
  assert.strictEqual(openai.text, 'Zooming.');
  assert.strictEqual(openai.toolCalls.length, 1);
  assert.strictEqual(openai.toolCalls[0].name, 'addZoomRegion');
  assert.strictEqual(openai.toolCalls[0].args.scale, 2);
  const req = calls[0];
  assert.ok(req.url.includes('api.openai.com'));
  assert.strictEqual(req.body.model, 'gpt-4o-mini');
  assert.strictEqual(req.body.messages[0].role, 'system');
  assert.strictEqual(req.body.messages[1].content, 'zoom');
  assert.ok(Array.isArray(req.body.tools) && req.body.tools.length >= 8);
  assert.strictEqual(req.body.tools[0].type, 'function');
  assert.strictEqual(req.body.tool_choice, 'auto');

  const claude = await aiChat({ provider: 'claude', claudeKey: 'ck', aiModel: 'claude-test' }, 'SYS', [{ role: 'user', content: 'fade' }]);
  assert.strictEqual(claude.text, 'Added a fade.');
  assert.strictEqual(claude.toolCalls[0].name, 'addMotionEffect');
  assert.strictEqual(claude.toolCalls[0].args.intensity, 0.8);
  const cReq = calls[1];
  assert.ok(cReq.url.includes('anthropic.com'));
  assert.strictEqual(cReq.body.model, 'claude-test');
  assert.strictEqual(cReq.body.system, 'SYS');
  assert.strictEqual(cReq.body.tools[0].input_schema.type, 'object');

  const local = await aiChat({ provider: 'local' }, 'SYS', [{ role: 'user', content: 'hi' }]);
  assert.strictEqual(local.text, 'Local reply');
  assert.ok(calls[2].url.includes('localhost:11434'));
  assert.strictEqual(calls[2].body.model, 'qwen2.5:7b');

  await assert.rejects(() => aiChat({ provider: 'openai' }, 'SYS', [{ role: 'user', content: 'hi' }]), /No OpenAI API key/);
  await assert.rejects(() => aiChat({ provider: 'claude' }, 'SYS', [{ role: 'user', content: 'hi' }]), /No Claude API key/);

  // Anthropic history must start at a user turn
  calls.length = 0;
  await aiChat({ provider: 'claude', claudeKey: 'ck' }, 'SYS', [
    { role: 'assistant', content: 'old' }, { role: 'user', content: 'new' },
  ]);
  assert.strictEqual(calls[0].body.messages.length, 1);
  assert.strictEqual(calls[0].body.messages[0].role, 'user');

  // every tool has a name and an object schema
  for (const tool of AI_TOOLS) {
    assert.ok(tool.name && tool.description);
    assert.strictEqual(tool.parameters.type, 'object');
  }

  console.log('ai chat smoke: all checks passed');
})().catch(err => { console.error(err); process.exit(1); });
