import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are Wayfinder inside Ten Brains. You run a focused intake session that turns a vague idea into reviewable map candidates.

Two-actor model
- The only actors are You, Wayfinder, and the joint mode You + Wayfinder.
- Never call either actor a team, participant, user account, member, teammate, collaborator, assistant, bot, agent, model, or co-pilot.
- Address the human as You. Refer to yourself as Wayfinder.

Product model and authority
- A discovery contains a Destination, Open Frontier, Fog of War, and Closed Decisions.
- The Destination states the desired outcome.
- The Open Frontier contains actionable tickets.
- The Fog of War contains unresolved fog questions.
- Closed Decisions contain evidence-backed commitments.
- You can only stage candidates with the stage_candidates tool.
- Never claim that you changed, applied, created, updated, or wrote the map.
- Never output map writes. The map changes only after You explicitly approve staged candidates.
- Treat the supplied map and staged candidates as read-only context.

Intake behavior
- Be relentless but concrete. Pressure-test the latest answer with a specific follow-up.
- Ask exactly one question in every conversational turn.
- Prefer observed behavior, constraints, contradictions, evidence, and measurable outcomes over feature requests.
- Use the full transcript to build on prior answers. Do not repeat a resolved question.
- Write a short Wayfinder turn before any tool call. Do not put candidate JSON in conversational text.
- Call stage_candidates each turn when the answer supports reviewable candidates. Candidates remain staged only.

Wayfinder voice
- Use natural, short sentences in sentence case.
- Use active voice.
- Do not use exclamation marks.
- Remove hedging filler: maybe, perhaps, we think, and sort of.
- Quote evidence verbatim when you quote it.
- Ask no more than one question.
- Use canonical vocabulary: Ten Brains, Wayfinder, You, Destination, Open Frontier, Fog of War, fog, Closed Decision, ticket, evidence, discovery, and session.
- Do not substitute goal, north star, backlog, kanban, unknowns, risks, task, card, work item, issue, project, workspace, meeting, interview call, workshop, or chat room for canonical terms.

Candidate copy hard rules
- Every sentence contains 20 words or fewer and states one idea.
- Use active voice and sentence case.
- Ticket titles use imperative mood and start with a verb.
- Each fog question is exactly one question and ends with ?
- Destination drafts state one concrete desired outcome.
- Closed Decision titles state declarative commitments. Use verb-first wording where natural.
- Remove hedging filler and marketing adjectives.
- Use ticket for actionable work. Never use task, card, work item, issue, or to-do.
- Use only You, Wayfinder, or You + Wayfinder as actors and modes.
- Ticket type must be Grilling, Research, Prototype, or Synthesis.
- Work mode must be You, Wayfinder, or You + Wayfinder.

Tool use
- Send all reviewable candidates through stage_candidates.
- Preserve the exact candidate field names and enum values in the tool schema.
- Give each candidate a unique stable id that starts with its type.
- Set stagedAfter to the supplied current turn label.
- Never stage a duplicate of an existing map item or staged candidate.`;

const STAGE_CANDIDATES_TOOL = {
  name: 'stage_candidates',
  description: 'Stage typed Destination, ticket, fog, or Closed Decision candidates for Your explicit review. This tool never mutates the map.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1 },
                type: { const: 'destination-draft' },
                title: { type: 'string', minLength: 1 },
                stagedAfter: { type: 'string', minLength: 1 },
              },
              required: ['id', 'type', 'title', 'stagedAfter'],
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1 },
                type: { const: 'ticket' },
                title: { type: 'string', minLength: 1 },
                ticketType: { enum: ['Grilling', 'Research', 'Prototype', 'Synthesis'] },
                mode: { enum: ['You', 'Wayfinder', 'You + Wayfinder'] },
                target: { type: 'string', minLength: 1 },
                stagedAfter: { type: 'string', minLength: 1 },
              },
              required: ['id', 'type', 'title', 'ticketType', 'mode', 'target', 'stagedAfter'],
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1 },
                type: { const: 'fog-question' },
                question: { type: 'string', minLength: 1 },
                stagedAfter: { type: 'string', minLength: 1 },
              },
              required: ['id', 'type', 'question', 'stagedAfter'],
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1 },
                type: { const: 'closed-decision' },
                title: { type: 'string', minLength: 1 },
                confidence: { enum: ['High', 'Medium'] },
                evidence: { type: 'array', items: { type: 'string', minLength: 1 } },
                stagedAfter: { type: 'string', minLength: 1 },
              },
              required: ['id', 'type', 'title', 'confidence', 'evidence', 'stagedAfter'],
            },
          ],
        },
      },
    },
    required: ['candidates'],
  },
};

const SUGGEST_INQUIRY_TOOL = {
  name: 'suggest_inquiry',
  description: 'Suggest one editable Line of Inquiry question for Your session. This does not change the map.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      question: { type: 'string', minLength: 1 },
    },
    required: ['question'],
  },
};

const SESSION_PROMPT = `${SYSTEM_PROMPT}\n\nGrilling session behavior\n- Grill against the supplied session objective and evidence target.\n- Ask one concrete follow-up question that tests behavior, evidence, a constraint, or a contradiction.\n- Use the Line of Inquiry as guidance, not a script.\n- Stage only fog-question, closed-decision, or ticket candidates during a Grilling session. Never stage a Destination draft.\n- Closed Decisions must cite supplied evidence IDs when evidence supports them.\n- You may call suggest_inquiry once with one editable next question. The question must be sentence case and end with ?.\n- Keep the session map, evidence, and staged candidates read-only.`;

export class ProviderError extends Error {
  constructor(message, { publicMessage, status } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.publicMessage = publicMessage;
    this.status = status;
  }
}

function buildMessages(transcript, message) {
  return [
    { role: 'user', content: 'You opened this discovery.' },
    ...transcript.map((entry) => ({
      role: entry.actor === 'Wayfinder' ? 'assistant' : 'user',
      content: entry.text,
    })),
    { role: 'user', content: message },
  ];
}

function contextBlock({ map, staged, transcript }) {
  const currentTurn = `turn ${transcript.length + 2}`;
  return `${SYSTEM_PROMPT}\n\nRead-only discovery context\nCurrent turn label: ${currentTurn}\nCurrent map JSON: ${JSON.stringify(map)}\nCurrent staged candidates JSON: ${JSON.stringify(staged)}`;
}

function sessionContextBlock({ objective, evidenceTarget, mode, lineOfInquiry, transcript, evidence, map, staged }) {
  const currentTurn = `turn ${transcript.length + 2}`;
  return `${SESSION_PROMPT}\n\nRead-only session context\nCurrent turn label: ${currentTurn}\nObjective: ${objective}\nEvidence target: ${evidenceTarget}\nMode: ${mode}\nLine of Inquiry JSON: ${JSON.stringify(lineOfInquiry)}\nEvidence JSON: ${JSON.stringify(evidence)}\nCurrent map JSON: ${JSON.stringify(map)}\nCurrent session candidates JSON: ${JSON.stringify(staged)}`;
}

function candidatesFromToolInput(input) {
  if (!input || !Array.isArray(input.candidates)) {
    throw new ProviderError('stage_candidates returned invalid input', {
      publicMessage: 'Wayfinder returned invalid staged candidates. Try again.',
    });
  }
  return input.candidates;
}

function publicProviderError(error) {
  if (error instanceof ProviderError) return error;
  if (error?.status === 401) {
    return new ProviderError('Anthropic authentication failed', {
      publicMessage: 'Anthropic authentication failed. Check ANTHROPIC_API_KEY.',
      status: 401,
    });
  }
  if (error?.status === 429) {
    return new ProviderError('Anthropic rate limit reached', {
      publicMessage: 'Anthropic is rate limited. Try this turn again shortly.',
      status: 429,
    });
  }
  return new ProviderError('Anthropic request failed', {
    publicMessage: 'Anthropic could not complete this turn. Try again.',
    status: error?.status,
  });
}

export class AnthropicProvider {
  constructor({ apiKey, model = 'claude-sonnet-5' } = {}) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async createIntakeTurn({ message, transcript, map, staged, onToken = () => {}, onCandidate = () => {} }) {
    if (!this.apiKey) {
      throw new ProviderError('Anthropic API key is missing', {
        publicMessage: 'Anthropic API key is missing. Set ANTHROPIC_API_KEY or use mock mode.',
      });
    }

    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: 1200,
        system: contextBlock({ map, staged, transcript }),
        messages: buildMessages(transcript, message),
        tools: [STAGE_CANDIDATES_TOOL],
      });
      stream.on('text', (text) => onToken(text));
      const finalMessage = await stream.finalMessage();
      const reply = finalMessage.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const candidates = finalMessage.content
        .filter((block) => block.type === 'tool_use' && block.name === 'stage_candidates')
        .flatMap((block) => candidatesFromToolInput(block.input));
      for (const candidate of candidates) onCandidate(candidate);
      return { reply, candidates };
    } catch (error) {
      throw publicProviderError(error);
    }
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
    if (!this.apiKey) {
      throw new ProviderError('Anthropic API key is missing', {
        publicMessage: 'Anthropic API key is missing. Set ANTHROPIC_API_KEY or use mock mode.',
      });
    }
    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: 1400,
        system: sessionContextBlock({ objective, evidenceTarget, mode, lineOfInquiry, transcript, evidence, map, staged }),
        messages: buildMessages(transcript, message),
        tools: [STAGE_CANDIDATES_TOOL, SUGGEST_INQUIRY_TOOL],
      });
      stream.on('text', (text) => onToken(text));
      const finalMessage = await stream.finalMessage();
      const reply = finalMessage.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const candidates = finalMessage.content
        .filter((block) => block.type === 'tool_use' && block.name === 'stage_candidates')
        .flatMap((block) => candidatesFromToolInput(block.input))
        .filter((candidate) => candidate.type !== 'destination-draft');
      const inquiries = finalMessage.content
        .filter((block) => block.type === 'tool_use' && block.name === 'suggest_inquiry' && typeof block.input?.question === 'string')
        .map((block) => ({ question: block.input.question }));
      for (const candidate of candidates) onCandidate(candidate);
      for (const inquiry of inquiries) onInquiry(inquiry);
      return { reply, candidates, inquiries };
    } catch (error) {
      throw publicProviderError(error);
    }
  }
}

export { SESSION_PROMPT, STAGE_CANDIDATES_TOOL, SUGGEST_INQUIRY_TOOL, SYSTEM_PROMPT };
