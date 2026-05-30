---
id: 001
title: Add the AI embedding service
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(ai)"
priority: high
depends_on: []
files: ["packages/ai/src/lib/embed.ts", "packages/ai/src/lib/embed.js", "packages/ai/src/lib/catalog.ts", "packages/ai/src/index.ts", "packages/ai/test/embed.test.ts"]
---

## Scope

- `packages/ai/src/lib/embed.ts` + shim; embedding model entry in `catalog.ts`; export from `index.ts`; unit tests in `packages/ai/test/embed.test.ts`.

## Depends on

- None.

## Acceptance criteria

- [ ] `embedTexts` batches, truncates, preserves order, maps errors to `AiProviderError`; tests cover batching, ordering, 401/429/5xx mapping, empty input.
- [ ] No web/Convex changes.
- [ ] Mock `fetch` - no live API calls in tests.

## Out of scope

- Any caller of the service.

## Suggested approach

Mirror `packages/ai/src/lib/analyze.ts`: keep provider HTTP details inside `packages/ai`, reuse the timeout/error-mapping pattern, and throw `AiProviderError` from `packages/ai/src/lib/errors.ts`. Register OpenAI `text-embedding-3-small` metadata in `packages/ai/src/lib/catalog.ts`, expose the public API from `packages/ai/src/index.ts`, and keep tests deterministic by mocking `fetch`.
