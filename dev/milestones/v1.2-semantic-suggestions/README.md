# v1.2-semantic-suggestions

Source of truth: [Track A PRD](../../../docs/prd/track-a-semantic-suggestions.md).

## Definition of Done

- [ ] Bookmark, analysis, and takeaway snapshot text can be embedded into the unified Convex `embeddings` vector index.
- [ ] Suggestion ranking uses semantic similarity for `bookmark_affinity` and `takeaway_theme` while preserving the current substring heuristic as the no-key or embedding-failure fallback.
- [ ] `/api/me/search` and `/app/search` provide signed-in, user-scoped semantic recall across bookmarks, analyses, and takeaway snapshots.
- [ ] Existing rows can be backfilled with an idempotent, resumable, dry-runnable migration.
- [ ] Cost and rate-limit exposure are bounded by batching, content hash dedupe, caps, and backoff.
- [ ] Track A non-goals remain out of scope: no structural signal re-ranking, persistent candidate embeddings, cross-user search, CLI or extension UI, broader X fan-out rework, or multi-model vector migration.
- [ ] PR1 through PR8 each pass `npm run check` and `npm test` before review.
- [ ] Each PR links this milestone task file and the PRD section 7 entry it implements.

## Tasks

1. [001 - AI embedding service](001-ai-embedding-service.md)
2. [002 - Convex embeddings table and functions](002-convex-embeddings-table.md)
3. [003 - Embed on write](003-embed-on-write.md)
4. [004 - Backfill migration](004-backfill-migration.md)
5. [005 - Semantic affinity ranking](005-semantic-affinity-ranking.md)
6. [006 - Search API](006-search-api.md)
7. [007 - Search page](007-search-page.md)
8. [008 - Rollout docs](008-rollout-docs.md)
