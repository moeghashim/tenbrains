import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { OpenAIProvider } from './openai-provider.js';
import { STAGE_CANDIDATES_TOOL, SUGGEST_INQUIRY_TOOL, contextBlock, sessionContextBlock, buildMessages } from './anthropic-provider.js';
import { subscriptionCredential, authError } from '../subscription-auth.js';

// Never expose upstream bodies (which can echo credentials), or describe every
// transport/model/quota failure as a missing local login.
function subscriptionError(id, error) {
  if (error.publicMessage) return error;
  if (error.status === 401) return authError(id);
  const messages = {
    400: 'request rejected. Check the selected model and provider settings.',
    403: 'access denied. Check subscription permissions and model access.',
    404: 'model or endpoint unavailable. Check the selected model and provider settings.',
    429: 'rate limited. Try this turn again later or check your subscription limits.',
  };
  const safe = new Error('Subscription request failed');
  safe.status = error.status;
  safe.publicMessage = `${id} ${messages[error.status] ?? 'could not complete this turn. Check connectivity and provider settings, then try again.'}`;
  return safe;
}

// Reuse the established candidate parsing and per-surface prompts, not CLI agent execution.
export class SubscriptionProvider extends OpenAIProvider {
  constructor({ id, model, environment }) { super({ model }); this.id = id; this.environment = environment; }
  async streamTurn({ system, transcript, message, tools, onToken }) {
    try {
      const credential = await subscriptionCredential(this.id, this.environment);
      if (this.id === 'grok-subscription') {
        const client = new OpenAI({ apiKey: credential.token, logLevel: 'off', baseURL: 'https://cli-chat-proxy.grok.com/v1', maxRetries: 0, timeout: 60000, defaultHeaders: { 'X-XAI-Token-Auth': 'xai-grok-cli', 'x-grok-model-override': this.model } });
        const stream = await client.chat.completions.create({ model: this.model, stream: true, messages: [{ role: 'system', content: system }, ...buildMessages(transcript, message)], tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) });
        let reply = ''; const calls = new Map();
        for await (const chunk of stream) { const delta = chunk.choices?.[0]?.delta; if (delta?.content) { reply += delta.content; onToken(delta.content); } for (const t of delta?.tool_calls ?? []) { const c = calls.get(t.index) ?? { name: '', arguments: '' }; c.name += t.function?.name ?? ''; c.arguments += t.function?.arguments ?? ''; calls.set(t.index, c); } }
        return { reply, toolCalls: [...calls.values()] };
      }
      if (!credential.account) throw authError(this.id);
      const client = new OpenAI({ apiKey: credential.token, logLevel: 'off', baseURL: 'https://chatgpt.com/backend-api/codex', maxRetries: 0, timeout: 60000, defaultHeaders: { 'ChatGPT-Account-Id': credential.account, originator: 'codex_cli_rs' } });
      const stream = await client.responses.create({ model: this.model, instructions: system, input: buildMessages(transcript, message), store: false, stream: true, tools: tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: false })) });
      let reply = ''; const toolCalls = []; let completed = false;
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') { reply += event.delta; onToken(event.delta); }
        if (event.type === 'response.output_item.done' && event.item.type === 'function_call') toolCalls.push({ name: event.item.name, arguments: event.item.arguments });
        if (event.type === 'response.completed') completed = true;
        if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') throw new Error('Subscription response failed');
      }
      if (!completed) throw new Error('Incomplete subscription response');
      return { reply, toolCalls };
    } catch (error) { throw subscriptionError(this.id, error); }
  }
  async claudeTurn(args, session) {
    try {
      const credential = await subscriptionCredential(this.id, this.environment);
      const client = new Anthropic({ apiKey: null, authToken: credential.token, logLevel: 'off', maxRetries: 0, timeout: 60000, defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } });
      const stream = client.messages.stream({ model: this.model, max_tokens: session ? 1400 : 1200, system: session ? sessionContextBlock(args) : contextBlock(args), messages: buildMessages(args.transcript, args.message), tools: session ? [STAGE_CANDIDATES_TOOL, SUGGEST_INQUIRY_TOOL] : [STAGE_CANDIDATES_TOOL] });
      stream.on('text', text => args.onToken?.(text));
      const final = await stream.finalMessage();
      const reply = final.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const candidates = final.content.filter(b => b.type === 'tool_use' && b.name === 'stage_candidates').flatMap(b => { if (!Array.isArray(b.input?.candidates)) throw new Error('Invalid candidates'); return b.input.candidates; }).filter(c => !session || c.type !== 'destination-draft');
      const inquiries = final.content.filter(b => b.type === 'tool_use' && b.name === 'suggest_inquiry' && typeof b.input?.question === 'string').map(b => ({ question: b.input.question }));
      candidates.forEach(c => args.onCandidate?.(c)); inquiries.forEach(i => args.onInquiry?.(i));
      return { reply, candidates, inquiries };
    } catch (error) { throw subscriptionError(this.id, error); }
  }
  createIntakeTurn(args) { return this.id === 'claude-subscription' ? this.claudeTurn(args, false) : super.createIntakeTurn(args); }
  createSessionTurn(args) { return this.id === 'claude-subscription' ? this.claudeTurn(args, true) : super.createSessionTurn(args); }
}
