---
id: 003
title: Embed saved sources on write
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(web)"
priority: high
depends_on: ["001", "002"]
files: ["apps/web/src/embeddings/resolve-key.ts", "apps/web/src/embeddings/resolve-key.js", "apps/web/src/embeddings/embed-source.ts", "apps/web/src/embeddings/embed-source.js", "apps/web/src/server/convex-admin.ts", "apps/web/src/bookmarks/sync-x-bookmarks.ts", "apps/web/src/takeaways/refresh-takeaway.ts", "apps/web/app/api/analyze/route.ts"]
---

## Scope

- `resolve-key.ts`; `embedAndStoreSource` helper + shim; wire into bookmark save/sync, analysis persist, takeaway snapshot persist; delete-embedding on bookmark delete; telemetry on failure; tests with a fake embedding client + fake convex admin.

## Depends on

- PR1, PR2.

## Acceptance criteria

- [ ] New bookmarks/analyses/snapshots produce an `embeddings` row when a key resolves.
- [ ] Embedding failure never fails the parent write (asserted by test).
- [ ] No key -> skipped + logged, not thrown.
- [ ] Deleting a bookmark removes its embedding.

## Out of scope

- Backfilling historical rows.
- Semantic suggestion ranking.
- Search API or UI.

## Suggested approach

Add a resolver under `apps/web/src/embeddings/` that calls `getProviderApiKeyForSession({ sessionUser, provider: "openai" })` in `apps/web/src/server/convex-admin.ts`, then falls back to `process.env.PLATFORM_OPENAI_API_KEY`. Add `embedAndStoreSource` beside it to compute the content hash, call `embedTexts` from `@tenbrains/ai`, and write through new Convex admin wrappers. Wire from `saveBookmarkForSession`, `persistAnalysisForSession`, `persistTakeawaySnapshotForSession`, and `deleteBookmarkForSession`, catching embedding failures and reporting via `apps/web/src/telemetry/report-error.ts`.
