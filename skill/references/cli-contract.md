# tenbrains CLI contract (reference)

Full detail for the `tenbrains` CLI. Read this when `SKILL.md` and `tenbrains manifest` aren't
enough. For the always-current machine-readable spec, prefer `tenbrains manifest` (JSON).

## Contents

- [Output envelope](#output-envelope)
- [Error codes and exit codes](#error-codes-and-exit-codes)
- [Global flags](#global-flags)
- [Input forms](#input-forms)
- [Command catalog](#command-catalog)
- [Providers](#providers)
- [Database](#database)

## Output envelope

stdout is always exactly one JSON object. stderr is for diagnostics/progress only.

Success:

```json
{ "ok": true, "command": "analyze", "data": { "...": "..." }, "meta": { "...": "..." } }
```

Failure:

```json
{ "ok": false, "command": "analyze", "error": { "code": "NOT_FOUND", "message": "...", "retryable": false, "details": { "...": "..." } } }
```

`meta` commonly carries: `analysisId`, `postId`, `snapshotId`, `bookmarkId`, `suggestionId`,
`trackId`, `objectiveId`, `objectives` (applied/inherited objective slugs), `provider`, `model`,
`mock`, `deduped`, `persisted`. Branch on `ok`, then `error.code`.

## Error codes and exit codes

| error.code | exit | meaning |
| --- | --- | --- |
| (success) | 0 | `ok: true` |
| INTERNAL | 1 | unexpected failure |
| USAGE | 2 | bad/missing arguments or unknown command |
| NOT_FOUND | 3 | id or resource does not exist |
| MISSING_CREDENTIALS / CONFIG_ERROR | 4 | no key configured / unreadable config |
| PROVIDER_UNAUTHORIZED / PROVIDER_RATE_LIMITED / PROVIDER_UPSTREAM / PROVIDER_NETWORK / PROVIDER_BAD_OUTPUT | 5 | upstream model error (`retryable` indicates whether a retry may help) |
| VALIDATION | 6 | input failed schema validation |
| CONFLICT | 7 | already exists (duplicate bookmark, follow, etc.) |

## Global flags

Valid on every command, in any position:

- `--json` — emit the JSON envelope (default).
- `--pretty` — human-readable output instead of JSON.
- `--quiet` — suppress progress logging on stderr.
- `--db <path>` — SQLite database file (default `~/.local/share/tenbrains/tenbrains.db`).
- `--config-dir <path>` — directory for the managed config file.

## Input forms

Any text/JSON flag (`--text`, `--transcript`, `--posts`, `--ratings`, and config `<value>`) accepts:

- inline string: `--text "hello"`
- `@path` to read a file: `--posts @recent.json`
- `-` to read stdin: `--text -`

## Command catalog

### analyze

- `analyze` — analyze a post. Provider flags: `--provider`, `--model`, `--api-key`. Post input:
  `--text`, `--url`, `--id <externalId>`, `--author`, `--author-name`, `--posted-at`, or
  `--post-id <id>` to re-analyze a stored post. If only `--url`/`--id` is given (no `--text`), the
  tweet is fetched: `--fetch auto|oembed|api` (default `auto`, free-first — oEmbed needs no key;
  `api` uses `--x-bearer`/config token). Learning: `--learn`, `--minutes <n>`, `--ratings`.
  `--objective <slug>` is repeatable and explicitly tags the resulting post; with `--learn`, the
  generated track receives the same objectives.
  `--summarize` also returns `data.summary = { summary, keyPoints[] }` and persists it in post
  metadata. Returns `{ post, analysis, summary?, track? }`; `meta.source` is `text` | `stored` |
  `thread` | `x:oembed` | `x:api` | `x:thread` | `youtube`.
- `analyze --url <youtube-url> [--lang <code>]` — fetch public captions and analyze the transcript.
  Manual captions are preferred over ASR; language preference is requested code, English, then
  first available. `--transcript <text|@file|->` supplies a transcript without network and may be
  paired with a YouTube URL for canonical metadata/dedup. No-caption videos return `NOT_FOUND`;
  restricted videos return `PROVIDER_UNAUTHORIZED`.
- `analyze --thread <json>` — analyze a whole thread as one document; parts are strings or
  `{text, externalId?}` objects (`@file`/`-` ok). Bare `--thread` with `--url`/`--id` fetches the
  author's self-thread via the X API (needs a Bearer token; degrades to the root tweet when reply
  search is unavailable). `meta.threadParts` reports how many parts were combined.
- `analyze list [--limit --offset --author]` — recent analyses.
- `analyze get <id>` — one analysis with its post.

### takeaway

- `takeaway follow <username> [--name] [--objective <slug> ...]` — follow an account and explicitly
  tag it with existing objectives.
- `takeaway unfollow <username>` — stop following (deletes snapshots).
- `takeaway list` — followed accounts + latest takeaway.
- `takeaway refresh <username> [--posts <json> | --count <n>] [--x-bearer <token>] [provider flags]`
  — summarize recent posts into a snapshot `{ summary, takeaways[] }`. Supply posts via `--posts`
  (`[{ text, externalId?, url?, postedAt? }]`), or omit `--posts` to fetch up to `--count` (default
  20) from the X API (needs a Bearer token + usually a paid tier).
- `takeaway show <username> [--history --limit]` — latest snapshot (or history) with source posts.

### suggest

- `suggest generate [--limit]` — rank analyzed, un-bookmarked posts against your saved signal
  (recency-weighted: saves lose half their influence every ~60 days).
- `suggest list [--status pending|saved|dismissed|all --limit]`.
- `suggest save <id>` — mark saved and create a bookmark.
- `suggest dismiss <id>` — suppress in future ranking.
- `suggest add (--post-id <id> | --text ...) [--reason --score]` — inject a candidate.

### bookmark (alias: bm)

- `bookmark add (--post-id <id> | --text ...) [--tags a,b --note --source --no-auto-tags]
  [--objective <slug> ...]` — auto-tags bookmark tags from the post's analysis unless `--tags` is
  given; objective flags explicitly tag the post, not the bookmark.
- `bookmark list [--tag --limit --offset]`.
- `bookmark show <id>` — bookmark + post + analysis.
- `bookmark tag <id> [--add a,b --remove c,d]`.
- `bookmark remove <id>` (alias: rm).

### learn

- `learn generate --analysis <id> [--ratings <json> --minutes <n>] [--objective <slug> ...]` —
  build a 7-day Feynman track. Without explicit objectives, it inherits all objective tags from the
  analysis' source post; explicit values override inheritance.
- `learn today [id]` — the next pending day's task (defaults to the latest track with pending days;
  errors NOT_FOUND when none). `data.day` is the next unfinished day — content is never skipped —
  and `data.scheduledDay`/`data.behindBy` report where the calendar says the learner should be.
- `learn done <id> [--day <n> --notes <text>]` — mark a day finished (default: next pending day).
  Marking a day twice is a CONFLICT (exit 7). `meta.completed` flips true on the last day.
- `learn show <id>` — a track (includes its `progress` entries).
- `learn list [--analysis --limit]`.

### objective

Objectives are first-class learning goals and remain separate from bookmark tags. Multiple
objectives can be active, but the repository enforces at most one current focus. Focus never
auto-tags content.

- `objective add <name> [--description <text> --focus]` — derive a kebab-case slug and create an
  active objective. Duplicate slugs return `CONFLICT`.
- `objective list [--status active|archived|all]` — objectives with tagged-record counts and focus
  marker (default: active).
- `objective show [slug]` — objective detail, counts, and tagged records grouped into `posts`,
  `accounts`, `bookmarks`, and `tracks`; without a slug, defaults to the current focus and returns
  `NOT_FOUND` when none is set.
- `objective focus <slug>` / `objective focus --clear` — atomically set or clear the current focus.
- `objective archive <slug>` — archive while preserving record links; archiving the focus clears it.
- `objective link <recordId> --objective <slug>` — tag an existing `post_`, `acc_`, `bm_`, or
  `trk_` record.
- `objective unlink <recordId> --objective <slug>` — remove that explicit tag.

Objective records use `obj_` ids. `record get` returns an `objectives` array for linkable record
types. Creation-time `--objective` flags are repeatable. Every slug must already exist; unknown
slugs return `NOT_FOUND` with guidance to run `objective add`. No command derives tags from content
or from the current focus.

### search

- `search <query> [--type analysis,takeaway,bookmark|all --limit]` — full-text search (SQLite FTS5)
  across stored analyses, takeaways, and bookmarks; results grouped by type and ranked by BM25
  (higher `score` = better). Queries are stemmed, so "embedding" matches "embeddings".

### digest

- `digest [--days <n>]` — recap of the window (default 7 days). `data.markdown` is a ready-to-send
  markdown report; `data.counts` has per-section totals. Useful for weekly summaries.

### import

- `import x-archive <path> [--likes | --tweets] [--limit <n>] [--no-bookmarks]` — bulk-import an
  *extracted* official X account archive directory (the one containing `data/`). Likes become
  posts + bookmarks (source `x:archive`); the account's own tweets become posts. Idempotent:
  re-runs dedupe on tweet id. No API key needed.

### setup / config

- `setup [--provider --api-key --model --default --x-bearer]` — collect and store AI provider
  credentials and an optional X API Bearer token (`x.bearerToken`), interactively on a TTY or via
  flags (`--api-key -` / `--x-bearer -` read stdin).
- `config set <key> <value>` — dot-path (e.g. `providers.openai.apiKey`); value may be `@file`/`-`.
- `config get <key> [--reveal]` — secrets redacted unless `--reveal`.
- `config list [--reveal]`, `config unset <key>`, `config path`.

### record / db / manifest

- `record get <id>` — resolve any prefixed id, including `obj_`, and return objective tags alongside
  linkable records.
- `db stats | migrate | vacuum | reindex | reset --yes` (`reindex` rebuilds the search index).
- `manifest` — full machine-readable description of the CLI.

## Providers

Default `anthropic` (Claude). Also `openai`, `google`, `xai`, and `mock` (deterministic, offline, no
key). Each non-mock provider needs a key configured at `providers.<id>.apiKey` (via `setup`/`config`)
or passed with `--api-key`. Run `tenbrains manifest` for the live catalog and default models.

## Database

One SQLite file, versioned schema migrated automatically on open. Tables: `posts`, `analyses`,
`accounts`, `takeaway_snapshots`, `bookmarks`, `suggestions`, `learning_tracks`, `objectives`, and
`objective_links`. Schema v4 introduces objectives. Point a task at an isolated file with
`--db <path>`.
