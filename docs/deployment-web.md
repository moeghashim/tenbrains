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
- `X_API_KEY`
- `X_API_SECRET`
- `X_BEARER_TOKEN`

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
