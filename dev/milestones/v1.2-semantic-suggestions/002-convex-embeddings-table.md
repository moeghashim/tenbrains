---
id: 002
title: Add the Convex embeddings table and functions
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(convex)"
priority: high
depends_on: []
files: ["apps/web/convex/schema.ts", "apps/web/convex/embeddings.ts", "apps/web/convex/_generated/api.d.ts", "apps/web/convex/_generated/api.js", "apps/web/convex/_generated/dataModel.d.ts"]
---

## Scope

- `embeddings` table + indexes in `schema.ts`; `convex/embeddings.ts` with `upsertEmbedding`, `deleteEmbeddingsForSource`, `searchSimilar` (action), `getEmbeddingDocsByIds`; regenerate `_generated`.

## Depends on

- None.

## Acceptance criteria

- [ ] Schema typechecks and deploys.
- [ ] `searchSimilar` scopes to the authed user.
- [ ] Upsert is idempotent on `(sourceType, sourceId)` and skips unchanged `contentHash`.
- [ ] Vector filter uses `userId` with `sourceType` post-filter per section 5.2.
- [ ] No behavior change to existing features.

## Out of scope

- Generating any embeddings.

## Suggested approach

Add the unified `embeddings` table to `apps/web/convex/schema.ts` with the 1536-dimension `by_embedding` vector index. Implement the Convex functions in `apps/web/convex/embeddings.ts`, using `requireUserBySession` from `apps/web/convex/auth_helpers.ts` so `userId` always comes from the authenticated caller. For vector search, filter by `userId`, hydrate with `getEmbeddingDocsByIds`, then post-filter `sourceType` as required by PRD section 5.2.
