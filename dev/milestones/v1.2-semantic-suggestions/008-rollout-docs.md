---
id: 008
title: Document the Track A rollout
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "docs"
priority: medium
depends_on: ["001", "002", "003", "004", "005", "006", "007"]
files: ["README.md", "docs/deployment-web.md", "docs/prd/track-a-semantic-suggestions.md", ".changeset/semantic-suggestions.md"]
---

## Scope

- README feature + setup updates (`PLATFORM_OPENAI_API_KEY`, search page, semantic ranking); `docs/deployment-web.md` env + backfill runbook; mark this PRD's status `Shipped`; final changeset.

## Depends on

- PR1-PR7.

## Acceptance criteria

- [ ] Docs accurately describe behavior, env vars, key fallback, and the backfill procedure.
- [ ] PRD Decisions log reflects any deviations.

## Out of scope

- Production code changes.
- Additional feature scope beyond Track A rollout documentation.

## Constraints

PR8 may modify `docs/prd/track-a-semantic-suggestions.md` ONLY by (1) setting the header-table Status field to `Shipped` and (2) appending rows to the section 14 Decisions log. No other edits to the PRD are permitted, and the PR body must explicitly state this PRD change.

## Suggested approach

Update user-facing setup and deployment docs after all implementation PRs are merged, documenting `PLATFORM_OPENAI_API_KEY`, per-user key fallback, semantic ranking fallback behavior, `/app/search`, `/api/me/search`, and the backfill script runbook. Only mark `docs/prd/track-a-semantic-suggestions.md` as shipped once PR1 through PR7 have landed and any actual deviations are recorded in its Decisions log.
