---
id: 005
title: Add semantic affinity to suggestion ranking
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(suggestions)"
priority: high
depends_on: ["001", "002"]
files: ["apps/web/src/suggestions/build-suggestions.ts", "apps/web/src/suggestions/build-suggestions.js", "apps/web/src/embeddings/resolve-key.ts", "apps/web/src/server/convex-admin.ts", "apps/web/test/build-suggestions.test.ts"]
---

## Scope

- Integrate semantic affinity into `build-suggestions.ts` per section 5.5; threshold/weight constants; both-mode tests (semantic + fallback) using a fake embedding/search client.

## Depends on

- PR1, PR2 (and PR3/PR4 for real data, but testable independently).

## Acceptance criteria

- [ ] With embeddings, semantically related (non-verbatim) candidates outrank unrelated ones in tests.
- [ ] With no key, output matches the pre-change substring behavior (regression-guarded).
- [ ] Structural signals unchanged.
- [ ] No unbounded fan-out beyond existing candidate caps.

## Out of scope

- Re-ranking `followed_creator` or `subject_search` structural signals.
- Persistently embedding candidate suggestion posts.
- Tuning beyond the PRD default starting constants.

## Suggested approach

Keep the ranking change in `apps/web/src/suggestions/build-suggestions.ts`. Batch-embed candidate tweet texts once per run via `embedTexts`, call a Convex admin wrapper for `searchSimilar`, and add semantic contributions only for top scores at or above the PRD default threshold of 0.78 with starting weight 40. Preserve current followed creator and subject search scores, and when key resolution or embedding/search fails, take the existing substring scoring path unchanged.
