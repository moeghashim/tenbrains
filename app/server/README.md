# Ten Brains local API

Use Node 22. From `app/`, run:

```sh
npm run server
```

The Express API listens on `http://localhost:5174`. Vite proxies `/api` to that port. Discovery documents persist as JSON under `server/data/`.

## Wayfinder provider

Mock mode needs no key and stays deterministic:

```sh
WAYFINDER_PROVIDER=mock npm run server
```

To use Anthropic, create the gitignored `server/.env` file:

```dotenv
ANTHROPIC_API_KEY=your-key
WAYFINDER_PROVIDER=anthropic
WAYFINDER_MODEL=claude-sonnet-5
```

`WAYFINDER_PROVIDER` accepts `mock` or `anthropic` and always wins. When it is unset, the server selects Anthropic if `ANTHROPIC_API_KEY` exists; otherwise it selects mock. `WAYFINDER_MODEL` is optional and defaults to `claude-sonnet-5`. Shell environment values override matching values in `server/.env`.

Anthropic and mock mode use the same SSE contract. Intake messages append transcript entries and staged candidates only.

Grilling sessions use these endpoints:

- `POST /api/discoveries/:id/sessions` creates a standalone session or starts one from an approved Grilling ticket.
- `POST /api/discoveries/:id/sessions/:sid/messages` streams `token`, `candidate`, `inquiry`, `done`, and `error` events.
- `POST /api/discoveries/:id/sessions/:sid/evidence` captures a marked transcript moment.
- `POST /api/discoveries/:id/sessions/:sid/updates/approve` applies selected session candidates.

Only the intake and session approval endpoints mutate the map. Provider turns only stage reviewable candidates.
