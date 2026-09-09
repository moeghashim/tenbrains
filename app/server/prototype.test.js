import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prototypeContext, prototypeResult, validatePrototypeCandidates } from './prototype.js';
import { applyCandidates, dedupeCandidates } from './candidates.js';
import { MockProvider } from './providers/mock-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { SubscriptionProvider } from './providers/subscription-provider.js';

const ticket = { id: 'prototype-1', type: 'Prototype', title: 'Test receipt sorting', target: 'One example', mode: 'You + Wayfinder' };
const report = { id: 'E1', text: '  One receipt sorted.\r\nSecond receipt failed.  ', sourceTurn: 'u1' };
const discovery = { map: { destination: 'Reduce repetition', openFrontier: [ticket], fogOfWar: [], closedDecisions: [] } };
const session = { ticketId: ticket.id, objective: ticket.title, evidenceTarget: ticket.target, evidence: [report] };
const context = prototypeContext(discovery, session);
const plan = { id: 'plan-1', type: 'ticket-plan', stagedAfter: 'turn 2', ticketId: ticket.id, criteria: ['Sort one receipt without repeating a step.'], checklist: ['Build one sorting path.', 'Run one receipt through it.'] };
const decision = { id: 'decision-1', type: 'closed-decision', title: 'Examine the failed receipt.', confidence: 'Medium', evidence: ['E1'], stagedAfter: 'turn 4' };
const args = { objective: session.objective, message: 'Plan the first test', transcript: [], map: discovery.map, staged: [], prototypeContext: context };

test('Prototype validates only the linked existing ticket and grounded report candidates', () => {
  assert.deepEqual(validatePrototypeCandidates([plan], context), [plan]);
  for (const invalid of [{ ...plan, ticketId: 'missing' }, { ...plan, criteria: [] }, { ...plan, criteria: [' '] }, { ...plan, checklist: [] }, { ...plan, criteria: [42] }, { ...plan, criteria: ['x '.repeat(21)] }, { ...plan, checklist: ['Build!'] }, { ...plan, id: '' }, { ...plan, type: 'map-write' }]) assert.deepEqual(validatePrototypeCandidates([invalid], context), []);
  assert.deepEqual(validatePrototypeCandidates([plan], { ...context, ticket: null }), []);
  assert.deepEqual(validatePrototypeCandidates([plan], { ...context, findingId: 'E1' }), []);
  assert.deepEqual(validatePrototypeCandidates([plan, { ...plan, id: 'second-plan' }], context), [plan]);
  assert.deepEqual(validatePrototypeCandidates([decision], { ...context, findingId: 'E1' }), [decision]);
  assert.deepEqual(validatePrototypeCandidates([{ ...decision, evidence: ['invented'] }], context), []);
  assert.deepEqual(validatePrototypeCandidates([decision], { ...context, findingId: 'E2' }), []);
  assert.deepEqual(validatePrototypeCandidates([{ ...decision, evidence: { includes: true } }], { ...context, findingId: 'E1' }), []);
  assert.deepEqual(prototypeResult('Reply', [{ name: 'stage_prototype', arguments: '{bad' }], context).candidates, []);
  assert.deepEqual(prototypeResult('Reply', Array(2).fill({ name: 'stage_prototype', input: { candidates: [plan] } }), context).candidates, []);
});

test('plan approval changes only ticket.plan, and hashes distinguish plan content', () => {
  const doc = structuredClone(discovery);
  applyCandidates(doc, [plan]);
  assert.deepEqual(doc, { map: { ...discovery.map, openFrontier: [{ ...ticket, plan: { criteria: plan.criteria, checklist: plan.checklist } }] } });
  const unchanged = structuredClone(doc);
  applyCandidates(doc, [{ ...plan, criteria: [null] }, { ...plan, ticketId: 'missing' }]);
  assert.deepEqual(doc, unchanged);
  const revised = { ...plan, id: 'revised', checklist: ['Run two receipts.'] };
  assert.deepEqual(dedupeCandidates([plan], [{ ...plan, id: 'duplicate' }, revised]).added, [revised]);
});

test('mock Prototype plans and report grilling are deterministic and do not create evidence', async () => {
  const provider = new MockProvider();
  const first = await provider.createSessionTurn(args);
  assert.deepEqual(await provider.createSessionTurn(args), first);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].type, 'ticket-plan');
  assert.deepEqual(validatePrototypeCandidates(first.candidates, context), first.candidates);
  assert.deepEqual((await provider.createSessionTurn({ ...args, staged: first.candidates })).candidates, []);
  assert.deepEqual((await provider.createSessionTurn({ ...args, prototypeContext: { ...context, ticket: null } })).candidates, []);
  const result = await provider.createSessionTurn({ ...args, prototypeContext: { ...context, findingId: report.id } });
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
  assert.deepEqual(result.candidates[0].evidence, ['E1']);
  assert.deepEqual(context.evidence, [report]);
});

const sse = events => new Response(events.map(data => `event: ${data.type ?? 'message'}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('all real transports support Prototype planning and reports with malformed-output degradation', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'tenbrains-prototype-transport-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const dir of ['.claude', '.codex', '.grok']) await mkdir(path.join(home, dir));
  await writeFile(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fixture', expiresAt: Date.now() + 3600000 } }));
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: 'fixture', account_id: 'fixture' } }));
  await writeFile(path.join(home, '.grok/auth.json'), JSON.stringify({ 'https://accounts.x.ai/sign-in': { key: 'fixture' } }));
  for (const id of ['anthropic', 'openai', 'claude-subscription', 'codex-subscription', 'grok-subscription']) {
    for (const expected of [[plan], [decision], []]) {
      const input = expected.length ? JSON.stringify({ candidates: expected }) : '{broken';
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        const system = body.instructions ?? body.system ?? body.messages[0].content;
        assert.ok(system.includes(JSON.stringify(report.text)));
        assert.ok(system.includes(ticket.id));
        assert.ok(system.includes('You build externally'));
        assert.deepEqual(body.tools.map(tool => tool.name ?? tool.function.name), ['stage_prototype', 'offer_choices']);
        if (id === 'codex-subscription') return sse([
          { type: 'response.output_text.delta', delta: 'Which result contradicts the criterion?' },
          { type: 'response.output_item.done', item: { type: 'function_call', name: 'stage_prototype', arguments: input } },
          { type: 'response.completed', response: { status: 'completed' } },
        ]);
        if (id === 'openai' || id === 'grok-subscription') return sse([{ choices: [{ delta: { content: 'Which result contradicts the criterion?', tool_calls: [{ index: 0, function: { name: 'stage_prototype', arguments: input } }] } }] }]);
        return sse([
          { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Which result contradicts the criterion?' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'stage', name: 'stage_prototype', input: {} } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ]);
      });
      const provider = id === 'anthropic' ? new AnthropicProvider({ apiKey: 'fixture' }) : id === 'openai' ? new OpenAIProvider({ apiKey: 'fixture' }) : new SubscriptionProvider({ id, model: 'fixture', environment: { WAYFINDER_AUTH_HOME: home } });
      const result = await provider.createSessionTurn({ ...args, prototypeContext: expected[0] === decision ? { ...context, findingId: 'E1' } : context });
      assert.equal(result.reply, 'Which result contradicts the criterion?');
      assert.deepEqual(result.candidates, expected);
      t.mock.restoreAll();
    }
  }
});
