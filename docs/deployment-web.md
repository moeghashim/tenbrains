# Web Deployment Runbook (Vercel + Auth.js + Convex + X)

## Required Environment Variables

Set these in both Vercel Preview and Production:

- `AUTH_SECRET`
- `AUTH_X_ID`
- `AUTH_X_SECRET`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `CONVEX_DEPLOY_KEY` (server-only; used for authenticated server-to-Convex writes)
- `USER_SECRETS_ENCRYPTION_KEY` (server-only; used to encrypt user-supplied model provider API keys before storage)
- `CRON_SECRET` (server-only; bearer secret for internal scheduled routes)
- `X_API_KEY`
- `X_API_SECRET`
- `X_BEARER_TOKEN`

Optional semantic fallback:

- `PLATFORM_OPENAI_API_KEY` (server-only; fallback OpenAI key for semantic suggestions, semantic search, and embeddings backfill when a user has not added an OpenAI key in `/account`)

Optional runtime control:

- `SKIP_STARTUP_ENV_VALIDATION=1` (only for temporary local troubleshooting)

## Auth.js + X OAuth Configuration

1. Configure X app callback URLs for both preview and production:
   - `https://<preview-domain>/api/auth/callback/twitter`
   - `https://www.tenbrains.app/api/auth/callback/twitter`
2. If the apex host redirects to `www`, register the `www` callback URL in X exactly as shown above. Auth.js uses the request host when building the Twitter callback URL.
3. Use `/sign-in` as the application entry route for authentication.
4. Keep protected routes:
   - `/app`
   - `/account`

## Convex Configuration

1. Set `CONVEX_DEPLOYMENT` for the target environment.
2. In Vercel production, `CONVEX_DEPLOYMENT` must point at a Convex production deployment, never a `dev:*` deployment.
3. Set `NEXT_PUBLIC_CONVEX_URL` matching the same deployment.
4. Set `CONVEX_DEPLOY_KEY` for trusted server-side mutation access and keep GitHub Actions pointed at the same deployment.
5. Sync environment variables in Convex dashboard for server functions using X API.
6. Deploy the latest schema before sending traffic to the new web build. The app now expects:
   - `userPreferences.defaultProvider`
   - `analyses.provider`
   - `userProviderCredentials`
   - `embeddings` with the `by_embedding` vector index

Local development note:

- The tracked `.env.local` files are for Convex development and may use a `dev:*` deployment.
- Do not copy local `.env.local` Convex values into Vercel production.

## X Production Keys (App-Only Ingestion)

1. Use app-only keys with read access for tweet ingestion:
   - `X_API_KEY`
   - `X_API_SECRET`
   - `X_BEARER_TOKEN`
2. Rotate keys on a regular cadence and immediately after incidents.
3. Never print key values in logs or telemetry payloads.

## Model Provider Runtime Notes

1. Tenbrains no longer needs app-owned OpenAI, Gemini, Grok, or Claude keys for end-user analysis.
2. End users bring their own provider keys through `/account`.
3. `USER_SECRETS_ENCRYPTION_KEY` is required even if only one provider is used. Without it, startup validation fails.
4. Rotating `USER_SECRETS_ENCRYPTION_KEY` without a migration will invalidate previously stored user provider credentials.
5. Semantic suggestions and `/app/search` resolve a per-user OpenAI key first, then use `PLATFORM_OPENAI_API_KEY` when configured.
6. Users with their own OpenAI key self-fund semantic embedding calls; fallback usage bills to the platform key.

## Backfill Runbook

Run the embeddings backfill after deploying the Convex embeddings schema and functions, and before treating Track A search/ranking as fully warmed for existing users. The canonical operator commands live in the README [Embeddings Backfill](../README.md#embeddings-backfill) section.

Recommended rollout:

1. Run the dry-run command from the README against the target Convex deployment.
2. Confirm planned bookmark, analysis, and takeaway counts look reasonable.
3. Run the non-dry-run command with a conservative `--batch-size`, such as `32`.
4. Re-run with the same flags after failures or interruptions; the script skips rows whose `contentHash` already matches.
5. Use `--source`, `--user`, and `--limit` for scoped recovery runs.

Cost guidance:

- Backfill and query embeddings use OpenAI `text-embedding-3-small` at roughly `$0.02` per 1M tokens.
- Per-user OpenAI keys are used first, so those users pay their own embedding cost.
- `PLATFORM_OPENAI_API_KEY` is optional but useful for users who have not configured their own key; fallback calls bill to the platform key.
- The backfill script is sequential, batches source rows, retries rate limits with backoff, and prints a final summary for operator review.

## Route Configuration

1. Public auth routes:
   - `/sign-in`
   - `/sign-up` (redirects to `/sign-in`)
2. Middleware-protected routes:
   - `/app`
   - `/account`

## Startup Validation

`apps/web/src/config/startup-env.ts` validates all required env keys.
Missing keys fail fast at runtime startup/middleware execution.
Vercel production also fails fast if `CONVEX_DEPLOYMENT` starts with `dev:`.

## Pre-Deploy Validation

1. Run `npm test`.
2. Run `npm run check`.
3. Run `npm run -w @tenbrains/web typecheck`.
4. Build preview: `npm run -w @tenbrains/web build`.

## Post-Deploy Smoke Test

1. Sign in on the deployed web app.
2. Open `/account` and save an API key for at least one provider.
3. Save a default provider and model.
4. Analyze a public tweet from `/` or `/app`.
5. Confirm the response succeeds and the saved analysis appears in Convex with both `provider` and `model`.
6. Remove the saved provider key and confirm analysis fails with a clear configuration error.
7. If `PLATFORM_OPENAI_API_KEY` is configured or the signed-in user has an OpenAI key, open `/app/search` and confirm a search returns a non-error state.
