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
