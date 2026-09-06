# Ten Brains local API

Use Node 22. From `app/`, run:

```sh
npm run server
```

The Express API listens on `http://localhost:5174`. Vite proxies `/api` to that port. Discovery documents persist as JSON under `server/data/`.

## Wayfinder providers

Mock mode needs no key and stays deterministic:

```sh
WAYFINDER_PROVIDER=mock npm run server
```

Create the gitignored `server/.env` file for provider settings. Global selection accepts `mock`, `anthropic`, `openai`, `claude-subscription`, `codex-subscription`, or `grok-subscription`:

```dotenv
WAYFINDER_PROVIDER=anthropic
ANTHROPIC_API_KEY=<paste key here>
WAYFINDER_MODEL=claude-sonnet-5
```

When `WAYFINDER_PROVIDER` is unset, selection priority is Anthropic key, OpenAI key, then mock. An explicit provider always wins. Shell environment values override matching values in `server/.env`.

Use any OpenAI-compatible chat-completions endpoint with these settings:

```dotenv
WAYFINDER_PROVIDER=openai
OPENAI_API_KEY=<paste key here>
WAYFINDER_OPENAI_BASE_URL=https://api.openai.com/v1
WAYFINDER_MODEL=gpt-5.6-luna
```

`WAYFINDER_OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. Change it for OpenRouter, Ollama, or another compatible endpoint.

Intake and Grilling sessions can select providers and models independently with `WAYFINDER_INTAKE_PROVIDER`, `WAYFINDER_INTAKE_MODEL`, `WAYFINDER_SESSION_PROVIDER`, and `WAYFINDER_SESSION_MODEL`. Surface settings fall back to the global provider and model.

Use this exact mixed-provider recipe to keep intake in deterministic mock mode and run Grilling sessions on GPT-5.6 Luna:

```dotenv
WAYFINDER_PROVIDER=mock
OPENAI_API_KEY=<paste key here>
WAYFINDER_SESSION_PROVIDER=openai
WAYFINDER_SESSION_MODEL=gpt-5.6-luna
```

All providers use the same SSE and staging contracts. Intake messages append transcript entries and staged candidates only.

Discovery persistence uses these endpoints:

- `GET /api/discoveries` lists discoveries with server-derived map counts and clarity.
- `GET /api/discoveries/:id` reads one full discovery document.
- `POST /api/discoveries` creates a discovery.
- `PATCH /api/discoveries/:id` renames or archives a discovery.

Deletion is intentionally unavailable to avoid destructive surprises while the data model is still settling.

Grilling sessions use these endpoints:

- `POST /api/discoveries/:id/sessions` creates a standalone session or starts one from an approved Grilling ticket.
- `POST /api/discoveries/:id/sessions/:sid/messages` streams `token`, `candidate`, `inquiry`, `done`, and `error` events.
- `POST /api/discoveries/:id/sessions/:sid/evidence` captures a marked transcript moment.
- `POST /api/discoveries/:id/sessions/:sid/updates/approve` applies selected session candidates.

Only the intake and session approval endpoints mutate the map. Provider turns only stage reviewable candidates.

## Subscription credentials and login

From `app/`, with Node 22 first on PATH:

```sh
export PATH="$HOME/.nvm/versions/node/v22.16.0/bin:$PATH"
npm run auth -- status
npm run auth -- login claude-subscription
npm run auth -- login codex-subscription
npm run auth -- login grok-subscription
```

`login` **prints instructions only**. It does not execute a shell, collect tokens, start OAuth, or launch a browser. Run the printed command yourself:

| Provider | Login command | Credential source | Default model / transport |
| --- | --- | --- | --- |
| `claude-subscription` | `claude auth login --claudeai` | `~/.claude/.credentials.json`, `claudeAiOauth` | `claude-sonnet-5`; Anthropic Messages with Bearer OAuth and `anthropic-beta: oauth-2025-04-20` |
| `codex-subscription` | `codex login` | `~/.codex/auth.json`, `tokens` | `gpt-5.4`; ChatGPT Codex Responses, **not** the metered OpenAI API |
| `grok-subscription` | `grok login` | `~/.grok/auth.json` | `grok-build`; CLI chat proxy with `X-XAI-Token-Auth` and model-override headers |

The installed Grok CLI documents direct proxy access in its README. Its current credential store uses an `https://auth.x.ai::<client>` entry with `key`, `refresh_token`, `expires_at`, and OIDC metadata; the older `https://accounts.x.ai/sign-in` entry is also recognized. Multiple matching accounts are intentionally refused rather than guessed. Other issuers/custom credential helpers are not executed. Grok OIDC refresh only uses the trusted `https://auth.x.ai` discovery/token endpoints; legacy session credentials without refresh material require `grok login`.

Claude uses `accessToken`, `refreshToken`, and millisecond `expiresAt`; Codex uses `access_token`, `refresh_token`, `account_id`, and the JWT `exp` claim when present. JWT decoding is expiry metadata only, not signature verification. Keychain-only CLI credentials are not extracted; file absence reports `needs-login`. API-key-only Codex login is not treated as ChatGPT subscription login.

Status inspection is offline and read-only: `available` means an unexpired local token exists, **not** that the remote service or chosen model has accepted it. Unknown expiry is reported explicitly. Missing, unreadable, malformed, expired, or unsupported account files produce bounded reasons without token material. Source paths are displayed as fixed home-relative paths, never arbitrary credential-file contents or account identifiers.

On a turn, expiring access tokens are refreshed when supported material exists. Refresh requests have timeouts, reject redirects, and concurrent refreshes are coalesced. Refreshed access/refresh tokens stay **in process memory only**: Ten Brains never writes credential files, overwrites CLI-owned credentials, or stores credentials in its repo/config/discovery documents. **Limitation:** rotating refresh tokens can leave the CLI's disk copy stale after a restart; run the provider's login again if that happens. Do not concurrently refresh the same CLI account in several processes. Status does not refresh or call a remote service.

Authentication failures, revoked tokens, rate limits, network errors, and unsupported models end the existing SSE stream with an `error` event and a safe login/settings instruction, not a process crash or an upstream error dump. Subscription adapters disable SDK logging. Remote eligibility, subscription limits, and provider terms still apply; third-party subscription OAuth is not guaranteed supported. This is a local personal-use integration, not deployment authentication. No real inference or token-refresh smoke is performed by the automated suite.

## Provider settings API

`GET /api/providers` returns:

```json
{
  "routing": {
    "intake": { "provider": "mock", "model": "mock" },
    "sessions": { "provider": "codex-subscription", "model": "gpt-5.4" }
  },
  "providers": [
    { "id": "mock", "status": "available", "reason": "Deterministic local provider; no login required." },
    {
      "id": "codex-subscription", "status": "needs-login",
      "reason": "Credential file not found.", "source": ".codex/auth.json",
      "found": false, "expiresAt": null, "loginCommand": "codex login"
    }
  ]
}
```

The actual `providers` array includes all six ids. Status uses `available` or `needs-login`; `unsupported` is reserved for providers without a supported transport (all three installed CLIs have a supported file format here). Subscription rows expose safe login instructions for Stage 2; there is deliberately no browser-launch/login API endpoint. API-key rows need their environment key rather than a subscription sign-in.

`PATCH /api/providers` accepts one or both surfaces (the API name is **`sessions`**, while its environment prefix is **`SESSION`**):

```json
{
  "intake": { "provider": "mock" },
  "sessions": { "provider": "codex-subscription", "model": "gpt-5.4" }
}
```

A surface update requires a provider; omitted model resets to that provider's default. Unknown surfaces, providers, extra fields, and invalid model identifiers return generic HTTP 400 errors without echoing input. Model ids are bounded identifiers, not arbitrary text. Updates apply on the next turn and persist atomically in gitignored `server/provider-config.local.json`; temporary files are also ignored. Concurrent updates are serialized. Missing/corrupt config falls back to environment/defaults.

Precedence, independently for provider and model:

1. Surface environment variable (`WAYFINDER_INTAKE_*` or `WAYFINDER_SESSION_*`).
2. Global environment variable (`WAYFINDER_PROVIDER` / `WAYFINDER_MODEL`).
3. Saved surface selection.
4. Existing automatic provider selection (Anthropic key, OpenAI key, mock) and provider-default model.

Shell environment continues to override matching `server/.env` entries. Empty values are treated as unset by the settings API. PATCH saves a preference even when environment overrides it; the response always shows **effective** routing. Remove the overriding environment value and restart to use a saved preference. No API keys, tokens, or credentials are accepted by PATCH.

## Tests and isolation

```sh
npm test
npm run build
```

`WAYFINDER_AUTH_HOME` redirects all three credential paths to a fixture home. `WAYFINDER_CONFIG_PATH` redirects the selection file; `TEN_BRAINS_DATA_DIR` redirects discovery storage. API tests set all three to temporary directories and never read real CLI credential files or use `server/data`. Tests cover unchanged mock workflow, routing, provider detection, redaction, malformed/missing auth, refresh caching, selection persistence, environment precedence, and safe subscription SSE failures. Tests use fake secrets only and never perform provider login.
