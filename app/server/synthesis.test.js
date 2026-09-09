import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { synthesisContext, validateSynthesisCandidates, synthesisResult } from './synthesis.js';
import { MockProvider } from './providers/mock-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { SubscriptionProvider } from './providers/subscription-provider.js';

const discovery = {
  map: { destination: 'Reduce repeated steps.', openFrontier: [], closedDecisions: [], fogOfWar: [{ id: 'fog-1', question: 'Which step repeats?' }] },
  evidence: [{ id: 'E1', text: 'Old mirror' }],
  sessions: [
    { id: 's1', type: 'grilling', objective: 'Examine repetition', status: 'active', transcript: [{ actor: 'You', text: 'Exact quote:  two spaces.' }], staged: [], evidence: [{ id: 'E1', text: 'Exact quote:  two spaces.' }] },
    { id: 's2', type: 'grilling', objective: 'Examine time', outcome: 'Recorded a second example', evidence: [{ id: 'E2', text: 'Which step repeats? Receipt sorting repeats.' }] },
  ],
};
const context = synthesisContext(discovery);
const candidates = [
  { id: 'decision-1', type: 'closed-decision', title: 'Use recorded examples.', evidence: ['E1', 'E2'], confidence: 'High', stagedAfter: 'turn 2' },
  { id: 'destination-1', type: 'destination-draft', title: 'You spend less time sorting receipts.', stagedAfter: 'turn 2' },
  { id: 'retire-1', type: 'fog-retirement', questionId: 'fog-1', reason: 'Recorded examples identify the repeated step.', stagedAfter: 'turn 2' },
];
const args = { message: 'Compare the evidence', objective: 'Compare repetition', evidenceTarget: 'Two examples', transcript: [], map: discovery.map, staged: [], synthesisContext: context };

test('synthesis context preserves multi-session verbatim evidence and actual objectives/outcomes', () => {
  assert.equal(context.evidence.length, 2);
  assert.equal(context.evidence[0].text, 'Exact quote:  two spaces.');
  assert.equal(context.evidence[1].sessionId, 's2');
  assert.equal(context.sessions[0].objective, 'Examine repetition');
  assert.equal(context.sessions[1].outcomes, 'Recorded a second example');
  assert.deepEqual(context.sessions[0].transcript, discovery.sessions[0].transcript);
});

test('synthesis validation drops unknown, malformed, duplicate, and ungrounded candidates', () => {
  assert.deepEqual(validateSynthesisCandidates(candidates, context), candidates);
  const invalid = [null, 'bad', {}, { ...candidates[0], id: 'invalid-citation', evidence: ['invented'] },
    { ...candidates[0], id: 'missing-citation', evidence: [] }, { ...candidates[0], id: 'bad-type', evidence: 'E1' },
    { ...candidates[0], id: 'bad-confidence', confidence: 'certain' }, { ...candidates[0], id: 'bad-title', title: '' },
    { ...candidates[0], id: 'unknown', type: 'map-write' }, { ...candidates[2], id: 'missing-fog', questionId: 'absent' },
    { ...candidates[2], id: 'no-reason', reason: null }, { ...candidates[0], id: 'no-turn', stagedAfter: '' }];
  assert.deepEqual(validateSynthesisCandidates(invalid, context), []);
  assert.deepEqual(validateSynthesisCandidates([...candidates, ...invalid, ...candidates], context), candidates);
  assert.deepEqual(synthesisResult('Plain reply', [{ name: 'stage_synthesis', arguments: '{bad' }], context).candidates, []);
  assert.deepEqual(synthesisResult('Plain reply', Array(2).fill({ name: 'stage_synthesis', input: { candidates } }), context).candidates, []);
});

test('mock synthesis is deterministic, cites stored ids, and does not invent evidence when empty', async () => {
  const provider = new MockProvider();
  const before = structuredClone(discovery);
  const first = await provider.createSessionTurn(args);
  assert.deepEqual(await provider.createSessionTurn(args), first);
  assert.deepEqual(first.candidates[0].evidence, ['E1', 'E2']);
  assert.equal(first.candidates[2].questionId, 'fog-1');
  assert.deepEqual(validateSynthesisCandidates(first.candidates, context), first.candidates);
  assert.deepEqual(discovery, before);
  assert.deepEqual((await provider.createSessionTurn({ ...args, synthesisContext: { ...context, evidence: [] } })).candidates, []);
});

const sse = events => new Response(events.map(data => `event: ${data.type ?? 'message'}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('all real transports receive synthesis context and degrade malformed consolidated output', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'tenbrains-synthesis-transports-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const dir of ['.claude', '.codex', '.grok']) await mkdir(path.join(home, dir));
  await writeFile(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fixture', expiresAt: Date.now() + 3600000 } }));
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: 'fixture', account_id: 'fixture' } }));
  await writeFile(path.join(home, '.grok/auth.json'), JSON.stringify({ 'https://accounts.x.ai/sign-in': { key: 'fixture' } }));
  for (const id of ['anthropic', 'openai', 'claude-subscription', 'codex-subscription', 'grok-subscription']) {
    for (const input of [JSON.stringify({ candidates }), '{broken', JSON.stringify({ candidates: [{ ...candidates[0], evidence: ['invented'] }] })]) {
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        const system = body.instructions ?? body.system ?? body.messages[0].content;
        assert.ok(system.includes('Exact quote:  two spaces.'));
        assert.ok(system.includes('Which step repeats? Receipt sorting repeats.'));
        assert.ok(system.includes('Recorded a second example'));
        assert.deepEqual(body.tools.map(tool => tool.name ?? tool.function.name), ['stage_synthesis', 'offer_choices']);
        if (id === 'codex-subscription') return sse([
          { type: 'response.output_text.delta', delta: 'Which evidence should You examine?' },
          { type: 'response.output_item.done', item: { type: 'function_call', name: 'stage_synthesis', arguments: input } },
          { type: 'response.completed', response: { status: 'completed' } },
        ]);
        if (id === 'openai' || id === 'grok-subscription') return sse([{ choices: [{ delta: { content: 'Which evidence should You examine?', tool_calls: [{ index: 0, function: { name: 'stage_synthesis', arguments: input } }] } }] }]);
        return sse([
          { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Which evidence should You examine?' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'stage', name: 'stage_synthesis', input: {} } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ]);
      });
      const provider = id === 'anthropic' ? new AnthropicProvider({ apiKey: 'fixture' })
        : id === 'openai' ? new OpenAIProvider({ apiKey: 'fixture' })
          : new SubscriptionProvider({ id, model: 'fixture-model', environment: { WAYFINDER_AUTH_HOME: home } });
      const result = await provider.createSessionTurn(args);
      assert.equal(result.reply, 'Which evidence should You examine?');
      assert.deepEqual(result.candidates, input === JSON.stringify({ candidates }) ? candidates : []);
      t.mock.restoreAll();
    }
  }
});
