import { createHash } from 'node:crypto';

export function candidateContentHash(candidate) {
  // IDs and turn labels are provenance, not content. Citation order is not
  // meaningful; preserve exact copy and keep the earliest staged record.
  const content = {
    type: candidate.type, title: candidate.title, question: candidate.question,
    questionId: candidate.questionId, reason: candidate.reason,
    evidence: [...new Set(candidate.evidence ?? [])].sort(),
    ticketType: candidate.ticketType, mode: candidate.mode, target: candidate.target,
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export function dedupeCandidates(staged, incoming) {
  const hashes = new Set();
  const ids = new Set();
  const candidates = [], added = [];
  for (const [items, isNew] of [[staged, false], [incoming, true]]) {
    for (const candidate of items) {
      const hash = candidateContentHash(candidate);
      if (hashes.has(hash) || ids.has(candidate.id)) continue;
      hashes.add(hash); ids.add(candidate.id); candidates.push(candidate);
      if (isNew) added.push(candidate);
    }
  }
  return { candidates, added };
}

export function selectCandidates(staged, candidateIds) {
  const selectedIds = new Set(candidateIds);
  const selected = staged.filter((candidate) => selectedIds.has(candidate.id));
  if (selected.length !== selectedIds.size) return null;
  return { selectedIds, selected };
}

export function applyCandidates(discovery, candidates, { evidenceIds = [] } = {}) {
  for (const candidate of candidates) {
    if (candidate.type === 'destination-draft') {
      discovery.map.destination = candidate.title;
    } else if (candidate.type === 'ticket') {
      discovery.map.openFrontier.push({
        id: candidate.id,
        title: candidate.title,
        type: candidate.ticketType,
        mode: candidate.mode,
        target: candidate.target,
        ...(evidenceIds.length ? { evidence: evidenceIds } : {}),
      });
    } else if (candidate.type === 'fog-question') {
      discovery.map.fogOfWar.push({
        id: candidate.id,
        question: candidate.question,
        ...(evidenceIds.length ? { evidence: evidenceIds } : {}),
      });
    } else if (candidate.type === 'fog-retirement') {
      if (typeof candidate.questionId === 'string' && typeof candidate.reason === 'string' && candidate.reason.trim()) {
        discovery.map.fogOfWar = discovery.map.fogOfWar.filter(question => question.id !== candidate.questionId);
      }
    } else if (candidate.type === 'closed-decision') {
      discovery.map.closedDecisions.push({
        id: candidate.id,
        title: candidate.title,
        confidence: candidate.confidence ?? 'Medium',
        evidence: [...new Set([...(candidate.evidence ?? []), ...evidenceIds])],
      });
    }
  }
}
