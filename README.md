# tenbrains

An **agent-first** CLI for X research. It analyzes posts, tracks followed accounts, surfaces
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
- **Everything persisted.** Posts, analyses, takeaways, bookmarks, suggestions, and learning tracks
  all land in one local SQLite file you can point anywhere with `--db`.
- **Offline-capable.** The built-in `mock` provider produces deterministic analysis with no network,
  so agents and CI can exercise the full pipeline without API keys.

## Requirements

- Node.js **>= 24** (uses the built-in `node:sqlite` — no native modules to compile).

## Install

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
tenbrains setup --provider anthropic --api-key sk-ant-... --default

# 2. Analyze a post (agent supplies the content).
tenbrains analyze --author levelsio --id 1790000000000000000 \
  --text "Shipping an agent-first CLI today. Everything persists to SQLite, nothing in env files."

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
| `analyze` | Analyze a post into topic, summary, intent, 5 novel concepts. `--learn` also builds a track. |
| `analyze list` / `analyze get <id>` | Read stored analyses. |
| `takeaway follow\|unfollow\|list\|refresh\|show` | Track accounts; summarize supplied recent posts into snapshots. |
| `suggest generate\|list\|save\|dismiss\|add` | Rank un-saved posts against your saved signal; save/dismiss feedback. |
| `bookmark add\|list\|show\|tag\|remove` | Save posts with tags (auto-suggested from analysis) and notes. |
| `learn generate\|show\|list` | Build and review 7-day Feynman learning tracks. |
| `search <query>` | Keyword search across analyses, takeaways, and bookmarks. |
| `setup` / `config set\|get\|list\|unset\|path` | Collect and manage provider credentials and defaults. |
| `record get <id>` | Resolve any record by its prefixed id (`post_`, `ana_`, `acc_`, ...). |
| `db stats\|migrate\|vacuum\|reset` | Inspect and maintain the database. |
| `manifest` | Emit a machine-readable description of the whole CLI. |

Global flags (valid on any command): `--json` (default), `--pretty`, `--quiet`,
`--db <path>`, `--config-dir <path>`.

Input flags accept inline text, `@path` to read a file, or `-` to read stdin:

```bash
echo "long post text..." | tenbrains analyze --provider mock --text -
tenbrains takeaway refresh levelsio --provider mock --posts @recent.json
```

## Configuration & credentials

There is **no `.env`**. The CLI owns credential collection:

- `tenbrains setup` collects a key interactively (TTY) or via `--api-key` / `--api-key -` (stdin).
- `tenbrains config set providers.openai.apiKey sk-...` sets any value directly.
- `--api-key` / `--provider` / `--model` override per invocation.

Values are written to a managed JSON file (`tenbrains config path` shows where) with `0600`
permissions. Secrets are redacted in `config get`/`config list` unless `--reveal` is passed.
Resolution precedence: CLI flag → config store. Environment variables are intentionally **not**
consulted, keeping the credential source explicit and auditable.

## Database

A single SQLite file (default `~/.local/share/tenbrains/tenbrains.db`, override with `--db`). Schema
is versioned and migrated automatically on open. Tables: `posts`, `analyses`, `accounts`,
`takeaway_snapshots`, `bookmarks`, `suggestions`, `learning_tracks`.

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
