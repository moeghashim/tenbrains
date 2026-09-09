import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChoices, choicesFromTools, pickedChoice } from './choices.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';

const choices = [
  { label: 'Use evidence', detail: 'Start with one recorded example.', recommended: true },
  { label: 'Try another example', recommended: false },
];

test('choice validation rejects malformed offers without repairing or inventing options', () => {
  assert.deepEqual(validateChoices(choices), choices);
  for (const bad of [null, {}, [], Array(5).fill(choices[0]), [null], ['label'],
    [{ label: '', recommended: true }], [{ label: 'one two three four five six seven eight nine', recommended: true }],
    [{ label: 'x', recommended: 'true' }], [{ label: 'x' }],
    [{ label: 'x', recommended: false }], [choices[0], choices[0]],
    [{ ...choices[0], detail: 1 }], [{ ...choices[0], detail: 'word '.repeat(21) }],
    [{ ...choices[0], label: 'a\nb' }], [{ ...choices[0], detail: '' }]]) {
    assert.equal(validateChoices(bad), undefined);
  }
  assert.equal(choicesFromTools([{ name: 'offer_choices', arguments: '{broken' }]), undefined);
  assert.equal(choicesFromTools([{ name: 'offer_choices', input: { choices } }, { name: 'offer_choices', input: { choices } }]), undefined);
  const transcript = [{ actor: 'Wayfinder', choices }, { actor: 'You', text: 'answered' }];
  assert.equal(pickedChoice(transcript, 'Use evidence', 'Use evidence'), undefined);
  assert.equal(pickedChoice(transcript.slice(0, 1), 'free', {}), undefined);
  assert.equal(pickedChoice(transcript.slice(0, 1), 'Use evidence'), 'Use evidence');
});

const sse = events => new Response(events.map(data => `event: ${data.type ?? 'message'}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('API transports offer the structured tool on both surfaces and discard invalid optional output', async t => {
  for (const kind of ['openai', 'anthropic']) {
    for (const args of [JSON.stringify({ choices }), '{broken', JSON.stringify({ choices: [{ label: 'x', recommended: false }] })]) {
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.ok(body.tools.some(tool => (tool.name ?? tool.function?.name) === 'offer_choices'));
        assert.match(body.system ?? body.messages[0].content, /at most 8 words/);
        if (kind === 'openai') return sse([{ choices: [{ delta: { content: 'Which example?', tool_calls: [{ index: 0, function: { name: 'offer_choices', arguments: args } }] } }] }]);
        return sse([
          { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Which example?' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'offer', name: 'offer_choices', input: {} } },
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: args } },
          { type: 'content_block_stop', index: 1 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ]);
      });
      const provider = kind === 'openai' ? new OpenAIProvider({ apiKey: 'fixture' }) : new AnthropicProvider({ apiKey: 'fixture' });
      for (const method of ['createIntakeTurn', 'createSessionTurn']) {
        const tokens = [];
        const result = await provider[method]({ message: 'Example', transcript: [], map: {}, staged: [], objective: 'Test', evidenceTarget: 'Example', lineOfInquiry: [], evidence: [], onToken: text => tokens.push(text) });
        assert.equal(result.reply, 'Which example?');
        assert.equal(tokens.join(''), result.reply);
        assert.deepEqual(result.choices, args === JSON.stringify({ choices }) ? choices : undefined);
      }
      t.mock.restoreAll();
    }
  }
});
