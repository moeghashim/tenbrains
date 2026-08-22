import type { SVGProps } from 'react';

export function SessionFlowchart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1140"
      height="1470"
      viewBox="0 0 1140 1470"
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-labelledby="session-flowchart-title session-flowchart-desc"
      data-session-flowchart=""
      {...props}
    >
      <title id="session-flowchart-title">How a Ten Brains discovery session moves</title>
      <desc id="session-flowchart-desc">
        A flowchart from setting the Destination through choosing an Open Frontier ticket, running one of four ticket types, writing a Closed Decision, and either continuing or producing the Discovery Spec.
      </desc>

      <defs>
        <style>{`
          [data-session-flowchart] text {
            font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          }
          [data-session-flowchart] .title { fill: var(--text); font-size: 24px; font-weight: 650; letter-spacing: -0.55px; }
          [data-session-flowchart] .eyebrow { fill: var(--workbench-accent); font-size: 12px; font-weight: 650; }
          [data-session-flowchart] .subtitle { fill: var(--text-dim); font-size: 13px; }
          [data-session-flowchart] .node { fill: var(--surface); stroke: var(--border-strong); stroke-width: 1; }
          [data-session-flowchart] .node-title { fill: var(--text); font-size: 16px; font-weight: 650; letter-spacing: -0.18px; }
          [data-session-flowchart] .node-copy { fill: var(--text-dim); font-size: 13px; }
          [data-session-flowchart] .node-copy-strong { fill: var(--text-secondary); font-size: 13px; }
          [data-session-flowchart] .fine-copy { fill: var(--text-dim); font-size: 11px; }
          [data-session-flowchart] .type-title { fill: var(--text); font-size: 15px; font-weight: 650; }
          [data-session-flowchart] .type-copy { fill: var(--text-dim); font-size: 12.5px; }
          [data-session-flowchart] .decision-label { fill: var(--workbench-accent); font-size: 14px; font-weight: 650; }
          [data-session-flowchart] .branch-label { fill: var(--text-secondary); font-size: 12px; font-weight: 650; }
          [data-session-flowchart] .path { fill: none; stroke: var(--workbench-accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
          [data-session-flowchart] .path-branch { fill: none; stroke: var(--workbench-accent); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.78; }
          [data-session-flowchart] .path-fog { fill: none; stroke: var(--warning); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
          [data-session-flowchart] .accent-soft-node { fill: var(--workbench-accent-soft); stroke: var(--workbench-accent-border); }
          [data-session-flowchart] .warning-soft-node { fill: var(--warning-soft); stroke: var(--warning-border); }
          [data-session-flowchart] .success-soft-node { fill: var(--success-soft); stroke: var(--success-border); }
          [data-session-flowchart] .accent-fill { fill: var(--workbench-accent); }
          [data-session-flowchart] .warning-fill { fill: var(--warning); }
          [data-session-flowchart] .success-fill { fill: var(--success); }
        `}</style>

        <marker id="session-flowchart-arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--workbench-accent)" />
        </marker>
        <marker id="session-flowchart-arrow-fog" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--warning)" />
        </marker>
      </defs>

      <rect width="1140" height="1470" fill="var(--canvas)" />

      <g className="flowchart-header">
        <text x="56" y="42" className="eyebrow">Ten Brains · Discovery map</text>
        <text x="56" y="76" className="title">How a discovery session moves</text>
        <text x="56" y="104" className="subtitle">Lines show the path You take through one discovery.</text>
        <line x1="56" y1="128" x2="1084" y2="128" stroke="var(--border-strong)" />
      </g>

      <g className="flowchart-body">
      {/* Primary action path */}
      <path d="M570 222 V246" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 326 V350" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 434 V458" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 498 V548" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 624 V658" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />

      {/* Fog branch */}
      <path d="M550 478 H300 V524" className="path-fog" markerEnd="url(#session-flowchart-arrow-fog)" />
      <text x="318" y="468" className="warning-fill" fontSize="12" fontWeight="650">no · only fog</text>
      <path d="M206 680 V700" className="path-fog" markerEnd="url(#session-flowchart-arrow-fog)" />

      {/* Ticket type split and join */}
      <path d="M570 698 V752" className="path" />
      <path d="M161 752 H979" className="path-branch" />
      <path d="M161 752 V790 M433 752 V790 M707 752 V790 M979 752 V790" className="path-branch" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M161 890 V930 M433 890 V930 M707 890 V930 M979 890 V930" className="path-branch" />
      <path d="M161 930 H979" className="path-branch" />
      <path d="M570 930 V970" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 1054 V1094" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 1174 V1192" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <path d="M570 1232 V1290" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />

      {/* Continue loop: keep this outside the work path */}
      <path d="M590 1212 H1100 V458 H778 V392 H750" className="path" markerEnd="url(#session-flowchart-arrow-accent)" />
      <text x="900" y="448" className="decision-label">yes · scan again</text>

      {/* Start */}
      <rect x="390" y="146" width="360" height="76" rx="12" className="accent-soft-node" />
      <text x="416" y="178" className="node-title accent-fill">Start</text>
      <text x="416" y="203" className="node-copy-strong">Set the Destination</text>

      {/* Open the map */}
      <rect x="390" y="246" width="360" height="80" rx="12" className="node" />
      <text x="416" y="279" className="node-title">Open the map</text>
      <text x="416" y="304" className="node-copy">One discovery</text>

      {/* Scan the board */}
      <rect x="390" y="350" width="360" height="84" rx="12" className="node" />
      <text x="416" y="384" className="node-title">Scan the board</text>
      <text x="416" y="410" className="node-copy">Open Frontier vs Fog of War</text>

      {/* Fog annotation */}
      <rect x="806" y="338" width="260" height="86" rx="12" fill="var(--surface)" stroke="var(--warning-border)" />
      <line x1="822" y1="356" x2="822" y2="406" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" />
      <text x="840" y="371" className="warning-fill" fontSize="13" fontWeight="650">Fog sits beside the path</text>
      <text x="840" y="396" className="node-copy">See it coming. Ticket it later.</text>

      {/* Open Frontier decision */}
      <path d="M570 458 L590 478 L570 498 L550 478 Z" fill="var(--surface)" stroke="var(--workbench-accent)" strokeWidth="2" />
      <circle cx="570" cy="478" r="3" fill="var(--workbench-accent)" />
      <text x="604" y="483" className="decision-label desktop-decision-label">Any Open Frontier tickets?</text>
      <g className="mobile-decision-label">
        <rect x="420" y="504" width="300" height="26" rx="6" fill="var(--canvas)" />
        <text x="570" y="523" textAnchor="middle" className="decision-label">Any Open Frontier tickets?</text>
      </g>
      <text x="582" y="526" className="branch-label open-frontier-yes">yes</text>

      {/* Only fog left */}
      <rect x="56" y="524" width="300" height="156" rx="12" className="warning-soft-node" />
      <text x="80" y="558" className="warning-fill" fontSize="16" fontWeight="650">Only fog left</text>
      <text x="80" y="588" className="node-copy-strong">Mark what You can see</text>
      <text x="80" y="614" className="node-copy-strong">Do not invent tickets</text>
      <text x="80" y="640" className="node-copy-strong">Wait on blockers</text>
      <line x1="80" y1="658" x2="332" y2="658" stroke="var(--border-strong)" />
      <text x="80" y="673" className="fine-copy">Resume when the map changes</text>
      <rect x="132" y="708" width="148" height="34" rx="12" fill="var(--surface)" stroke="var(--warning-border)" />
      <text x="158" y="730" className="warning-fill" fontSize="12" fontWeight="650">Next session</text>

      {/* Pick a ticket */}
      <rect x="390" y="548" width="360" height="76" rx="12" className="node" />
      <text x="416" y="580" className="node-title">Pick one ticket</text>
      <text x="416" y="605" className="node-copy">Open Frontier only</text>

      {/* Ticket type decision */}
      <path d="M570 658 L590 678 L570 698 L550 678 Z" fill="var(--surface)" stroke="var(--workbench-accent)" strokeWidth="2" />
      <circle cx="570" cy="678" r="3" fill="var(--workbench-accent)" />
      <text x="604" y="683" className="decision-label desktop-decision-label">Which ticket type?</text>
      <g className="mobile-decision-label">
        <rect x="460" y="706" width="220" height="26" rx="6" fill="var(--canvas)" />
        <text x="570" y="725" textAnchor="middle" className="decision-label">Which ticket type?</text>
      </g>

      {/* Ticket types */}
      <rect x="46" y="790" width="230" height="100" rx="12" className="node" />
      <text x="68" y="824" className="type-title">Grilling</text>
      <text x="68" y="853" className="type-copy">Wayfinder grills You</text>
      <text x="68" y="875" className="type-copy">Force one choice</text>

      <rect x="318" y="790" width="230" height="100" rx="12" className="node" />
      <text x="340" y="824" className="type-title">Prototype</text>
      <text x="340" y="853" className="type-copy">Build a cheap draft</text>
      <text x="340" y="875" className="type-copy">React to it</text>

      <rect x="592" y="790" width="230" height="100" rx="12" className="node" />
      <text x="614" y="824" className="type-title">Research</text>
      <text x="614" y="853" className="type-copy">Collect external evidence</text>
      <text x="614" y="875" className="type-copy">Answer one question</text>

      <rect x="864" y="790" width="230" height="100" rx="12" className="node" />
      <text x="886" y="824" className="type-title">Synthesis</text>
      <text x="886" y="853" className="type-copy">Merge the evidence</text>
      <text x="886" y="875" className="type-copy">Decide</text>

      {/* Closed Decision */}
      <rect x="370" y="970" width="400" height="84" rx="12" className="success-soft-node" />
      <text x="396" y="1004" className="success-fill" fontSize="16" fontWeight="650">Write a Closed Decision</text>
      <text x="396" y="1030" className="node-copy-strong">Add evidence links</text>

      {/* Refresh */}
      <rect x="390" y="1094" width="360" height="80" rx="12" className="node" />
      <text x="416" y="1127" className="node-title">Refresh the board</text>
      <text x="416" y="1153" className="node-copy">Fog of War → new tickets?</text>

      {/* Continue decision */}
      <path d="M570 1192 L590 1212 L570 1232 L550 1212 Z" fill="var(--surface)" stroke="var(--workbench-accent)" strokeWidth="2" />
      <circle cx="570" cy="1212" r="3" fill="var(--workbench-accent)" />
      <text x="604" y="1194" className="decision-label desktop-decision-label">More to do on the map?</text>
      <g className="mobile-decision-label">
        <rect x="440" y="1240" width="260" height="26" rx="6" fill="var(--canvas)" />
        <text x="570" y="1259" textAnchor="middle" className="decision-label">More to do on the map?</text>
      </g>
      <text x="582" y="1262" className="branch-label continue-no">no</text>

      {/* Done */}
      <rect x="350" y="1290" width="440" height="118" rx="12" className="success-soft-node" />
      <text x="376" y="1324" className="success-fill" fontSize="16" fontWeight="650">Done</text>
      <text x="376" y="1352" className="node-copy-strong">Closed Decisions form the Discovery Spec</text>
      <text x="376" y="1380" className="node-copy">Stop · ship from the spec</text>

      <text x="56" y="1440" className="fine-copy">One discovery · one map · one decision path</text>
      </g>
    </svg>
  );
}
