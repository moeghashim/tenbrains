# User Wayfinder — UI Implementation Prompt

Build a clean, modern web UI for **User Wayfinder**, a decision-clarity tool for solo technical founders who work directly with an AI model.

Use these images as the visual source of truth:

- `user-wayfinder-map-overview-v2.png`
- `user-wayfinder-grilling-session-v2.png`

## Product model

There are exactly two actors in the product:

1. **You** — the solo founder using the application.
2. **Wayfinder** — the AI model that asks questions, performs work, synthesizes evidence, and proposes map updates.

Do not add teams, teammates, named collaborators, interview participants, assignees, mentions, member avatars, or workspace administration. When work mode matters, the only allowed values are **You**, **Wayfinder**, and **You + Wayfinder**.

The product turns a vague idea into a path to build or kill by maintaining a living decision map:

- **Destination:** the one-sentence outcome of the discovery.
- **Open Frontier:** actionable work tickets.
- **Fog of War:** important questions that are not yet actionable.
- **Closed Decisions:** concise evidence-backed conclusions.

Ticket types are Grilling, Research, Prototype, and Synthesis. Completing work must stage explicit map changes for review; Wayfinder must never silently mutate the map.

## Implement these two primary views

### 1. Map overview

Reproduce the hierarchy and layout of `user-wayfinder-map-overview-v2.png`:

- Persistent left navigation with Map, Sessions, Evidence, and Discovery Spec.
- Destination block with clarity status and explicit actions.
- Three-column map: Open Frontier, Fog of War, and Closed Decisions.
- Ticket cards with type, work mode, and evidence target.
- Fog cards phrased as questions with a **Make actionable** action.
- Decision cards with confidence and evidence links.
- Quiet Wayfinder activity status in the lower-right corner.

The Map is the product home and permanent system of record. It should feel like a decision ledger, not a kanban board or research repository.

### 2. Grilling session

Reproduce the hierarchy and layout of `user-wayfinder-grilling-session-v2.png`:

- A focused session between **Wayfinder** and **You** only.
- Left pane: visible, editable **Line of Inquiry**.
- Center pane: dominant chronological transcript without chat bubbles.
- Right pane: assumptions tested, evidence captured, and candidate map updates.
- Wayfinder asks relentless, concrete follow-up questions to expose vague reasoning and hidden assumptions.
- Candidate map changes remain staged until You select **Review map updates** and approve them.

This is not a meeting or video-interview interface. Do not add participant chips, human avatars, a call grid, or collaboration controls.

## Visual system

- Warm off-white application canvas with white cards.
- Charcoal text and cool-gray 1px borders.
- Deep indigo for primary actions and active work.
- Muted amber for uncertainty and fog.
- Muted green for evidence-backed decisions.
- Red only for live state, destructive actions, or genuine contradictions.
- Neutral sans-serif typography similar to Geist or Inter.
- 8px spacing base, 8px corner radius, restrained shadows, and compact expert-level density.
- Use text labels in addition to color for every state.
- Avoid gradients, glassmorphism, decorative illustrations, oversized headings, and marketing-page styling.

## Interaction rules

- Use progressive disclosure: show decision-relevant metadata first and details on selection.
- Every Wayfinder action must have a clear state: idle, working, waiting for approval, blocked, or complete.
- Selecting a ticket should reveal its primary action without filling every card with buttons.
- Closing a ticket must open a review step showing evidence captured and proposed changes to Frontier, Fog, and Closed Decisions.
- Closed decisions can be contradicted or reopened without losing their history.
- Empty states must explain the next useful action.

## Responsive behavior

Design desktop-first. On small screens:

- Replace the three map columns with a Frontier / Fog / Closed segmented switcher.
- Show the Grilling transcript first; open Line of Inquiry and Session Signals as drawers.
- Keep live-session controls fixed at the bottom.
- Do not create a horizontally scrolling kanban board.

## Acceptance criteria

- The result closely matches the two supplied reference images.
- No third actor, collaborator, participant, teammate, or assignee appears anywhere.
- The Map remains the central artifact.
- Wayfinder proposals are explicit and reviewable.
- The interface is calm, dense, legible, and usable—not merely visually polished.
