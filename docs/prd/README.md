# Tenbrains PRDs

Product requirements documents for the enhancement tracks. Each track is a self-contained
unit of work handed to an implementing agent and reviewed PR-by-PR before merge.

These documents are **canonical contracts**. Generated code and downstream agents must not
overwrite them. Changes to a locked decision require an explicit edit here plus a note in the
document's Decisions log.

## Tracks

| Track | PRD | Status | Summary |
|-------|-----|--------|---------|
| A | [track-a-semantic-suggestions.md](track-a-semantic-suggestions.md) | Shipped | Embeddings-based suggestion ranking + unified semantic search over the user's saved corpus |
| B | _planned_ | Not written | Reliability & cost control for X/LLM APIs (parallel fan-out, caching, rate-limit backoff, budget guards) |
| C | _planned_ | Not written | Codebase & DX cleanup (remove `.js` re-export shims, package the CLI, burn down legacy fields/TODOs, coverage) |
| D | _planned_ | Not written | Security & privacy hardening pass |
| E | _planned_ | Not written | Product surface expansion (digests, collections, richer thread analysis) |

## Workflow

1. **Plan** — the PRD is drilled and locked here (Claude + user).
2. **Build** — an implementing agent opens one PR per task in the PRD's PR breakdown, following
   the repo conventions in [`AGENTS.md`](../../AGENTS.md). It stops for review before merge.
3. **Sign off** — Claude reviews each PR against the acceptance criteria and the Decisions log,
   then either approves or returns a requested-changes list. The user holds merge authority.
