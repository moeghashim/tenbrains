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
    const labels = [
      ['You', 'Someone You observed', 'No concrete example yet'],
      ['Less time spent', 'Fewer repeated steps', 'A clearer next step'],
      ['No repeated need', 'No observable benefit', 'A simpler option works'],
      ['Available time', 'Existing evidence', 'Cost'],
    ][(userTurn - 1) % questions.length];
    return { reply, candidates, choices: labels.map((label, index) => ({ label, recommended: index === 0 })) };
  }

  async createSessionTurn({ message, objective, transcript, onToken = () => {}, onCandidate = () => {}, onInquiry = () => {} }) {
    const answer = compact(message);
    const objectiveText = artifactExcerpt(objective, 10);
    const answerText = artifactExcerpt(answer, 11);
    const userTurn = transcript.filter((item) => item.actor === 'You').length + 1;
    const questions = [
      `You said “${answer}.” What happened immediately before that?`,
      `Against “${objectiveText},” what concrete behavior supports that answer?`,
      `You described “${answer}.” What would have changed the outcome?`,
    ];
    const reply = questions[(userTurn - 1) % questions.length];
    const stagedAfter = `turn ${transcript.length + 2}`;
    const candidates = [
      {
        id: candidateId('fog-question', `session-${answer}`, userTurn),
        type: 'fog-question',
        question: `What evidence would disprove “${answerText}”?`,
        stagedAfter,
      },
      {
        id: candidateId('closed-decision', `session-${answer}`, userTurn),
        type: 'closed-decision',
        title: `Evidence supports ${answerText}.`,
        confidence: 'Medium',
        evidence: [],
        stagedAfter,
      },
      {
        id: candidateId('ticket', `session-${answer}`, userTurn),
        type: 'ticket',
        title: /^test\s/i.test(objectiveText) ? objectiveText : `Test ${objectiveText}`,
        ticketType: 'Grilling',
        mode: 'You + Wayfinder',
        target: '3 concrete examples',
        stagedAfter,
      },
    ];
    const inquiries = [{ question: `What evidence would contradict “${answerText}”?` }];
    for (const token of reply.match(/\S+\s*/g) ?? []) onToken(token);
    for (const candidate of candidates) onCandidate(candidate);
    for (const inquiry of inquiries) onInquiry(inquiry);
    const labels = [
      ['A repeated step', 'A missing detail', 'No concrete example yet'],
      ['Repeated behavior', 'A recorded example', 'No evidence yet'],
      ['Earlier evidence', 'A smaller first step', 'More time'],
    ][(userTurn - 1) % questions.length];
    return { reply, candidates, inquiries, choices: labels.map((label, index) => ({ label, recommended: index === 0 })) };
  }
}
