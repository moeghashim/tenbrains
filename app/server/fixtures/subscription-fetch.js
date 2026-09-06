// Loaded only by API regression child processes via --import. No real network.
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';

const sse = events => new Response(events.map(data => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
globalThis.fetch = async (url, options) => {
  const host = new URL(String(url)).hostname;
  const refresh = ['platform.claude.com', 'auth.openai.com'].includes(host);
  await appendFile(process.env.TEST_REQUEST_LOG, `${refresh ? 'refresh' : 'turn'}\n`);
  if (refresh) {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : Object.fromEntries(options.body);
    assert.equal(body.refresh_token, 'fixture-refresh');
    if (process.env.TEST_REFRESH_FAIL === '1') return Response.json({ error: 'fixture-secret-do-not-echo' }, { status: 400 });
    return Response.json({ access_token: 'fixture-fresh', refresh_token: 'fixture-rotated', expires_in: 3600 });
  }
  assert.ok(['chatgpt.com', 'api.anthropic.com'].includes(host));
  assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${process.env.TEST_EXPECTED_TOKEN}`);
  const status = Number(process.env.TEST_UPSTREAM_STATUS || 200);
  if (status === 0) throw new TypeError('fixture-secret-do-not-echo');
  if (status !== 200) return Response.json({ error: { message: 'fixture-secret-do-not-echo' } }, { status });
  if (host === 'chatgpt.com') return sse([
    { type: 'response.output_text.delta', delta: 'Fixture reply.' },
    { type: 'response.completed', response: { status: 'completed' } },
  ]);
  return sse([
    { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fixture reply.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]);
};
