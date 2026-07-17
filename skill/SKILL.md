---
name: tenbrains
description: >-
  Do X/Twitter and YouTube research with the local `tenbrains` CLI and persist every result
  to a SQLite database. Analyze a post or video transcript into topic/summary/intent/key concepts,
  summarize a followed account's recent posts into takeaways, manage research
  bookmarks and ranked suggestions, manage first-class learning objectives,
  recall past analyses with search, and build a 7-day learning track from a post.
  Use this skill whenever the user wants to
  analyze a tweet or X post, research or summarize an X/Twitter account, save or
  recall X research, triage saved posts, or turn a post into a study plan — even
  if they don't say "tenbrains" explicitly. Do not use it for posting/replying
  on X or for unrelated non-X/non-YouTube content.
---

# tenbrains — agent-first X and YouTube research CLI

`tenbrains` analyzes X/Twitter content and YouTube transcripts with an AI provider and stores every
outcome (posts, analyses, account takeaways, bookmarks, suggestions, learning tracks, objectives)
in a local SQLite database.
It is built to be driven by an agent: each run prints one JSON object you can parse directly.

## Prerequisites

- **The `tenbrains` command must be available.** If `tenbrains --version` fails, it is a Node CLI
  (Node >= 24). Install it with `npm i -g tenbrains` (published on npm), or run `npm link` inside
  a clone of the project. As a fallback you can call the built entrypoint directly:
  `node <repo>/dist/bin/tenbrains.js`.
- **A provider for real analysis.** Configure a key once (stored in `~/.config/tenbrains/config.json`
  at mode 0600, never an env file): `tenbrains setup --provider anthropic --api-key sk-ant-...`.
  No key available? Add `--provider mock` to any analyzing command for deterministic, offline output
  — perfect for exercising the flow without network or credentials.
- **Optional X (Twitter) Bearer token.** Only needed to fetch *timelines* for `takeaway` (usually a
  paid X API tier). Fetching a *single* tweet for `analyze --url` is free via oEmbed and needs no
  token. Store one with `tenbrains setup --x-bearer <token>` or `tenbrains config set x.bearerToken <token>`.

## Output contract — read this first

Every run prints exactly one JSON object on **stdout**:

- Success: `{ "ok": true, "command": "...", "data": { ... }, "meta": { ... } }`
- Failure: `{ "ok": false, "command": "...", "error": { "code", "message", "retryable", "details" } }`

Parse stdout; **diagnostics and progress go to stderr**. Branch on `ok`, then on `error.code` (never
on message text). The process **exit code mirrors the failure class** (`0` ok, `2` usage, `3` not
found, `4` credentials, `5` provider, `6` validation, `7` conflict, `1` internal).

JSON is the default. Only add `--pretty` when a human will read the output. `meta` carries the ids you
chain on: `analysisId`, `postId`, `snapshotId`, `bookmarkId`, `suggestionId`, `trackId`.
Objective creation also returns `objectiveId` and its stable `slug`.

The complete envelope, code tables, command catalog, and input forms are in
[references/cli-contract.md](references/cli-contract.md). For the always-current machine spec, run
`tenbrains manifest` — it returns the full command tree, flags, providers, and codes as JSON, so
prefer it over guessing.

## Inputs

Text/JSON flags accept three forms, so you never fight shell quoting on large content:

- inline: `--text "the post"`
- a file: `--text @post.txt` / `--posts @recent.json`
- stdin: `--text -` (pipe content in)

## Core workflows

### Analyze a post

Provide the text, or let the CLI fetch a tweet by URL/id (free, via X's oEmbed — no key needed):

```bash
tenbrains analyze --author levelsio --id 1790000000000000000 --text "..."   # you supply text
tenbrains analyze --url "https://x.com/jack/status/20"                       # fetched free (oEmbed)
# data.analysis = { topic, summary, intent, novelConcepts[5] }; meta.analysisId, meta.postId, meta.source
```

`--fetch auto|oembed|api` controls fetching (default `auto`, free-first). Re-using the same `--id`
dedupes the stored post. Add `--learn` to also generate a 7-day Feynman learning track in the same
call (`--minutes`, `--ratings` optional).

### Analyze a YouTube video

Public captioned videos need no API key. `--summarize` and `--learn` can be used independently or
together. If captions are unavailable, use the manual transcript fallback:

```bash
tenbrains analyze --url "https://youtu.be/M7lc1UVf-VE" --lang en --summarize --learn
tenbrains analyze --url "https://youtu.be/M7lc1UVf-VE" --transcript @captions.txt
```

The result includes the usual `data.analysis`, optional `data.summary = { summary, keyPoints[] }`,
and optional `data.track`; `meta.source` is `youtube`. Do not add audio download or transcription
steps: this release is caption-only.

### Account takeaways

Supply the recent posts, or fetch them from X (needs a stored Bearer token and usually a paid X API
tier — single-tweet `analyze` above stays free).

```bash
tenbrains takeaway follow levelsio
tenbrains takeaway refresh levelsio --posts @recent.json   # supplied: [{ "text": "...", "externalId": "..." }, ...]
tenbrains takeaway refresh levelsio --count 20             # fetched from X (omit --posts)
tenbrains takeaway show levelsio --history
```

### Suggestions feedback loop

```bash
tenbrains suggest generate                 # ranks analyzed, un-bookmarked posts vs your saved signal
tenbrains suggest save sug_...             # materializes the suggestion as a bookmark
tenbrains suggest dismiss sug_...          # suppresses it in future ranking
```

### Daily learning loop

A track generated with `--learn` (or `learn generate`) is a 7-day plan you can coach the user
through, one session at a time:

```bash
tenbrains learn today                      # next pending day's task (latest active track)
tenbrains learn done trk_... --notes "..."  # check it off; meta.completed=true on the last day
```

`learn today` never skips content — it returns the first unfinished day, plus `behindBy` when the
calendar has moved ahead of the learner.

### Learning objectives

Objectives are first-class learning goals, separate from bookmark tags. Multiple objectives may be
active, with at most one current focus. Focus is only a default view and never tags content:

```bash
tenbrains objective add "Stablecoins" --description "Understand reserves and settlement." --focus
tenbrains objective list
tenbrains objective show                 # current focus
tenbrains objective focus ai-agents      # switch explicitly
tenbrains objective focus --clear
tenbrains objective archive stablecoins
```

Use the returned `obj_...` id or slug for later calls. At this core stage, the CLI manages objective
lifecycle and reports tagged counts; explicit record link/tagging commands are intentionally
separate follow-up surface. Never infer or auto-create objectives from content.

### Bookmarks and recall

```bash
tenbrains bookmark add --post-id post_... [--tags rag,agents]   # auto-tags from the analysis if omitted
tenbrains search "vector databases" --type analysis,bookmark
```

### Bulk-import the user's X history (free)

If the user has their official X account archive (Settings → "Download an archive of your data",
then extract the zip), import it in one shot — likes become bookmarked posts, which immediately
powers `suggest generate`:

```bash
tenbrains import x-archive ~/Downloads/twitter-archive
```

### Read anything back

```bash
tenbrains analyze list --limit 5
tenbrains record get <id>      # resolves any post_/ana_/acc_/snap_/bm_/sug_/trk_/obj_ id
tenbrains db stats             # row counts + schema version
```

## Conventions worth remembering

- **Ids are prefixed and stable** (`post_`, `ana_`, `acc_`, `snap_`, `bm_`, `sug_`, `trk_`, `obj_`); chain on
  the ids in `meta`, and resolve any of them with `tenbrains record get <id>`.
- **Isolate a workspace** with `--db ./scratch.db` so a task doesn't touch the default database.
- **No environment variables** are read for config or secrets — everything goes through
  `tenbrains setup` / `tenbrains config set`.
- **The `mock` provider is deterministic keyword extraction**, not real model judgement. Use it to
  test the data flow; use a configured provider (`anthropic` default, plus `openai`/`google`/`xai`)
  for real analysis.

## When this skill does not apply

Posting, replying, or DMing on X, and unrelated research outside X or YouTube. For those, use the
appropriate tool instead.
