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
        ticketType: ['Grilling', 'Prototype', 'Synthesis', 'Research'][(userTurn - 1) % 4],
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

  async createSessionTurn({ message, objective, transcript, synthesisContext, researchContext, prototypeContext, staged = [], onToken = () => {}, onCandidate = () => {}, onInquiry = () => {} }) {
    if (prototypeContext) {
      const { ticket, evidence, findingId } = prototypeContext;
      const report = evidence.find(item => item.id === findingId);
      const stagedAfter = `turn ${transcript.length + 2}`;
      const subject = artifactExcerpt(objective, 8);
      const candidates = [];
      if (report) candidates.push({
        id: candidateId('closed-decision', report.id, transcript.length), type: 'closed-decision',
        title: 'Use the reported result to guide the next review.', confidence: 'Medium', evidence: [report.id], stagedAfter,
      });
      else if (ticket && !ticket.plan && !staged.some(candidate => candidate.type === 'ticket-plan' && candidate.ticketId === ticket.id)) candidates.push({
        id: candidateId('ticket-plan', ticket.id, transcript.length), type: 'ticket-plan', ticketId: ticket.id, stagedAfter,
        criteria: [`One recorded example demonstrates “${subject}”.`, 'Record the elapsed time and any failed steps.'],
        checklist: [`Build one path to test “${subject}”.`, 'Run that path with one concrete example.', 'Record the result against each criterion.'],
      });
      const reply = report ? 'Your report is captured without changes. Which observed result contradicts the success criteria?'
        : ticket ? 'Wayfinder can stage a minimal plan while You build outside Ten Brains. Which criterion should You test first?'
          : 'Which approved Prototype ticket should this session examine?';
      for (const token of reply.match(/\S+\s*/g) ?? []) onToken(token);
      return { reply, candidates, inquiries: [], choices: [
        { label: report ? 'Examine the failed step' : 'Test one concrete example', recommended: true },
        { label: 'Check the success criteria', recommended: false },
      ] };
    }
    if (researchContext) {
      const { evidence, findingId, map, lineOfInquiry } = researchContext;
      const subject = artifactExcerpt(objective, 8);
      const inquiries = lineOfInquiry.length ? [] : [
        { question: `What recorded example would test “${subject}”?` },
        { question: `What observation would contradict “${subject}”?` },
        { question: `Which source can You examine for “${subject}”?` },
      ];
      const finding = evidence.find(item => item.id === findingId);
      const stagedAfter = `turn ${transcript.length + 2}`;
      const candidates = finding ? [{
        id: candidateId('closed-decision', finding.id, transcript.length), type: 'closed-decision',
        title: 'Use the captured finding to guide the next review.', confidence: 'Medium',
        evidence: [finding.id], stagedAfter,
      }] : [];
      if (finding) for (const question of map.fogOfWar) {
        if (finding.text.includes(question.question)) candidates.push({
          id: candidateId('fog-retirement', question.id, transcript.length), type: 'fog-retirement',
          questionId: question.id, reason: 'The captured finding addresses this fog question for review.',
          evidence: [finding.id], stagedAfter,
        });
      }
      const reply = finding ? 'Your finding is captured without changes. Which claim should You check against it first?'
        : 'Wayfinder can structure the research while You investigate outside Ten Brains. Which source should You examine first?';
      for (const token of reply.match(/\S+\s*/g) ?? []) onToken(token);
      return { reply, candidates, inquiries, choices: [{ label: 'Examine a recorded example', recommended: true }, { label: 'Look for contradictory evidence', recommended: false }] };
    }
    if (synthesisContext) {
      const { evidence, map } = synthesisContext;
      const stagedAfter = `turn ${transcript.length + 2}`;
      const candidates = [];
      if (evidence.length) {
        candidates.push({
          id: candidateId('closed-decision', evidence.map(item => item.id).join(','), transcript.length),
          type: 'closed-decision', title: 'Use recorded examples to guide the next review.',
          confidence: 'Medium', evidence: evidence.map(item => item.id), stagedAfter,
        });
        candidates.push({
          id: candidateId('destination-draft', objective, transcript.length), type: 'destination-draft',
          title: `You can evaluate ${artifactExcerpt(objective, 12)} against recorded evidence.`, stagedAfter,
        });
        // Conservative keyless rule: only retire a fog question explicitly
        // present in captured evidence, not arbitrary unrelated fog.
        for (const question of map.fogOfWar) {
          if (evidence.some(item => item.text.includes(question.question))) candidates.push({
            id: candidateId('fog-retirement', question.id, transcript.length), type: 'fog-retirement',
            questionId: question.id, reason: 'Recorded evidence addresses this fog question for review.', stagedAfter,
          });
        }
      }
      const reply = evidence.length
        ? 'Wayfinder compared the recorded evidence across sessions. Which part of this staged update should You examine first?'
        : 'No evidence has been captured yet. Which concrete example should You record first?';
      for (const token of reply.match(/\S+\s*/g) ?? []) onToken(token);
      return { reply, candidates, inquiries: [], choices: [
        { label: evidence.length ? 'Examine the evidence' : 'Record an example', recommended: true },
        { label: 'Revisit the Destination', recommended: false },
      ] };
    }
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
