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

Create the gitignored `server/.env` file for provider settings. Global selection accepts `mock`, `anthropic`, or `openai`:

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
