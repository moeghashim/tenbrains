import { useId } from 'react';
import type { SVGProps } from 'react';

export type SessionMapActor = 'You' | 'Wayfinder';
export type SessionMapMode = 'You' | 'Wayfinder' | 'You + Wayfinder';
export type SessionMapUpdateType = 'destination-draft' | 'fog-question' | 'closed-decision' | 'open-frontier-ticket';

export type SessionMapTranscriptTurn = {
  id?: string;
  time?: string;
  actor: SessionMapActor;
  text: string;
  annotation?: string;
  evidenceFlag?: string;
};

export type SessionMapEvidenceItem = {
  id: string;
  text: string;
  sourceTurnId?: string;
  sourceTurnIndex?: number;
};

export type SessionMapCandidateUpdate = {
  id: string;
  type: SessionMapUpdateType;
  title: string;
  sourceTurnId?: string;
  sourceTurnIndex?: number;
  evidenceIds?: string[];
};

export type SessionMapData = {
  meta: {
    title: string;
    objective: string;
    evidenceTarget: string;
    progress: string;
    mode: SessionMapMode;
  };
  transcript: SessionMapTranscriptTurn[];
  evidenceCaptured: SessionMapEvidenceItem[];
  candidateUpdates: SessionMapCandidateUpdate[];
  outcome: {
    stagedCount: number;
    reviewState: string;
  };
};

type SessionMapProps = SVGProps<SVGSVGElement> & {
  data: SessionMapData;
};

type TurnLayout = {
  turn: SessionMapTranscriptTurn;
  index: number;
  isKeyMoment: boolean;
  y: number;
  height: number;
  centerY: number;
};

type BranchLayout<T> = {
  item: T;
  sourceIndex: number;
  y: number;
  height: number;
  centerY: number;
};

const SVG_WIDTH = 1180;
const TOP_Y = 36;
const CENTER_X = 560;
const NO_EVIDENCE_HORIZONTAL_OFFSET = -150;
const TOP_NODE_WIDTH = 384;
const TOP_NODE_HEIGHT = 150;
const MOMENT_WIDTH = 380;
const MOMENT_HEIGHT = 104;
const STEP_HEIGHT = 34;
const TURN_GAP = 24;
const EVIDENCE_X = 52;
const EVIDENCE_WIDTH = 274;
const EVIDENCE_HEIGHT = 82;
const CANDIDATE_X = 808;
const CANDIDATE_WIDTH = 320;
const CANDIDATE_HEIGHT = 92;
const FOG_CANDIDATE_HEIGHT = 108;
const DESTINATION_CANDIDATE_HEIGHT = 124;
const BRANCH_GAP = 14;
const OUTCOME_WIDTH = 384;
const OUTCOME_HEIGHT = 112;

function wrapText(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];

  for (const word of words) {
    const current = lines[lines.length - 1];

    if (!current) {
      lines.push(word);
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      break;
    }
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const rendered = lines.join(' ');
  if (rendered.length < text.trim().length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }

  return lines;
}

function quoteExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 96) {
    return `“${normalized}”`;
  }

  const clipped = normalized.slice(0, 95).replace(/\s+\S*$/, '');
  return `“${clipped}…”`;
}

function sourceIndexFor(
  source: { sourceTurnId?: string; sourceTurnIndex?: number },
  transcript: SessionMapTranscriptTurn[],
  fallbackIndex: number,
) {
  if (typeof source.sourceTurnIndex === 'number' && transcript[source.sourceTurnIndex]) {
    return source.sourceTurnIndex;
  }

  if (source.sourceTurnId) {
    const index = transcript.findIndex((turn) => turn.id === source.sourceTurnId);
    if (index >= 0) return index;
  }

  return fallbackIndex;
}

function getCandidateLabel(type: SessionMapUpdateType) {
  if (type === 'destination-draft') return 'Destination draft';
  if (type === 'fog-question') return 'Fog of War question';
  if (type === 'closed-decision') return 'Closed Decision';
  return 'Open Frontier ticket';
}

function getCandidateClass(type: SessionMapUpdateType) {
  if (type === 'destination-draft') return 'session-map-candidate-destination';
  if (type === 'fog-question') return 'session-map-candidate-fog';
  if (type === 'closed-decision') return 'session-map-candidate-closed';
  return 'session-map-candidate-frontier';
}

function getCandidateEdgeClass(type: SessionMapUpdateType) {
  if (type === 'fog-question') return 'session-map-path-fog';
  if (type === 'closed-decision') return 'session-map-path-success';
  return 'session-map-path-neutral';
}

function getCandidateMarker(type: SessionMapUpdateType, markerIds: Record<'accent' | 'neutral' | 'warning' | 'success', string>) {
  if (type === 'fog-question') return markerIds.warning;
  if (type === 'closed-decision') return markerIds.success;
  return markerIds.neutral;
}

function curvePath(startX: number, startY: number, endX: number, endY: number) {
  const midX = startX + (endX - startX) / 2;
  return `M${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function findLastKeyIndex(transcript: SessionMapTranscriptTurn[], evidenceSourceIndexes: Set<number>) {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const turn = transcript[index];
    if (Boolean(turn.annotation ?? turn.evidenceFlag) || evidenceSourceIndexes.has(index)) {
      return index;
    }
  }

  return 0;
}

function TextLines({
  x,
  y,
  lines,
  className,
  lineHeight = 18,
  textAnchor,
}: {
  x: number;
  y: number;
  lines: string[];
  className: string;
  lineHeight?: number;
  textAnchor?: 'start' | 'middle';
}) {
  return (
    <text x={x} y={y} className={className} textAnchor={textAnchor}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function layoutBranches<T extends { sourceTurnId?: string; sourceTurnIndex?: number }>(
  items: T[],
  transcript: SessionMapTranscriptTurn[],
  turnLayouts: TurnLayout[],
  fallbackIndex: number,
  itemHeight: number | ((item: T) => number),
) {
  const positionsBySource = new Map<number, T[]>();

  for (const item of items) {
    const sourceIndex = sourceIndexFor(item, transcript, fallbackIndex);
    const sourceItems = positionsBySource.get(sourceIndex) ?? [];
    sourceItems.push(item);
    positionsBySource.set(sourceIndex, sourceItems);
  }

  const layouts: BranchLayout<T>[] = [];

  for (const [sourceIndex, sourceItems] of positionsBySource) {
    const sourceLayout = turnLayouts[sourceIndex] ?? turnLayouts[fallbackIndex] ?? turnLayouts[0];
    const sourceItemHeights = sourceItems.map((item) => typeof itemHeight === 'number' ? itemHeight : itemHeight(item));
    const groupHeight = sourceItemHeights.reduce((total, height) => total + height, 0) + Math.max(0, sourceItems.length - 1) * BRANCH_GAP;
    const startY = sourceLayout.centerY - groupHeight / 2;
    let itemY = startY;

    sourceItems.forEach((item, itemIndex) => {
      const height = sourceItemHeights[itemIndex];
      layouts.push({
        item,
        sourceIndex,
        y: itemY,
        height,
        centerY: itemY + height / 2,
      });
      itemY += height + BRANCH_GAP;
    });
  }

  layouts.sort((a, b) => a.y - b.y);

  let previousBottom = TOP_Y + TOP_NODE_HEIGHT + 20;
  for (const layout of layouts) {
    if (layout.y < previousBottom) {
      layout.y = previousBottom;
      layout.centerY = layout.y + layout.height / 2;
    }
    previousBottom = layout.y + layout.height + BRANCH_GAP;
  }

  return layouts;
}

export function SessionMap({ data, className, ...props }: SessionMapProps) {
  const horizontalOffset = data.evidenceCaptured.length === 0 ? NO_EVIDENCE_HORIZONTAL_OFFSET : 0;
  const centerX = CENTER_X + horizontalOffset;
  const momentX = centerX - MOMENT_WIDTH / 2;
  const candidateX = CANDIDATE_X + horizontalOffset;
  const outcomeX = centerX - OUTCOME_WIDTH / 2;
  const generatedId = useId().replace(/:/g, '');
  const markerIds = {
    accent: `${generatedId}-session-map-arrow-accent`,
    neutral: `${generatedId}-session-map-arrow-neutral`,
    warning: `${generatedId}-session-map-arrow-warning`,
    success: `${generatedId}-session-map-arrow-success`,
  };
  const titleId = `${generatedId}-session-map-title`;
  const descId = `${generatedId}-session-map-desc`;
  const evidenceSourceIndexes = new Set(
    data.evidenceCaptured.map((item) => sourceIndexFor(item, data.transcript, 0)),
  );
  const candidateSourceIndexes = new Set(
    data.candidateUpdates.map((item) => sourceIndexFor(item, data.transcript, 0)),
  );
  const lastKeyIndex = findLastKeyIndex(data.transcript, evidenceSourceIndexes);

  let nextY = TOP_Y + TOP_NODE_HEIGHT + 54;
  const turnLayouts: TurnLayout[] = data.transcript.map((turn, index) => {
    const isKeyMoment = Boolean(turn.annotation ?? turn.evidenceFlag) || evidenceSourceIndexes.has(index);
    const height = isKeyMoment ? MOMENT_HEIGHT : STEP_HEIGHT;
    const layout = {
      turn,
      index,
      isKeyMoment,
      y: nextY,
      height,
      centerY: nextY + height / 2,
    };
    nextY += height + TURN_GAP;
    return layout;
  });

  const evidenceLayouts = layoutBranches(
    data.evidenceCaptured,
    data.transcript,
    turnLayouts,
    lastKeyIndex,
    EVIDENCE_HEIGHT,
  );
  const candidateLayouts = layoutBranches(
    data.candidateUpdates,
    data.transcript,
    turnLayouts,
    lastKeyIndex,
    (item) => {
      if (item.type === 'destination-draft') return DESTINATION_CANDIDATE_HEIGHT;
      if (item.type === 'fog-question') return FOG_CANDIDATE_HEIGHT;
      return CANDIDATE_HEIGHT;
    },
  );
  const transcriptBottom = turnLayouts.length > 0 ? turnLayouts[turnLayouts.length - 1].y + turnLayouts[turnLayouts.length - 1].height : nextY;
  const branchBottom = Math.max(
    transcriptBottom,
    ...evidenceLayouts.map((layout) => layout.y + layout.height),
    ...candidateLayouts.map((layout) => layout.y + layout.height),
  );
  const outcomeY = Math.max(transcriptBottom + 70, branchBottom + 46);
  const svgHeight = outcomeY + OUTCOME_HEIGHT + 64;
  const svgClassName = ['session-map-svg', className].filter(Boolean).join(' ');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={SVG_WIDTH}
      height={svgHeight}
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      className={svgClassName}
      data-center-x={centerX}
      {...props}
    >
      <title id={titleId}>{`${data.meta.title} Session map`}</title>
      <desc id={descId}>A data-generated map of the session path, evidence, candidate map updates, and review outcome.</desc>

      <defs>
        <marker id={markerIds.accent} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="session-map-arrow-accent" />
        </marker>
        <marker id={markerIds.neutral} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="session-map-arrow-neutral" />
        </marker>
        <marker id={markerIds.warning} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="session-map-arrow-warning" />
        </marker>
        <marker id={markerIds.success} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="session-map-arrow-success" />
        </marker>
      </defs>

      <rect width={SVG_WIDTH} height={svgHeight} className="session-map-canvas" />

      <path
        d={`M${centerX} ${TOP_Y + TOP_NODE_HEIGHT} V${outcomeY}`}
        className="session-map-path-spine"
        markerEnd={`url(#${markerIds.accent})`}
      />

      {evidenceLayouts.map((layout) => {
        const source = turnLayouts[layout.sourceIndex];
        const startX = source?.isKeyMoment ? momentX : centerX;
        return (
          <path
            key={`evidence-edge-${layout.item.id}`}
            d={curvePath(startX, source?.centerY ?? layout.centerY, EVIDENCE_X + EVIDENCE_WIDTH, layout.centerY)}
            className="session-map-path-evidence"
            markerEnd={`url(#${markerIds.neutral})`}
          />
        );
      })}

      {candidateLayouts.map((layout) => {
        const source = turnLayouts[layout.sourceIndex];
        const startX = source?.isKeyMoment ? momentX + MOMENT_WIDTH : centerX;
        const markerId = getCandidateMarker(layout.item.type, markerIds);
        return (
          <path
            key={`candidate-edge-${layout.item.id}`}
            d={curvePath(startX, source?.centerY ?? layout.centerY, candidateX, layout.centerY)}
            className={getCandidateEdgeClass(layout.item.type)}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}

      <g className="session-map-top-node">
        <rect x={centerX - TOP_NODE_WIDTH / 2} y={TOP_Y} width={TOP_NODE_WIDTH} height={TOP_NODE_HEIGHT} rx="14" />
        <text x={centerX - TOP_NODE_WIDTH / 2 + 24} y={TOP_Y + 34} className="session-map-eyebrow">Session</text>
        <TextLines
          x={centerX - TOP_NODE_WIDTH / 2 + 24}
          y={TOP_Y + 62}
          lines={wrapText(data.meta.title, 34, 2)}
          className="session-map-node-title"
          lineHeight={20}
        />
        <TextLines
          x={centerX - TOP_NODE_WIDTH / 2 + 24}
          y={TOP_Y + 96}
          lines={wrapText(data.meta.objective, 42, 2)}
          className="session-map-node-copy"
          lineHeight={17}
        />
        <text x={centerX + TOP_NODE_WIDTH / 2 - 24} y={TOP_Y + 34} className="session-map-mode-label" textAnchor="end">
          {data.meta.mode}
        </text>
        <text x={centerX + TOP_NODE_WIDTH / 2 - 24} y={TOP_Y + 134} className="session-map-fine-copy" textAnchor="end">
          {data.meta.evidenceTarget} · {data.meta.progress}
        </text>
      </g>

      {turnLayouts.map((layout) => (
        <g key={`${layout.turn.time ?? layout.index}-${layout.index}`}>
          {layout.isKeyMoment ? (
            <g className="session-map-moment-node">
              <rect x={momentX} y={layout.y} width={MOMENT_WIDTH} height={layout.height} rx="13" />
              <text x={momentX + 22} y={layout.y + 30} className="session-map-eyebrow">
                {layout.turn.time ? `${layout.turn.time} · ${layout.turn.actor}` : layout.turn.actor}
              </text>
              <TextLines
                x={momentX + 22}
                y={layout.y + 58}
                lines={wrapText(quoteExcerpt(layout.turn.text), 41, 2)}
                className="session-map-node-copy-strong"
                lineHeight={17}
              />
              {(layout.turn.annotation ?? layout.turn.evidenceFlag) && (
                <text x={momentX + MOMENT_WIDTH - 22} y={layout.y + 30} className="session-map-moment-label" textAnchor="end">
                  {layout.turn.annotation ?? layout.turn.evidenceFlag}
                </text>
              )}
            </g>
          ) : (
            <g className="session-map-step-marker">
              <circle cx={centerX} cy={layout.centerY} r="6" />
              <text
                x={centerX + (candidateSourceIndexes.has(layout.index) ? -18 : 18)}
                y={layout.centerY + 4}
                className="session-map-step-label"
                textAnchor={candidateSourceIndexes.has(layout.index) ? 'end' : 'start'}
              >
                {layout.turn.time ? `${layout.turn.time} · ${layout.turn.actor}` : layout.turn.actor}
              </text>
            </g>
          )}
        </g>
      ))}

      {evidenceLayouts.map((layout) => (
        <g key={`evidence-${layout.item.id}`} className="session-map-evidence-node">
          <rect x={EVIDENCE_X} y={layout.y} width={EVIDENCE_WIDTH} height={layout.height} rx="12" />
          <text x={EVIDENCE_X + 18} y={layout.y + 28} className="session-map-eyebrow">Evidence {layout.item.id}</text>
          <TextLines
            x={EVIDENCE_X + 18}
            y={layout.y + 54}
            lines={wrapText(layout.item.text, 30, 2)}
            className="session-map-node-copy-strong"
            lineHeight={16}
          />
        </g>
      ))}

      {candidateLayouts.map((layout) => (
        <g key={`candidate-${layout.item.id}`} className={`session-map-candidate-node ${getCandidateClass(layout.item.type)}`}>
          <rect x={candidateX} y={layout.y} width={CANDIDATE_WIDTH} height={layout.height} rx="12" />
          <text x={candidateX + 22} y={layout.y + 28} className="session-map-eyebrow">Candidate {getCandidateLabel(layout.item.type)}</text>
          <TextLines
            x={candidateX + 22}
            y={layout.y + 56}
            lines={wrapText(
              layout.item.title,
              34,
              layout.item.type === 'destination-draft' ? 4 : layout.item.type === 'fog-question' ? 3 : 2,
            )}
            className="session-map-node-copy-strong"
            lineHeight={16}
          />
          {layout.item.evidenceIds && layout.item.evidenceIds.length > 0 && (
            <text x={candidateX + CANDIDATE_WIDTH - 20} y={layout.y + layout.height - 16} className="session-map-fine-copy" textAnchor="end">
              {layout.item.evidenceIds.join(', ')}
            </text>
          )}
        </g>
      ))}

      <g className={`session-map-outcome-node ${/complete|approved/i.test(data.outcome.reviewState) ? 'session-map-outcome-complete' : ''}`}>
        <rect x={outcomeX} y={outcomeY} width={OUTCOME_WIDTH} height={OUTCOME_HEIGHT} rx="14" />
        <text x={outcomeX + 24} y={outcomeY + 34} className="session-map-eyebrow">Outcome</text>
        <text x={outcomeX + 24} y={outcomeY + 64} className="session-map-node-title">
          {data.outcome.stagedCount} map updates staged
        </text>
        <TextLines
          x={outcomeX + 24}
          y={outcomeY + 92}
          lines={wrapText(data.outcome.reviewState, 54, 1)}
          className="session-map-node-copy"
        />
      </g>
    </svg>
  );
}
