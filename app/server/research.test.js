import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { researchContext, researchResult, validateResearchCandidates, validateResearchQuestions } from './research.js';
import { dedupeCandidates } from './candidates.js';
import { MockProvider } from './providers/mock-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { SubscriptionProvider } from './providers/subscription-provider.js';

const finding = { id: 'E1', text: '  Which step repeats?\r\nReceipts repeat.  ', sourceTurn: 'u1' };
const session = { ticketId: 'ticket', objective: 'Examine receipts', evidenceTarget: 'One example', evidence: [finding], lineOfInquiry: [] };
const discovery = { map: { openFrontier: [{ id: 'ticket', type: 'Research', title: session.objective }], fogOfWar: [{ id: 'fog', question: 'Which step repeats?' }] } };
const context = researchContext(discovery, session, finding);
const questions = ['Which source records the repeated step?', 'What observation would contradict the finding?'];
const candidates = [
  { id: 'decision', type: 'closed-decision', title: 'Examine recorded receipts.', confidence: 'Medium', evidence: ['E1'], stagedAfter: 'turn 2' },
  { id: 'retirement', type: 'fog-retirement', questionId: 'fog', reason: 'The finding identifies the step.', evidence: ['E1'], stagedAfter: 'turn 2' },
];
const args = { objective: session.objective, message: finding.text, transcript: [], map: discovery.map, staged: [], researchContext: context };

test('Research questions and candidates validate without inventing evidence', () => {
  assert.equal(context.ticket.type, 'Research');
  assert.equal(context.evidence[0].text, finding.text);
  assert.deepEqual(validateResearchQuestions(questions), questions.map(question => ({ question })));
  for (const invalid of [null, [], ['One question?'], Array(5).fill('Question?'), ['No question', 'Valid?'], ['Duplicate?', 'Duplicate?'], ['x '.repeat(21) + '?', 'Valid?']]) assert.deepEqual(validateResearchQuestions(invalid), []);
  assert.deepEqual(validateResearchCandidates(candidates, context), candidates);
  for (const bad of [{ ...candidates[0], evidence: ['invented'] }, { ...candidates[1], evidence: [] }, { ...candidates[1], questionId: 'missing' }, { ...candidates[0], type: 'destination-draft' }, { ...candidates[0], evidence: ['E2'] }]) assert.deepEqual(validateResearchCandidates([bad], context), []);
  assert.deepEqual(validateResearchCandidates([{ ...candidates[0], evidence: ['E2'] }], { ...context, evidence: [finding, { id: 'E2', text: 'Older finding' }] }), []);
  assert.deepEqual(researchResult('Reply', [{ name: 'stage_research', arguments: '{bad' }], context).candidates, []);
  assert.deepEqual(researchResult('Reply', [{ name: 'stage_research', input: { questions, evidence: [{ id: 'invented', text: 'Model fact' }] } }], context).candidates, []);
  assert.deepEqual(researchResult('Reply', [{ name: 'stage_research', input: { questions } }], { ...context, lineOfInquiry: [{ question: 'Existing?' }] }).inquiries, []);
});

test('mock Research is deterministic and mock intake spans every ticket type', async () => {
  const provider = new MockProvider();
  assert.deepEqual(await provider.createSessionTurn(args), await provider.createSessionTurn(args));
  const opening = await provider.createSessionTurn({ ...args, researchContext: { ...context, evidence: [], findingId: null } });
  assert.equal(opening.inquiries.length, 3);
  assert.deepEqual(opening.candidates, []);
  const result = await provider.createSessionTurn(args);
  assert.deepEqual(result.candidates.map(candidate => candidate.type), ['closed-decision', 'fog-retirement']);
  assert.ok(result.candidates.every(candidate => candidate.evidence.includes('E1')));
  const transcript = [], types = new Set();
  for (let turn = 0; turn < 4; turn++) {
    const result = await provider.createIntakeTurn({ message: 'Receipts', transcript });
    types.add(result.candidates.find(candidate => candidate.type === 'ticket').ticketType);
    transcript.push({ actor: 'You', text: 'Receipts' });
  }
  assert.deepEqual([...types], ['Grilling', 'Prototype', 'Synthesis', 'Research']);
});

test('content hash dedupe ignores provenance and citation order and keeps first staged record', () => {
  const first = { ...candidates[0], evidence: ['E1', 'E2'] };
  const duplicate = { ...first, id: 'new-id', stagedAfter: 'turn 99', confidence: 'High', evidence: ['E2', 'E1', 'E1'] };
  assert.deepEqual(dedupeCandidates([first, duplicate], [duplicate]), { candidates: [first], added: [] });
  const distinct = { ...first, id: 'new-evidence', evidence: ['E1'] };
  assert.deepEqual(dedupeCandidates([first], [duplicate, distinct]), { candidates: [first, distinct], added: [distinct] });
});

const sse = events => new Response(events.map(data => `event: ${data.type ?? 'message'}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('every real transport structures Research and silently degrades malformed output', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'tenbrains-research-transport-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const dir of ['.claude', '.codex', '.grok']) await mkdir(path.join(home, dir));
  await writeFile(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fixture', expiresAt: Date.now() + 3600000 } }));
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: 'fixture', account_id: 'fixture' } }));
  await writeFile(path.join(home, '.grok/auth.json'), JSON.stringify({ 'https://accounts.x.ai/sign-in': { key: 'fixture' } }));
  for (const id of ['anthropic', 'openai', 'claude-subscription', 'codex-subscription', 'grok-subscription']) {
    for (const input of [JSON.stringify({ questions, candidates }), '{broken', JSON.stringify({ questions: ['Bad'], candidates: [{ ...candidates[0], evidence: ['invented'] }] })]) {
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        const system = body.instructions ?? body.system ?? body.messages[0].content;
        assert.ok(system.includes(JSON.stringify(finding.text)));
        assert.ok(system.includes(session.objective));
        assert.ok(system.includes('You investigate outside Ten Brains'));
        assert.deepEqual(body.tools.map(tool => tool.name ?? tool.function.name), ['stage_research', 'offer_choices']);
        if (id === 'codex-subscription') return sse([
          { type: 'response.output_text.delta', delta: 'Which source should You examine?' },
          { type: 'response.output_item.done', item: { type: 'function_call', name: 'stage_research', arguments: input } },
          { type: 'response.completed', response: { status: 'completed' } },
        ]);
        if (id === 'openai' || id === 'grok-subscription') return sse([{ choices: [{ delta: { content: 'Which source should You examine?', tool_calls: [{ index: 0, function: { name: 'stage_research', arguments: input } }] } }] }]);
        return sse([
          { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Which source should You examine?' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'stage', name: 'stage_research', input: {} } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: input } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ]);
      });
      const provider = id === 'anthropic' ? new AnthropicProvider({ apiKey: 'fixture' }) : id === 'openai' ? new OpenAIProvider({ apiKey: 'fixture' }) : new SubscriptionProvider({ id, model: 'fixture', environment: { WAYFINDER_AUTH_HOME: home } });
      const result = await provider.createSessionTurn(args);
      assert.equal(result.reply, 'Which source should You examine?');
      assert.deepEqual(result.candidates, input === JSON.stringify({ questions, candidates }) ? candidates : []);
      assert.deepEqual(result.inquiries, input === JSON.stringify({ questions, candidates }) ? questions.map(question => ({ question })) : []);
      t.mock.restoreAll();
    }
  }
});
