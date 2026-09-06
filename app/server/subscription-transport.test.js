import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SubscriptionProvider } from './providers/subscription-provider.js';

const sse = events => new Response(events.map(data => `event: ${data.type ?? 'message'}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('subscription transports send expected auth and parse staged tools without network', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'ten-brains-transport-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const dir of ['.claude', '.codex', '.grok']) await mkdir(path.join(home, dir));
  await writeFile(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-claude', expiresAt: Date.now() + 3600000 } }));
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: 'fake-codex', account_id: 'fake-account' } }));
  await writeFile(path.join(home, '.grok/auth.json'), JSON.stringify({ 'https://accounts.x.ai/sign-in': { key: 'fake-grok' } }));
  const candidate = { id: 'fog-question-1', type: 'fog-question', question: 'What evidence supports this?', stagedAfter: 'turn 2' };
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests++;
    const headers = new Headers(options.headers);
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true);
    if (String(url).startsWith('https://chatgpt.com/backend-api/codex/responses')) {
      assert.equal(headers.get('authorization'), 'Bearer fake-codex');
      assert.equal(headers.get('chatgpt-account-id'), 'fake-account');
      assert.equal(body.store, false); assert.equal(typeof body.instructions, 'string');
      return sse([{ type: 'response.output_text.delta', delta: 'Which example?' }, { type: 'response.output_item.done', item: { type: 'function_call', name: 'stage_candidates', arguments: JSON.stringify({ candidates: [candidate] }) } }, { type: 'response.completed', response: { status: 'completed' } }]);
    }
    if (String(url).startsWith('https://cli-chat-proxy.grok.com/v1/chat/completions')) {
      assert.equal(headers.get('authorization'), 'Bearer fake-grok');
      assert.equal(headers.get('x-xai-token-auth'), 'xai-grok-cli');
      assert.equal(headers.get('x-grok-model-override'), 'grok-build');
      return sse([{ choices: [{ delta: { content: 'Which example?', tool_calls: [{ index: 0, function: { name: 'stage_candidates', arguments: JSON.stringify({ candidates: [candidate] }) } }] } }] }]);
    }
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
    assert.equal(headers.get('authorization'), 'Bearer fake-claude');
    assert.equal(headers.has('x-api-key'), false);
    assert.match(headers.get('anthropic-beta'), /oauth-2025-04-20/);
    return sse([
      { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Which example?' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool1', name: 'stage_candidates', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ candidates: [candidate] }) } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]);
  });
  for (const [id, model] of [['claude-subscription', 'claude-sonnet-5'], ['codex-subscription', 'gpt-5.4'], ['grok-subscription', 'grok-build']]) {
    const p = new SubscriptionProvider({ id, model, environment: { WAYFINDER_AUTH_HOME: home } });
    const tokens = [], staged = [];
    const result = await p.createIntakeTurn({ message: 'An example', transcript: [], map: {}, staged: [], onToken: x => tokens.push(x), onCandidate: x => staged.push(x) });
    assert.equal(result.reply, 'Which example?'); assert.deepEqual(result.candidates, [candidate]);
    assert.deepEqual(staged, [candidate]); assert.equal(tokens.join(''), 'Which example?');
  }
  assert.equal(requests, 3);
});
