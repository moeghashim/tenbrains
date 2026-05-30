# PRD — Track A: Semantic Suggestions & Unified Semantic Search

| Field | Value |
|-------|-------|
| Track | A (highest product impact) |
| Status | Ready for implementation |
| Author / Reviewer | Claude (planning + per-PR sign-off) |
| Implementing agent | TBD (Codex / Claude Code / other — assigned at handoff) |
| Merge authority | Repo owner |
| Target version | `@tenbrains/*` 1.2.0 |
| Created | 2026-05-29 |

> This document is a **canonical contract**. The implementing agent must not overwrite it.
> Any change to a locked decision requires an explicit edit here and a new row in the
> Decisions log, plus re-review.

---

## 1. Background & problem statement

Tenbrains is an X research workspace / "second brain". Users accumulate three kinds of saved
signal: **bookmarks** (`bookmarks` table), **tweet analyses** (`analyses` table), and
**account takeaway snapshots** (`takeawaySnapshots` table). Two core promises depend on
understanding what that signal *means*:

1. **Suggestions** — recommend new posts relevant to the user's saved signal.
2. **Recall** — let the user find what they already saved.

Today, neither is semantic:

- **Suggestion ranking is naive string matching.** In
  [`apps/web/src/suggestions/build-suggestions.ts`](../../apps/web/src/suggestions/build-suggestions.ts),
  `bookmark_affinity` is scored by substring containment:

  ```ts
  // build-suggestions.ts ~line 113
  if (bookmarkText && candidateText.includes(bookmarkText.slice(0, Math.min(bookmarkText.length, 48)))) {
      score += 6;
  }
  // ~line 117 — tag match is also pure substring
  if (normalize(candidate.tweet.text).includes(normalize(tag))) {
      bookmarkTagMatches.add(tag);
  }
  ```

  This only fires on near-verbatim overlap. Two posts about the same idea in different words
  score zero. The product's central ranking signal is effectively off.

- **There is no recall surface at all.** The Convex schema
  ([`apps/web/convex/schema.ts`](../../apps/web/convex/schema.ts)) stores rich text across
  `bookmarks`, `analyses`, and `takeawaySnapshots`, but there is no embeddings column, no
  vector index, and no search endpoint or page. The user cannot search their own corpus.

Track A adds a semantic layer — embeddings + Convex vector search — and exposes it two ways:
a smarter `bookmark_affinity`/`takeaway_theme` ranking signal, and a new `/app/search` page
backed by a search API.

## 2. Goals & non-goals

### Goals
- G1. Embed the text of bookmarks, analyses, and takeaway snapshots into a vector index.
- G2. Replace substring-based affinity scoring in suggestion ranking with semantic similarity,
  with graceful fallback to the current heuristic when embeddings are unavailable.
- G3. Ship a unified semantic search experience: `/app/search` page + `/api/me/search` API
  spanning all three source types, scoped to the signed-in user.
- G4. Backfill embeddings for all existing rows so the feature works on day one.
- G5. Keep cost and rate-limit exposure bounded (batching, dedupe via content hash, caps).

### Non-goals (explicitly out of scope for Track A)
- N1. Re-ranking the `followed_creator` / `subject_search` structural signals — those stay as-is.
- N2. Embedding candidate suggestion posts persistently (candidates are fetched live from X and
  embedded transiently for scoring only).
- N3. Cross-user / global search or recommendations.
- N4. CLI or extension search UI (search **API** must be reusable by them; UI is web-only here).
- N5. Reliability/cost-control rework of the broader X fan-out — that is Track B.
- N6. Re-embedding on model change / multi-model vector support — single model, fixed dimension.

## 3. Locked decisions

These were decided during planning. Treat as fixed; deviations require re-review.

| # | Decision | Value | Rationale |
|---|----------|-------|-----------|
| D1 | Embedding model | OpenAI `text-embedding-3-small` (1536 dims) | Cheap (~$0.02/1M tokens), strong quality; OpenAI is the primary configured provider |
| D2 | Embedding API key source | Per-user stored credential (`provider = "openai"`), falling back to a platform env key | Resilient; users with their own key self-fund, others use platform key |
| D3 | Backfill | Backfill **all** existing bookmarks, analyses, takeaway snapshots via a one-time idempotent migration | Search + ranking work immediately |
| D4 | User-facing surface | New `/app/search` page **and** `/api/me/search` API, **plus** the ranking upgrade | Delivers the full second-brain payoff |
| D5 | Vector store | Convex native vector search (`vectorIndex` + `ctx.vectorSearch`) | Already the system of record; no new infra |
| D6 | Embedding storage shape | Single unified `embeddings` table referencing source rows | One index for unified search; re-embed without touching source tables |
| D7 | Fixed dimension | 1536, hardcoded in the schema vector index | Convex vector index dimension is immutable post-definition; changing model is a future migration |

## 4. Current-state integration points

The implementing agent must reuse these existing patterns — do not invent parallel ones.

- **AI provider calls** — [`packages/ai/src/lib/analyze.ts`](../../packages/ai/src/lib/analyze.ts)
  defines `postJson()`, request timeouts, and `mapStatusToError()`. The embedding service mirrors
  this. Errors use `AiProviderError` from [`packages/ai/src/lib/errors.ts`](../../packages/ai/src/lib/errors.ts).
- **Provider catalog** — [`packages/ai/src/lib/catalog.ts`](../../packages/ai/src/lib/catalog.ts)
  is the provider/model registry; add embedding model metadata here.
- **Public AI exports** — [`packages/ai/src/index.ts`](../../packages/ai/src/index.ts) re-exports
  `lib/*`. Add the embedding module export.
- **Secret crypto** — [`apps/web/src/server/secret-crypto.ts`](../../apps/web/src/server/secret-crypto.ts)
  (`encryptSecret`/`decryptSecret`, AES-256-GCM keyed by `USER_SECRETS_ENCRYPTION_KEY`).
- **Per-user key retrieval** — `getProviderApiKeyForSession({ sessionUser, provider })` in
  [`apps/web/src/server/convex-admin.ts`](../../apps/web/src/server/convex-admin.ts) already returns
  a decrypted key or `null`.
- **Convex admin wrappers** — all Convex access from Node goes through `convex-admin.ts` using a
  session-authed admin client (`createAuthedAdminClient`). New embedding/search calls follow suit.
- **Convex auth helpers** — `apps/web/convex/auth_helpers.ts` (`requireUserBySession`,
  `getSessionUserId`) scope queries/mutations/actions to the caller.
- **Persistence pipelines** to hook embedding-on-write into:
  - `saveBookmarkForSession` / bookmark sync (`apps/web/src/bookmarks/sync-x-bookmarks.ts`)
  - `persistAnalysisForSession` (`apps/web/src/analysis/*`)
  - `persistTakeawaySnapshotForSession` (`apps/web/src/takeaways/refresh-takeaway.ts`)
- **Contracts** — add new Zod schemas to [`packages/contracts/src`](../../packages/contracts/src)
  and re-export from `index.ts`.

## 5. Proposed architecture

```
                    ┌─────────────────────────────────────────────┐
   write path       │ bookmark / analysis / takeaway persisted     │
                    │   → resolveEmbeddingApiKey(user)             │
                    │   → ai.embedTexts([...])                     │
                    │   → convex embeddings.upsertEmbedding        │
                    └─────────────────────────────────────────────┘

   embeddings table (Convex)        ─ vectorIndex by_embedding (1536, filter: userId, sourceType)
     { userId, sourceType, sourceId, text, contentHash, model, embedding[], ... }

                    ┌──────────────── suggestion ranking ─────────────────┐
   ranking path     │ candidates from X → ai.embedTexts(candidate texts)  │
                    │ for each candidate → embeddings.searchSimilar(vec)   │
                    │ semantic affinity score → blended into scoreCandidate│
                    │ (fallback to substring heuristic if no embeddings)   │
                    └──────────────────────────────────────────────────────┘

                    ┌──────────────── search path ────────────────────────┐
   /app/search ───▶ POST /api/me/search { query }                          │
                    │ → ai.embedTexts([query]) → embeddings.searchSimilar  │
                    │ → hydrate source docs → grouped, ranked results      │
                    └──────────────────────────────────────────────────────┘
```

### 5.1 Embedding service (`packages/ai`)
New module `packages/ai/src/lib/embed.ts` (plus its `.js` re-export shim — see §10):

```ts
// Reference signature — final shape decided in PR1
export interface EmbedTextsInput {
  texts: string[];
  apiKey: string;
  model?: string;            // defaults to the catalog embedding model
}
export interface EmbedTextsResult {
  model: string;
  dimensions: number;
  vectors: number[][];       // aligned 1:1 with input texts
}
export async function embedTexts(input: EmbedTextsInput): Promise<EmbedTextsResult>;
```

- Calls OpenAI `POST /v1/embeddings` reusing the `postJson` + timeout + `AiProviderError`
  mapping pattern from `analyze.ts`.
- Batches up to `EMBED_BATCH_SIZE` (default 96) inputs per request; splits larger arrays.
- Truncates each input to a max char budget (default 8000) before sending.
- Returns vectors in input order; throws `AiProviderError` on failure (retryable for 429/5xx).
- The embedding model is registered in `catalog.ts` so dimension/model id live in one place.

### 5.2 Convex embeddings table & functions (`apps/web/convex`)
Schema addition to `schema.ts`:

```ts
embeddings: defineTable({
  userId: v.id("users"),
  sourceType: v.union(v.literal("bookmark"), v.literal("analysis"), v.literal("takeaway")),
  sourceId: v.string(),          // tweetId for bookmarks, analyses _id, snapshot _id, etc.
  text: v.string(),              // the embedded text (for snippeting in search results)
  contentHash: v.string(),       // sha256 of normalized text → skip re-embed when unchanged
  model: v.string(),             // e.g. "text-embedding-3-small"
  embedding: v.array(v.float64()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_source", ["sourceType", "sourceId"])
  .index("by_user_source", ["userId", "sourceType"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId", "sourceType"],
  }),
```

New `apps/web/convex/embeddings.ts`:
- `upsertEmbedding` (mutation) — insert or replace by `(sourceType, sourceId)`; sets userId from
  auth context; no-op if `contentHash` unchanged.
- `deleteEmbeddingsForSource` (mutation) — remove when a bookmark/analysis is deleted.
- `searchSimilar` (**action**) — `ctx.vectorSearch("embeddings", "by_embedding", { vector, limit, filter })`.
  Vector search is only callable from a Convex **action**.
- `getEmbeddingDocsByIds` (query) — hydrate `{_id,_score}` results into full rows for the action.

> **Vector filter constraint (must get right):** Convex `vectorSearch` filters support only
> `q.eq` and `q.or` over a single expression — you cannot `q.and` two different filter fields.
> Filter by `userId` in the vector search; apply any `sourceType` narrowing as a **post-filter**
> after hydration, over-fetching `limit` to compensate. Always scope `userId` to the
> authenticated caller (via `auth_helpers`); never accept it from the client.

### 5.3 Embedding key resolution
New helper (web `src/`), e.g. `apps/web/src/embeddings/resolve-key.ts`:

```ts
// user credential (D2) → platform fallback → null (degrade gracefully)
const userKey = await getProviderApiKeyForSession({ sessionUser, provider: "openai" });
return userKey ?? process.env.PLATFORM_OPENAI_API_KEY ?? null;
```

When the resolver returns `null`: writes skip embedding (logged via telemetry, not an error),
ranking falls back to the substring heuristic, and search returns an empty result with a
`needsKey: true` flag the UI can surface.

### 5.4 Embedding-on-write
A web-side helper `embedAndStoreSource({ sessionUser, sourceType, sourceId, text })` that:
resolves the key → computes `contentHash` → short-circuits if unchanged → `embedTexts` →
`upsertEmbedding`. Invoked (non-blocking where possible, but awaited within cron jobs so failures
are recorded) from the bookmark save/sync, analysis persist, and takeaway snapshot persist paths.
Embedding failures must never fail the parent write — catch, report via
`reportServerError` (`apps/web/src/telemetry/report-error.ts`), and continue.

### 5.5 Suggestion ranking integration
In `build-suggestions.ts`:
- Batch-embed candidate tweet texts once per run (`embedTexts`).
- For each candidate, call `searchSimilar` filtered to the user's `bookmark` + `takeaway`
  embeddings; take the top cosine `_score`.
- Convert similarity → an affinity contribution (e.g. `round(topScore * SEMANTIC_AFFINITY_WEIGHT)`),
  attach a `bookmark_affinity` / `takeaway_theme` reason when above a threshold.
- Blend with existing structural scores; keep `followed_creator` (+60) and `subject_search` (+30)
  unchanged.
- If the key resolver returns `null` or embedding fails, fall back to the existing substring path
  unchanged. The function must remain correct and tested in both modes.

### 5.6 Search API & page
- `POST /api/me/search` — body `{ query: string, sourceTypes?: SourceType[], limit?: number }`.
  Auth-required. Embeds the query, calls `searchSimilar`, hydrates and groups results, returns
  `{ results: SearchResult[], needsKey?: boolean }`. Response schema in `contracts`.
- `apps/web/src/server/convex-admin.ts` — add `searchEmbeddingsForSession(...)` wrapper.
- `/app/search` page — search box, debounced submit, results grouped by source type with snippet,
  author, relative score, and a link into the existing bookmark/analysis/takeaway view. Empty,
  loading, no-key, and error states. Add a nav entry alongside the existing app pages.

## 6. Data model & contracts summary
- New Convex table `embeddings` (+ 2 indexes, 1 vector index). No changes to existing tables.
- New contracts: `EmbeddingSourceTypeSchema`, `SearchRequestSchema`, `SearchResultSchema`,
  `SearchResponseSchema` in `packages/contracts`.
- New env var: `PLATFORM_OPENAI_API_KEY` (optional; platform fallback per D2). Documented in
  README + deployment docs.

## 7. PR breakdown (one PR per task)

The implementing agent opens these as **separate PRs**, in order, each stopping for sign-off
before the next. Conventional Commit prefixes shown. Every PR must pass `npm run check` and
`npm test`, stay under the 600-line/file cap, add a changeset where it changes a published
package, and create the `.js` re-export shim for every new `.ts` module (§10).

### PR1 — `feat(ai): embedding service`
- **Scope:** `packages/ai/src/lib/embed.ts` + shim; embedding model entry in `catalog.ts`;
  export from `index.ts`; unit tests in `packages/ai/test/embed.test.ts`.
- **Acceptance:** `embedTexts` batches, truncates, preserves order, maps errors to
  `AiProviderError`; tests cover batching, ordering, 401/429/5xx mapping, empty input. No web/Convex
  changes. Mock `fetch` — no live API calls in tests.
- **Out of scope:** any caller of the service.

### PR2 — `feat(convex): embeddings table and functions`
- **Scope:** `embeddings` table + indexes in `schema.ts`; `convex/embeddings.ts` with
  `upsertEmbedding`, `deleteEmbeddingsForSource`, `searchSimilar` (action), `getEmbeddingDocsByIds`;
  regenerate `_generated`.
- **Acceptance:** schema typechecks and deploys; `searchSimilar` scopes to the authed user; upsert
  is idempotent on `(sourceType, sourceId)` and skips unchanged `contentHash`; vector filter uses
  `userId` with `sourceType` post-filter per §5.2. No behavior change to existing features.
- **Out of scope:** generating any embeddings.

### PR3 — `feat(web): embed on write`
- **Scope:** `resolve-key.ts`; `embedAndStoreSource` helper + shim; wire into bookmark save/sync,
  analysis persist, takeaway snapshot persist; delete-embedding on bookmark delete; telemetry on
  failure; tests with a fake embedding client + fake convex admin.
- **Acceptance:** new bookmarks/analyses/snapshots produce an `embeddings` row when a key resolves;
  embedding failure never fails the parent write (asserted by test); no key → skipped + logged, not
  thrown; deleting a bookmark removes its embedding.
- **Depends on:** PR1, PR2.

### PR4 — `feat(scripts): backfill embeddings migration`
- **Scope:** `scripts/backfill-embeddings.mjs` — iterate existing rows missing an up-to-date
  embedding, batch through the service, write via `upsertEmbedding`; idempotent, resumable
  (cursor), `--dry-run`, `--source=bookmark|analysis|takeaway|all`, rate-limited with backoff;
  per-user key resolution with platform fallback; summary report (counts, skipped, failed). Docs in
  the script header + README.
- **Acceptance:** dry-run reports planned work and writes nothing; re-running after a partial run
  skips already-embedded rows; respects rate limits; logs a final summary. Manual run instructions
  documented.
- **Depends on:** PR1, PR2.

### PR5 — `feat(suggestions): semantic affinity ranking`
- **Scope:** integrate semantic affinity into `build-suggestions.ts` per §5.5; threshold/weight
  constants; both-mode tests (semantic + fallback) using a fake embedding/search client.
- **Acceptance:** with embeddings, semantically related (non-verbatim) candidates outrank unrelated
  ones in tests; with no key, output matches the pre-change substring behavior (regression-guarded);
  structural signals unchanged; no unbounded fan-out beyond existing candidate caps.
- **Depends on:** PR1, PR2 (and PR3/PR4 for real data, but testable independently).

### PR6 — `feat(web): semantic search API`
- **Scope:** `POST /api/me/search` route; `SearchRequest/Result/Response` contracts + re-export;
  `searchEmbeddingsForSession` admin wrapper; route tests (auth required, validation, no-key flag,
  grouping).
- **Acceptance:** authed query returns ranked grouped results scoped to the user; unauthenticated →
  401; invalid body → 400; no key → `needsKey: true` with empty results; results never leak another
  user's rows (asserted).
- **Depends on:** PR1, PR2.

### PR7 — `feat(web): semantic search page`
- **Scope:** `/app/search` page + component(s); nav entry; loading/empty/no-key/error states;
  minimal component test and/or a PR screenshot in `docs/pr-screenshots`.
- **Acceptance:** typing a query and submitting renders grouped results linking into existing
  views; no-key state explains how to add an OpenAI key; matches existing app page styling/layout.
- **Depends on:** PR6.

### PR8 — `docs: track A rollout`
- **Scope:** README feature + setup updates (`PLATFORM_OPENAI_API_KEY`, search page, semantic
  ranking); `docs/deployment-web.md` env + backfill runbook; mark this PRD's status `Shipped`;
  final changeset.
- **Acceptance:** docs accurately describe behavior, env vars, key fallback, and the backfill
  procedure; PRD Decisions log reflects any deviations.
- **Depends on:** PR1–PR7.

## 8. Testing strategy
- **Framework:** existing Node `--test` via `tsx` (`npm test`). No new test runner.
- **No live API calls** in tests — inject a fake embedding client / fake convex admin. Mock `fetch`
  for the AI service.
- **Determinism:** use fixed fake vectors so similarity assertions are stable.
- **Regression guard:** PR5 must include a test proving the no-key fallback equals prior behavior.
- **Isolation guard:** PR6 must include a test proving search results never include another user's
  rows.

## 9. Cost, rate-limit & performance
- Batch embeddings (≤96/request) and dedupe by `contentHash` to avoid re-embedding unchanged text.
- Backfill is rate-limited with exponential backoff on 429 and is resumable.
- Per-suggestion-run candidate embedding is bounded by the existing candidate cap (no new fan-out).
- `text-embedding-3-small` at ~$0.02/1M tokens makes full-corpus backfill negligible for typical
  accounts; the script still logs token/row counts so cost is observable.
- Note: parallelizing the X fan-out and adding response caching is **Track B**, not here.

## 10. Conventions the implementing agent MUST follow
From [`AGENTS.md`](../../AGENTS.md) and observed repo patterns:
- ESM TypeScript; **relative imports include the `.js` extension**.
- **Every new `.ts` module needs a sibling `.js` re-export shim** (`export * from "./name.ts";`) —
  this is the repo's existing convention (41 such shims today) and CI depends on it. Match it.
- No `any` unless unavoidable; no inline/dynamic imports; top-level imports only.
- Public APIs via `index.ts` re-exports; internals in separate modules.
- No emojis in code or commit messages.
- Keep every file under 600 lines (`scripts/check-file-length.mjs`).
- Run `npm run check` (biome + file-length + tsgo) and `npm test`; fix all errors/warnings/infos.
- Conventional Commits; **one PR per task**; do not commit unless requested; pause for review
  before merge.
- Add a changeset (`npm run changeset`) for any change to a published package.
- The pre-commit husky hook appends `progress.txt` automatically — do not hand-edit it.

## 11. Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Convex vector dimension is immutable (D7) | Lock 1536 now; model migration is an explicit future track, not silent |
| Vector filter can't AND userId + sourceType | Filter by userId, post-filter sourceType, over-fetch (§5.2) — covered by PR2 acceptance |
| Users without an OpenAI key | Platform fallback (D2); graceful degradation to substring ranking + `needsKey` search flag |
| Embedding failure blocking writes | Always catch + report; never fail the parent write (PR3 acceptance) |
| Cost runaway on backfill | Batching, contentHash dedupe, rate limit, dry-run, resumable, summary logging |
| Cross-user data leak in search | userId scoping from auth context only; isolation test in PR6 |
| Re-embedding loops on every write | `contentHash` short-circuit |

## 12. Open questions
_None blocking. Log new questions here with a proposed default; resolve before the affected PR._

| # | Question | Proposed default | Status |
|---|----------|------------------|--------|
| Q1 | Exact semantic affinity weight/threshold constants | Tune in PR5; start weight 40, threshold 0.78 cosine | Open |
| Q2 | Should search rank blend recency with similarity? | Pure similarity for v1; recency is a follow-up | Open |

## 13. Review & sign-off protocol
For each PR, Claude reviews against: the PR's acceptance criteria, the Decisions log (§3), the
conventions (§10), and module boundaries (§4–§5). Output is either an explicit **Approved**
statement or a **Requested changes** list with file paths and line numbers. Claude does not
implement. The repo owner merges.

### Sign-off log
| PR | Title | Implementing agent | Review result | Reviewed (date) | Merged |
|----|-------|--------------------|---------------|-----------------|--------|
| PR1 | embedding service | | | | |
| PR2 | embeddings table & functions | | | | |
| PR3 | embed on write | | | | |
| PR4 | backfill migration | | | | |
| PR5 | semantic affinity ranking | | | | |
| PR6 | search API | | | | |
| PR7 | search page | | | | |
| PR8 | rollout docs | | | | |

## 14. Decisions log
| Date | Decision | Detail |
|------|----------|--------|
| 2026-05-29 | D1–D7 locked | Embedding model, key source, backfill, surface, vector store, storage shape, fixed dimension — see §3 |
| 2026-05-29 | PR breakdown locked | 8 PRs, one per task, in dependency order — see §7 |
