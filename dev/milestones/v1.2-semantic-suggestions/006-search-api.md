---
id: 006
title: Add the semantic search API
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(web)"
priority: high
depends_on: ["001", "002"]
files: ["apps/web/app/api/me/search/route.ts", "apps/web/src/server/convex-admin.ts", "packages/contracts/src/search.ts", "packages/contracts/src/search.js", "packages/contracts/src/index.ts", "apps/web/test/search-api-route.test.ts"]
---

## Scope

- `POST /api/me/search` route; `SearchRequest/Result/Response` contracts + re-export; `searchEmbeddingsForSession` admin wrapper; route tests (auth required, validation, no-key flag, grouping).

## Depends on

- PR1, PR2.

## Acceptance criteria

- [ ] Authed query returns ranked grouped results scoped to the user.
- [ ] Unauthenticated -> 401.
- [ ] Invalid body -> 400.
- [ ] No key -> `needsKey: true` with empty results.
- [ ] Results never leak another user's rows (asserted).

## Out of scope

- Search page UI.
- CLI or extension search UI.
- Cross-user or global search.

## Suggested approach

Follow existing route patterns in `apps/web/app/api/me/suggestions/route.ts` and `apps/web/app/api/bookmarks/route.ts`: validate startup env, read the server session, parse with Zod contracts, and return explicit 401/400 responses. Add the contracts in `packages/contracts/src/search.ts` and re-export from `packages/contracts/src/index.ts`. Keep all Convex access in `apps/web/src/server/convex-admin.ts` through `searchEmbeddingsForSession`, resolving the embedding key per PRD section 5.3 and using pure similarity ranking for v1.
