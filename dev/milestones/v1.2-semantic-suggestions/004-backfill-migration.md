---
id: 004
title: Add the embeddings backfill migration
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(scripts)"
priority: high
depends_on: ["001", "002", "003"]
files: ["scripts/backfill-embeddings.mjs", "README.md", "apps/web/src/server/convex-admin.ts", "apps/web/convex/embeddings.ts"]
---

## Scope

- `scripts/backfill-embeddings.mjs` - iterate existing rows missing an up-to-date embedding, batch through the service, write via `upsertEmbedding`; idempotent, resumable (cursor), `--dry-run`, `--source=bookmark|analysis|takeaway|all`, rate-limited with backoff; per-user key resolution with platform fallback; summary report (counts, skipped, failed). Docs in the script header + README.

## Depends on

- PR1, PR2, PR3.

## Acceptance criteria

- [ ] Dry-run reports planned work and writes nothing.
- [ ] Re-running after a partial run skips already-embedded rows.
- [ ] Respects rate limits.
- [ ] Logs a final summary.
- [ ] Manual run instructions documented.

## Out of scope

- Ranking integration.
- Search API or UI.
- Changing the embedding model or dimension.

## Suggested approach

Build a Node ESM script in `scripts/backfill-embeddings.mjs` that uses the same `embedTexts` service from PR1 and the Convex admin boundary in `apps/web/src/server/convex-admin.ts`. Reuse the PR3 key-resolution behavior: per-user OpenAI credential first, `PLATFORM_OPENAI_API_KEY` fallback second, and skip/report when neither exists. Keep backfill writes idempotent by relying on the PR2 `contentHash` short-circuit and expose `--dry-run`, `--source`, and cursor/resume controls.
