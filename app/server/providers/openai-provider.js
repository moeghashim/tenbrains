import OpenAI from 'openai';
import {
  SESSION_PROMPT,
  STAGE_CANDIDATES_TOOL,
  SUGGEST_INQUIRY_TOOL,
  SYSTEM_PROMPT,
} from './anthropic-provider.js';

class OpenAIProviderError extends Error {
  constructor(message, { publicMessage, status } = {}) {
    super(message);
    this.name = 'OpenAIProviderError';
    this.publicMessage = publicMessage;
    this.status = status;
  }
}

function buildMessages(system, transcript, message) {
  return [
    { role: 'system', content: system },
    { role: 'user', content: 'You opened this discovery.' },
    ...transcript.map((entry) => ({
      role: entry.actor === 'Wayfinder' ? 'assistant' : 'user',
      content: entry.text,
    })),
    { role: 'user', content: message },
  ];
}

function intakeContext({ map, staged, transcript }) {
  const currentTurn = `turn ${transcript.length + 2}`;
  return `${SYSTEM_PROMPT}\n\nRead-only discovery context\nCurrent turn label: ${currentTurn}\nCurrent map JSON: ${JSON.stringify(map)}\nCurrent staged candidates JSON: ${JSON.stringify(staged)}`;
}

function sessionContext({ objective, evidenceTarget, mode, lineOfInquiry, transcript, evidence, map, staged }) {
  const currentTurn = `turn ${transcript.length + 2}`;
  return `${SESSION_PROMPT}\n\nRead-only session context\nCurrent turn label: ${currentTurn}\nObjective: ${objective}\nEvidence target: ${evidenceTarget}\nMode: ${mode}\nLine of Inquiry JSON: ${JSON.stringify(lineOfInquiry)}\nEvidence JSON: ${JSON.stringify(evidence)}\nCurrent map JSON: ${JSON.stringify(map)}\nCurrent session candidates JSON: ${JSON.stringify(staged)}`;
}

function openAITool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

function parseToolArguments(toolCall) {
  try {
    return JSON.parse(toolCall.arguments || '{}');
  } catch {
    throw new OpenAIProviderError('OpenAI returned invalid tool arguments', {
      publicMessage: 'Wayfinder returned invalid staged candidates. Try again.',
    });
  }
}

function candidatesFromInput(input) {
  if (!input || !Array.isArray(input.candidates)) {
    throw new OpenAIProviderError('stage_candidates returned invalid input', {
      publicMessage: 'Wayfinder returned invalid staged candidates. Try again.',
    });
  }
  return input.candidates;
}

function providerError(error) {
  if (error instanceof OpenAIProviderError) return error;
  if (error?.status === 401) {
    return new OpenAIProviderError('OpenAI authentication failed', {
      publicMessage: 'OpenAI authentication failed. Check OPENAI_API_KEY.',
      status: 401,
    });
  }
  if (error?.status === 429) {
    return new OpenAIProviderError('OpenAI rate limit reached', {
      publicMessage: 'OpenAI is rate limited. Try this turn again shortly.',
      status: 429,
    });
  }
  return new OpenAIProviderError('OpenAI-compatible request failed', {
    publicMessage: 'OpenAI could not complete this turn. Check the provider settings and try again.',
    status: error?.status,
  });
}

export class OpenAIProvider {
  constructor({ apiKey, baseURL = 'https://api.openai.com/v1', model = 'gpt-5.6-luna' } = {}) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
  }

  async streamTurn({ system, transcript, message, tools, onToken }) {
    if (!this.apiKey) {
      throw new OpenAIProviderError('OpenAI API key is missing', {
        publicMessage: 'OpenAI API key is missing. Set OPENAI_API_KEY or use mock mode.',
      });
    }
    try {
      const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
      const stream = await client.chat.completions.create({
        model: this.model,
        messages: buildMessages(system, transcript, message),
        tools: tools.map(openAITool),
        tool_choice: 'auto',
        stream: true,
      });
      let reply = '';
      const toolCalls = new Map();
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') {
          reply += delta.content;
          onToken(delta.content);
        }
        for (const toolDelta of delta?.tool_calls ?? []) {
          const index = toolDelta.index ?? 0;
          const current = toolCalls.get(index) ?? { name: '', arguments: '' };
          if (toolDelta.function?.name) current.name += toolDelta.function.name;
          if (toolDelta.function?.arguments) current.arguments += toolDelta.function.arguments;
          toolCalls.set(index, current);
        }
      }
      return { reply, toolCalls: [...toolCalls.values()] };
    } catch (error) {
      throw providerError(error);
    }
  }

  async createIntakeTurn({ message, transcript, map, staged, onToken = () => {}, onCandidate = () => {} }) {
    const { reply, toolCalls } = await this.streamTurn({
      system: intakeContext({ map, staged, transcript }),
      transcript,
      message,
      tools: [STAGE_CANDIDATES_TOOL],
      onToken,
    });
    const candidates = toolCalls
      .filter((call) => call.name === 'stage_candidates')
      .flatMap((call) => candidatesFromInput(parseToolArguments(call)));
    for (const candidate of candidates) onCandidate(candidate);
    return { reply, candidates };
  }

  async createSessionTurn({
    message,
    objective,
    evidenceTarget,
    mode,
    lineOfInquiry,
    transcript,
    evidence,
    map,
    staged,
    onToken = () => {},
    onCandidate = () => {},
    onInquiry = () => {},
  }) {
    const { reply, toolCalls } = await this.streamTurn({
      system: sessionContext({ objective, evidenceTarget, mode, lineOfInquiry, transcript, evidence, map, staged }),
      transcript,
      message,
      tools: [STAGE_CANDIDATES_TOOL, SUGGEST_INQUIRY_TOOL],
      onToken,
    });
    const candidates = toolCalls
      .filter((call) => call.name === 'stage_candidates')
      .flatMap((call) => candidatesFromInput(parseToolArguments(call)))
      .filter((candidate) => candidate.type !== 'destination-draft');
    const inquiries = toolCalls
      .filter((call) => call.name === 'suggest_inquiry')
      .map((call) => parseToolArguments(call))
      .filter((input) => typeof input.question === 'string')
      .map((input) => ({ question: input.question }));
    for (const candidate of candidates) onCandidate(candidate);
    for (const inquiry of inquiries) onInquiry(inquiry);
    return { reply, candidates, inquiries };
  }
}
