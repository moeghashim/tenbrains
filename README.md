# tenbrains

An **agent-first** CLI for X and YouTube research. It analyzes posts and video transcripts, tracks followed accounts, surfaces
suggestions, and **persists every outcome to a local SQLite database** — all from the command line,
with no `.env` files and no hosted backend.

This is a ground-up rebuild of [moeghashim/tenbrains](https://github.com/moeghashim/tenbrains)
(originally a Convex-backed web workspace) reshaped around a single design goal: **be consumed by
agents.** Every command emits one stable JSON envelope on stdout, every failure carries a
machine-readable code and a deterministic exit status, and the entire surface is discoverable via
`tenbrains manifest`.

## Why it's "agent-first"

- **Structured output by default.** stdout is always exactly one JSON envelope. Diagnostics and
  progress go to stderr, so a parser never has to untangle the two. `--pretty` switches to
  human-readable output for terminal use.
- **Stable contract.** `{ ok, command, data, meta }` on success, `{ ok, command, error }` on
  failure. Error `code`s and process exit codes are fixed per failure class.
- **Self-describing.** `tenbrains manifest` returns the full command tree, flags, provider catalog,
  error codes, and exit codes as JSON — an agent can discover the whole tool in one call.
- **Non-interactive.** No blocking prompts. Content comes in via flags, `@file`, or `-` (stdin);
  credentials are collected through commands, never by hand-editing a dotfile.
- **Everything persisted.** Posts, analyses, takeaways, bookmarks, suggestions, learning tracks,
  and learning objectives all land in one local SQLite file you can point anywhere with `--db`.
- **Offline-capable.** The built-in `mock` provider produces deterministic analysis with no network,
  so agents and CI can exercise the full pipeline without API keys.

## Requirements

- Node.js **>= 24** (uses the built-in `node:sqlite` — no native modules to compile).

## Install

```bash
npm install -g tenbrains               # from npm — puts `tenbrains` (and `tb`) on PATH
tenbrains --help
```

Or from a clone:

```bash
npm install
npm run build
node dist/bin/tenbrains.js --help      # or: npm link  ->  tenbrains --help
```

During development you can run straight from TypeScript:

```bash
npm run dev -- analyze --provider mock --text "hello world"
```

## Quick start

```bash
# 1. Configure a provider once (stored in ~/.config/tenbrains/config.json, mode 0600).
#    Optionally add an X API Bearer token in the same step (see "Fetching from X").
tenbrains setup --provider anthropic --api-key sk-ant-... --default

# 2a. Analyze a post you already have (paste the content).
tenbrains analyze --author levelsio --id 1790000000000000000 \
  --text "Shipping an agent-first CLI today. Everything persists to SQLite, nothing in env files."

# 2b. Or analyze a tweet by URL — fetched free via X's oEmbed endpoint, no key needed.
tenbrains analyze --url "https://x.com/jack/status/20"

# 2c. Or fetch and analyze public YouTube captions, then add a narrative digest and study plan.
tenbrains analyze --url "https://www.youtube.com/watch?v=M7lc1UVf-VE" --summarize --learn

# 3. Read it back / explore.
tenbrains analyze list --limit 5
tenbrains search "agent cli"
tenbrains db stats --pretty
```

No API key handy? Use the deterministic offline provider:

```bash
tenbrains analyze --provider mock --text "vector databases power semantic search"
```

## The output contract

Success:

```json
{
  "ok": true,
  "command": "analyze",
  "data": { "post": { "...": "..." }, "analysis": { "topic": "...", "novelConcepts": ["..."] } },
  "meta": { "analysisId": "ana_...", "provider": "anthropic", "model": "claude-sonnet-4-6", "mock": false, "persisted": true }
}
```

Failure:

```json
{
  "ok": false,
  "command": "analyze",
  "error": { "code": "MISSING_CREDENTIALS", "message": "No API key configured for Anthropic Claude...", "retryable": false, "details": { "provider": "anthropic" } }
}
```

Exit codes: `0` success · `2` usage · `3` not found · `4` missing credentials / config ·
`5` provider error · `6` validation · `7` conflict · `1` internal. The full code→exit map is in
`tenbrains manifest`.

## Commands

| Command | Purpose |
| --- | --- |
| `analyze` | Analyze a post or YouTube transcript (`--text`, `--transcript`, or `--url` to fetch) into topic, summary, intent, and concepts. `--summarize` adds a narrative digest; `--learn` builds a track. |
| `analyze list` / `analyze get <id>` | Read stored analyses. |
| `objective add\|list\|show\|focus\|archive\|link\|unlink` | Manage first-class learning goals, one optional current focus, and explicit record tags. |
| `takeaway follow\|unfollow\|list\|refresh\|show` | Track accounts; summarize recent posts (supplied via `--posts` or fetched from X) into snapshots. |
| `suggest generate\|list\|save\|dismiss\|add` | Rank un-saved posts against your saved signal; save/dismiss feedback. |
| `bookmark add\|list\|show\|tag\|remove` | Save posts with tags (auto-suggested from analysis) and notes. |
| `learn generate\|today\|done\|show\|list` | Build 7-day Feynman learning tracks, get today's task, and check off progress. |
| `search <query>` | Full-text search (SQLite FTS5, BM25-ranked, stemmed) across analyses, takeaways, and bookmarks. |
| `import x-archive <path>` | Bulk-import your extracted official X archive: likes become bookmarked posts, your tweets become posts. Free, idempotent. |
| `digest [--days N]` | Markdown recap of analyses, takeaways, and bookmarks saved in the window (default 7 days). |
| `setup` / `config set\|get\|list\|unset\|path` | Collect and manage provider credentials and defaults. |
| `record get <id>` | Resolve any record by its prefixed id (`post_`, `ana_`, `acc_`, ...). |
| `db stats\|migrate\|vacuum\|reindex\|reset` | Inspect and maintain the database. |
| `manifest` | Emit a machine-readable description of the whole CLI. |

Global flags (valid on any command): `--json` (default), `--pretty`, `--quiet`,
`--db <path>`, `--config-dir <path>`.

Input flags accept inline text, `@path` to read a file, or `-` to read stdin:

```bash
echo "long post text..." | tenbrains analyze --provider mock --text -
tenbrains takeaway refresh levelsio --provider mock --posts @recent.json
```

## Learning objectives

Objectives are persistent learning goals, separate from loose bookmark tags. Each objective has a
name, derived slug, optional description, active/archived lifecycle, and tagged-record counts.
You can keep several active objectives while marking at most one as the current focus:

```bash
tenbrains objective add "Stablecoins" \
  --description "Understand reserve models, settlement, and failure modes." --focus
tenbrains objective add "AI agents"
tenbrains objective list
tenbrains objective show                 # defaults to the current focus
tenbrains objective focus ai-agents
tenbrains objective focus --clear
tenbrains objective link post_... --objective stablecoins
tenbrains objective unlink post_... --objective stablecoins
tenbrains objective archive stablecoins
```

Tag at creation time with a repeatable `--objective` flag:

```bash
tenbrains analyze --provider mock --text "..." \
  --objective stablecoins --objective ai-agents
tenbrains takeaway follow levelsio --objective ai-agents
tenbrains bookmark add --post-id post_... --objective stablecoins
tenbrains learn generate --analysis ana_... --objective stablecoins
```

`bookmark add` tags the bookmark's post. Without an explicit `--objective`, `learn generate` inherits
the objective tags on its source analysis' post; supplying the flag overrides that inheritance.
Every referenced objective must already exist or the command returns `NOT_FOUND` without silently
creating one. Focus never tags records automatically. `objective show` groups tagged posts,
accounts, bookmarks, and tracks; `record get` includes an `objectives` array for linkable records.

When a selected or inherited objective has a description, learning tracks rank concepts first by
deterministic token overlap with that description, then by the existing interest and familiarity
ratings. With multiple described objectives, a concept uses its highest overlap with any one
description; matches are not summed across objectives. `objective show` also returns descriptive
progress counts under `data.progress`:
accounts followed, posts and transcripts analyzed, bookmarks saved, tracks completed, and learning
days completed/total. It never fabricates a completion percentage.

## YouTube transcripts

Pass a public YouTube watch, `youtu.be`, Shorts, or embed URL to `analyze`. tenbrains selects a
caption track without an API key (manual before auto-generated; `--lang`, then English, then the
first available), stores the transcript and video metadata with the post, and runs the normal
analysis pipeline:

```bash
tenbrains analyze --url "https://youtu.be/M7lc1UVf-VE" --lang en
tenbrains analyze --url "https://youtu.be/M7lc1UVf-VE" --summarize --learn
tenbrains analyze --url "https://youtu.be/M7lc1UVf-VE" --transcript @captions.txt
```

`--summarize` returns `{ summary, keyPoints[] }` under `data.summary`, persists it in the post's
`raw` metadata, and uses that digest as the condensed input for concept extraction. It composes
with `--learn`. If a video is unavailable or has no captions, supply an existing transcript with
`--transcript <text|@file|->`. v1 is caption-only: it does not download audio or invoke Whisper.
YouTube's WEB caption URLs can return empty bodies, so the client retries through the embedded
Android player API; that undocumented client version is the primary maintenance surface.

## Configuration & credentials

There is **no `.env`**. The CLI owns credential collection:

- `tenbrains setup` collects a key interactively (TTY) or via `--api-key` / `--api-key -` (stdin).
- `tenbrains config set providers.openai.apiKey sk-...` sets any value directly.
- `--api-key` / `--provider` / `--model` override per invocation.

Values are written to a managed JSON file (`tenbrains config path` shows where) with `0600`
permissions. Secrets are redacted in `config get`/`config list` unless `--reveal` is passed.
Resolution precedence: CLI flag → config store. Environment variables are intentionally **not**
consulted, keeping the credential source explicit and auditable.

## Fetching from X

By default the agent supplies content via `--text`, but the CLI can also pull tweets itself —
designed **free-first**:

- **Single tweets (`analyze`)** use X's public **oEmbed** endpoint by default: no API key, no paid
  tier. `tenbrains analyze --url "https://x.com/user/status/123"` fetches the tweet text + author
  and analyzes it. Control this with `--fetch auto|oembed|api` (default `auto`).
- **Account timelines (`takeaway`)** have no free path, so they use the official X API v2 with a
  Bearer token: `tenbrains takeaway refresh <user> --count 20` (omit `--posts` to fetch). Most
  accounts need a **paid X API tier (Basic+)** to read timelines.
- **Threads (`analyze --thread`)** are analyzed as one document. Supply the parts yourself for free
  (`--thread '["part 1", "part 2"]'`, `@file`, or `-`), or pass bare `--thread` with `--url`/`--id`
  to fetch the author's self-thread via the API (Bearer token; recent search covers ~7 days).
- **Your own history (`import x-archive`)** needs no API at all: request your account archive at
  X → Settings → "Download an archive of your data", extract the zip, and run
  `tenbrains import x-archive <dir>`. Likes land as bookmarked posts (instant signal for
  `suggest generate`), your tweets as posts. Re-running dedupes on tweet id.

Store the token (used for timelines and as the `--fetch api` fallback) during setup or config:

```bash
tenbrains setup --provider anthropic --api-key sk-ant-... --x-bearer "AAAA..."   # both at once
tenbrains config set x.bearerToken "AAAA..."                                     # or just the X token
tenbrains analyze --url https://x.com/jack/status/20 --x-bearer -  < token.txt   # or per-call (stdin)
```

If your tier can't read a tweet/timeline, the CLI returns a structured `PROVIDER_UNAUTHORIZED` /
`PROVIDER_RATE_LIMITED` error (exit 5) rather than crashing — fall back to `--text` / `--posts`.

## Database

A single SQLite file (default `~/.local/share/tenbrains/tenbrains.db`, override with `--db`). Schema
is versioned and migrated automatically on open. Tables: `posts`, `analyses`, `accounts`,
`takeaway_snapshots`, `bookmarks`, `suggestions`, `learning_tracks`, `track_progress`, `objectives`,
and `objective_links`, plus a trigger-maintained FTS5 index (`search_fts`) behind `search` — rebuild
it anytime with `tenbrains db reindex`.

```bash
tenbrains --db ./research.db analyze --provider mock --text "..."   # isolate a workspace
tenbrains db stats
```

## Providers

Default is **Anthropic Claude**; `openai`, `google`, and `xai` are supported via `--provider`, and
`mock` runs offline. See `tenbrains manifest` for the live catalog and default models.

## Use as a Claude skill

This repo ships an [Agent Skill](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills)
in [`skill/`](skill/SKILL.md) so Claude (Claude Code, claude.ai, or the Agent SDK) can drive the CLI
on your behalf — analyze a post, summarize an account, recall saved research — using the JSON
contract above. The skill is thin: it points Claude at the CLI and at `tenbrains manifest` for live
discovery.

Install it for your own Claude Code (make the `tenbrains` command available first, then copy the
skill in):

```bash
npm link                                   # puts `tenbrains` on PATH
cp -r skill ~/.claude/skills/tenbrains     # personal skill, available in every project
# or, project-scoped:  cp -r skill .claude/skills/tenbrains
```

After installing, ask Claude something like "analyze this X post: …" and it will use the skill.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome
npm test            # node:test via tsx
npm run check       # all three
```

## License

MIT.
