import assert from 'node:assert/strict';
import { generateChart } from '../../lib/ziwei/algorithm';
import { getKimiCodeConfig, KimiCodeTurnParser } from '../../lib/kimi-code';
import * as nodeModule from 'node:module';

type HookResult = { url?: string; format?: string; source?: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: {
    resolve(specifier: string, context: unknown, next: (s: string, c: unknown) => HookResult): HookResult;
    load(url: string, context: unknown, next: (u: string, c: unknown) => HookResult): HookResult;
  }): void;
};
const SERVER_ONLY_STUB = 'data:text/javascript,';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: SERVER_ONLY_STUB, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === SERVER_ONLY_STUB) return { format: 'commonjs', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

async function main() {
  const { buildHemingPrompt, buildInterpretPrompt } = await import('../../lib/ziwei/ai-prompt');
  const { POST: interpret } = await import('../../app/api/interpret/route');
  const { POST: heming } = await import('../../app/api/heming/route');

  assert.throws(() => getKimiCodeConfig({}), /KIMI_CODE_TOKEN/);
  assert.throws(() => getKimiCodeConfig({
    KIMI_CODE_TOKEN: 'token',
    KIMI_CODE_LOCAL_URL: 'https://example.com',
  }), /仅允许本机/);

  const config = getKimiCodeConfig({ KIMI_CODE_TOKEN: 'token' });
  assert.equal(config.baseUrl, 'http://127.0.0.1:58627');
  assert.equal(config.wsUrl, 'ws://127.0.0.1:58627/api/v1/ws');

  const parser = new KimiCodeTurnParser();
  assert.deepEqual(parser.accept({ type: 'turns' }), { type: 'none' });
  parser.accept({ type: 'turn.started', turn: { turn_id: 'turn-1' } });
  parser.accept({
    type: 'item.started',
    turn_id: 'turn-1',
    item: { item_id: 'reasoning-1', type: 'reasoning' },
  });
  assert.deepEqual(parser.accept({
    type: 'item.delta',
    turn_id: 'turn-1',
    item_id: 'reasoning-1',
    field: 'text',
    delta: '不应输出推理',
  }), { type: 'none' });
  parser.accept({
    type: 'item.started',
    turn_id: 'turn-1',
    item: { item_id: 'assistant-1', type: 'assistant_message' },
  });
  assert.deepEqual(parser.accept({
    type: 'item.delta',
    turn_id: 'turn-1',
    item_id: 'assistant-1',
    field: 'text',
    delta: '你好',
  }), { type: 'delta', text: '你好' });
  assert.deepEqual(parser.accept({
    type: 'item.delta',
    turn_id: 'turn-1',
    item_id: 'assistant-1',
    field: 'text',
    delta: '世界',
  }), { type: 'delta', text: '世界' });
  assert.deepEqual(parser.accept({
    type: 'item.ended',
    turn_id: 'turn-1',
    item: { item_id: 'assistant-1', type: 'assistant_message', text: '你好世界' },
  }), { type: 'none' }, 'item.ended must not repeat streamed text');
  assert.deepEqual(parser.accept({
    type: 'turn.ended',
    turn: { turn_id: 'turn-1', outcome: 'completed' },
  }), { type: 'done' });

  const fallbackParser = new KimiCodeTurnParser();
  fallbackParser.accept({ type: 'turn.started', turn: { turn_id: 'turn-2' } });
  assert.deepEqual(fallbackParser.accept({
    type: 'item.ended',
    turn_id: 'turn-2',
    item: { item_id: 'assistant-2', type: 'assistant_message', text: '完整回答' },
  }), { type: 'delta', text: '完整回答' }, 'non-streaming assistant items need a fallback');

  const chart = generateChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male', name: '测试' });
  const messages = [{ role: 'user' as const, content: '我的命格如何？' }];
  const prompt = buildInterpretPrompt(chart, messages);
  assert.ok(prompt.includes('我的命格如何？'));
  assert.ok(prompt.includes('不要调用任何工具'));
  assert.ok(prompt.includes('"name":"测试"'));
  const followUp = buildInterpretPrompt(chart, messages, true);
  assert.ok(followUp.includes('同一张命盘的追问'));
  assert.ok(!followUp.includes('<chart'));

  const hemingPrompt = buildHemingPrompt(chart, chart, '两人适合合作吗？');
  assert.ok(hemingPrompt.includes('两人适合合作吗？'));
  assert.ok(hemingPrompt.includes('HEMING_METHODOLOGY') === false);
  assert.ok(hemingPrompt.includes('双宫联参原则'));

  delete process.env.KIMI_CODE_TOKEN;
  const request = (url: string, body: object) => new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const interpretResponse = await interpret(request('http://localhost/api/interpret', {
    chart,
    messages,
    conversationId: 'test-session-0001',
  }));
  assert.equal(interpretResponse.status, 503);
  assert.match((await interpretResponse.json()).error, /KIMI_CODE_TOKEN/);

  const hemingResponse = await heming(request('http://localhost/api/heming', {
    chartA: chart,
    chartB: chart,
    question: '合盘如何？',
    conversationId: 'test-session-0002',
  }));
  assert.equal(hemingResponse.status, 503);
  assert.match((await hemingResponse.json()).error, /KIMI_CODE_TOKEN/);

  console.log('Kimi Code config, event parser, prompts and missing-token route regressions passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
