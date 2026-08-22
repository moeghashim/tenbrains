function compact(text, maximum = 110) {
  const normalized = text.trim()
    .replace(/[!?]/g, '')
    .replace(/\b(maybe|perhaps)\b/gi, '')
    .replace(/\bwe think\b/gi, '')
    .replace(/\bsort of\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/g, '')
    .trim() || 'this idea';
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function artifactExcerpt(text, maximumWords) {
  return compact(text, 72)
    .replace(/\b(maybe|perhaps)\b/gi, '')
    .replace(/\bwe think\b/gi, '')
    .replace(/\bsort of\b/gi, '')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, maximumWords)
    .join(' ');
}

function slug(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function candidateId(type, source, turn) {
  return `${type}-${turn}-${slug(source)}`;
}

export class MockProvider {
  async createIntakeTurn({ message, transcript, onToken = () => {}, onCandidate = () => {} }) {
    const idea = compact(message);
    const userTurn = transcript.filter((item) => item.actor === 'You').length + 1;
    const questions = [
      `You described “${idea}.” Who feels this problem first?`,
      `You said “${idea}.” What observable change would show this discovery worked?`,
      `You described “${idea}.” What evidence would justify stopping this discovery?`,
      `You said “${idea}.” Which constraint must the first ticket respect?`,
    ];
    const reply = questions[(userTurn - 1) % questions.length];
    const stagedAfter = `turn ${transcript.length + 2}`;
    const ticketIdea = artifactExcerpt(idea, 16);
    const destinationIdea = artifactExcerpt(idea, 10);
    const fogIdea = artifactExcerpt(idea, 12);
    const candidates = [
      {
        id: candidateId('ticket', idea, userTurn),
        type: 'ticket',
        title: `Test ${ticketIdea}`,
        ticketType: userTurn % 2 === 0 ? 'Prototype' : 'Grilling',
        mode: 'You + Wayfinder',
        target: '1 concrete example',
        stagedAfter,
      },
      {
        id: candidateId('fog-question', idea, userTurn),
        type: 'fog-question',
        question: `What evidence would disprove “${fogIdea}”?`,
        stagedAfter,
      },
    ];

    if (userTurn >= 2) {
      candidates.unshift({
        id: candidateId('destination-draft', idea, userTurn),
        type: 'destination-draft',
        title: `You can decide whether to build or kill ${destinationIdea}.`,
        stagedAfter,
      });
    }

    for (const token of reply.match(/\S+\s*/g) ?? []) onToken(token);
    for (const candidate of candidates) onCandidate(candidate);
    return { reply, candidates };
  }
}
