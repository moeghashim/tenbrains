# Driving tenbrains from an agent

This CLI is built to be called by automated agents. Read this once; call `tenbrains manifest` for the
exhaustive, always-current spec.

## Contract

- **stdout is exactly one JSON object per run.** Parse it. Never scrape human text.
- **stderr is diagnostics only** (progress, warnings). Ignore it for results, or surface it to logs.
- **Branch on `ok`, then on `error.code`** — not on message strings.
- **Exit code mirrors the error class** (see table). `0` iff `ok: true`.

Success envelope:

```json
{ "ok": true, "command": "<name>", "data": { ... }, "meta": { ... } }
```

Error envelope:

```json
{ "ok": false, "command": "<name>", "error": { "code": "<CODE>", "message": "...", "retryable": false, "details": { ... } } }
```

`meta` carries ids and flags you'll want to chain on: `analysisId`, `postId`, `snapshotId`,
`bookmarkId`, `suggestionId`, `trackId`, `provider`, `model`, `mock`, `deduped`, `persisted`.

## Codes

| error.code | exit | meaning |
| --- | --- | --- |
| (none — success) | 0 | `ok: true` |
| INTERNAL | 1 | unexpected failure |
| USAGE | 2 | bad/missing arguments or unknown command |
| NOT_FOUND | 3 | id or resource does not exist |
| MISSING_CREDENTIALS / CONFIG_ERROR | 4 | no key configured / unreadable config |
| PROVIDER_* | 5 | upstream model error (`retryable` indicates if a retry may help) |
| VALIDATION / PROVIDER_BAD_OUTPUT | 6 | input or model output failed schema validation |
| CONFLICT | 7 | already exists (e.g. duplicate bookmark / follow) |

## Conventions

- **Output is JSON by default.** Do not pass `--pretty` (that's for humans).
- **Pass content in, or fetch it.** Provide post text via `--text`, or give `--url`/`--id` to fetch a
  tweet — single tweets fetch free via oEmbed (no key), `--fetch auto|oembed|api`. Inputs accept
  inline strings, `@path` (read file), or `-` (read stdin). JSON inputs (`--posts`, `--ratings`) take
  the same forms. `takeaway refresh` fetches a timeline when `--posts` is omitted (needs an X token,
  usually a paid tier).
- **Ids are prefixed and stable**: `post_`, `ana_`, `acc_`, `snap_`, `bm_`, `sug_`, `trk_`, `obj_`. Any id
  resolves via `tenbrains record get <id>`.
- **Dedup is automatic.** Re-ingesting a post with the same `--id` (external X id) reuses the stored
  post (`meta.deduped: true`).
- **Isolate state with `--db <path>`** if you want a per-task workspace.
- **No environment variables.** Configure once with `tenbrains setup --provider <p> --api-key <k>`
  (add `--x-bearer <token>` for X timeline fetches; `-` pipes a secret without echo). Or test offline
  with `--provider mock`.

## Recipes

Analyze and capture the id (supply text, or fetch a tweet free by URL):

```bash
tenbrains analyze --provider mock --id 123 --author levelsio \
  --text "Agent-first CLIs persist outcomes to a database."
tenbrains analyze --url "https://x.com/jack/status/20"   # fetched free via oEmbed; meta.source=x:oembed
# -> .meta.analysisId, .data.analysis.{topic,summary,intent,novelConcepts[5]}
```

Analyze + generate a learning track in one call (ratings optional):

```bash
echo '[{"concept":"Agentic","familiarity":2,"interest":5}]' \
| tenbrains analyze --provider mock --text "..." --learn --minutes 10 --ratings -
```

Account takeaways (supply recent posts, or fetch from X with a token):

```bash
tenbrains takeaway follow levelsio
tenbrains takeaway refresh levelsio --provider mock --posts @recent.json   # supplied
tenbrains takeaway refresh levelsio --count 20                             # fetched (needs X token)
tenbrains takeaway show levelsio --history
```

Suggestion feedback loop:

```bash
tenbrains suggest generate                 # ranks analyzed, un-bookmarked posts vs your saved signal
tenbrains suggest save sug_...             # -> creates a bookmark (meta.bookmarkId)
tenbrains suggest dismiss sug_...          # -> suppressed in future ranking
```

Recall:

```bash
tenbrains search "vector databases" --type analysis,bookmark
```

## Discovery

```bash
tenbrains manifest        # full command tree, flags, providers, error codes, exit codes, db schema
```

## House rules for code changes

- ESM TypeScript, strict. Relative imports end in `.js`. No `any`. Keep stdout reserved for the
  result envelope — log to stderr via the `Logger`.
- After changes: `npm run check` (typecheck + biome + tests) must pass.
- Add a migration (never edit an existing one) in `src/db/migrations.ts` for schema changes.
- New persisted outcomes follow the pattern: zod schema → repository method → command returning a
  `CommandResult`. Add a test under `test/`.
