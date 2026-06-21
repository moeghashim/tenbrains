---
name: tenbrains
description: >-
  Do X/Twitter research with the local `tenbrains` CLI and persist every result
  to a SQLite database. Analyze a post into topic/summary/intent/key concepts,
  summarize a followed account's recent posts into takeaways, manage research
  bookmarks and ranked suggestions, recall past analyses with search, and build
  a 7-day learning track from a post. Use this skill whenever the user wants to
  analyze a tweet or X post, research or summarize an X/Twitter account, save or
  recall X research, triage saved posts, or turn a post into a study plan — even
  if they don't say "tenbrains" explicitly. Do not use it for posting/replying
  on X or for non-X content.
---

# tenbrains — agent-first X research CLI

`tenbrains` analyzes X/Twitter content with an AI provider and stores every outcome (posts,
analyses, account takeaways, bookmarks, suggestions, learning tracks) in a local SQLite database.
It is built to be driven by an agent: each run prints one JSON object you can parse directly.

## Prerequisites

- **The `tenbrains` command must be available.** If `tenbrains --version` fails, it is a Node CLI
  (Node >= 24). Install it by running `npm link` inside the project, or `npm i -g tenbrains` once
  published. As a fallback you can call the built entrypoint directly:
  `node <repo>/dist/bin/tenbrains.js`.
- **A provider for real analysis.** Configure a key once (stored in `~/.config/tenbrains/config.json`
  at mode 0600, never an env file): `tenbrains setup --provider anthropic --api-key sk-ant-...`.
  No key available? Add `--provider mock` to any analyzing command for deterministic, offline output
  — perfect for exercising the flow without network or credentials.

## Output contract — read this first

Every run prints exactly one JSON object on **stdout**:

- Success: `{ "ok": true, "command": "...", "data": { ... }, "meta": { ... } }`
- Failure: `{ "ok": false, "command": "...", "error": { "code", "message", "retryable", "details" } }`

Parse stdout; **diagnostics and progress go to stderr**. Branch on `ok`, then on `error.code` (never
on message text). The process **exit code mirrors the failure class** (`0` ok, `2` usage, `3` not
found, `4` credentials, `5` provider, `6` validation, `7` conflict, `1` internal).

JSON is the default. Only add `--pretty` when a human will read the output. `meta` carries the ids you
chain on: `analysisId`, `postId`, `snapshotId`, `bookmarkId`, `suggestionId`, `trackId`.

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

```bash
tenbrains analyze --author levelsio --id 1790000000000000000 \
  --text "Shipping an agent-first CLI today. Everything persists to SQLite, nothing in env files."
# data.analysis = { topic, summary, intent, novelConcepts[5] }; meta.analysisId, meta.postId
```

Re-using the same `--id` (the external X post id) dedupes the stored post. Add `--learn` to also
generate a 7-day Feynman learning track in the same call (`--minutes`, `--ratings` optional).

### Account takeaways (you supply the recent posts)

This CLI does not fetch from X — provide the posts you've already gathered.

```bash
tenbrains takeaway follow levelsio
tenbrains takeaway refresh levelsio --posts @recent.json   # [{ "text": "...", "externalId": "..." }, ...]
tenbrains takeaway show levelsio --history
```

### Suggestions feedback loop

```bash
tenbrains suggest generate                 # ranks analyzed, un-bookmarked posts vs your saved signal
tenbrains suggest save sug_...             # materializes the suggestion as a bookmark
tenbrains suggest dismiss sug_...          # suppresses it in future ranking
```

### Bookmarks and recall

```bash
tenbrains bookmark add --post-id post_... [--tags rag,agents]   # auto-tags from the analysis if omitted
tenbrains search "vector databases" --type analysis,bookmark
```

### Read anything back

```bash
tenbrains analyze list --limit 5
tenbrains record get <id>      # resolves any post_/ana_/acc_/snap_/bm_/sug_/trk_ id
tenbrains db stats             # row counts + schema version
```

## Conventions worth remembering

- **Ids are prefixed and stable** (`post_`, `ana_`, `acc_`, `snap_`, `bm_`, `sug_`, `trk_`); chain on
  the ids in `meta`, and resolve any of them with `tenbrains record get <id>`.
- **Isolate a workspace** with `--db ./scratch.db` so a task doesn't touch the default database.
- **No environment variables** are read for config or secrets — everything goes through
  `tenbrains setup` / `tenbrains config set`.
- **The `mock` provider is deterministic keyword extraction**, not real model judgement. Use it to
  test the data flow; use a configured provider (`anthropic` default, plus `openai`/`google`/`xai`)
  for real analysis.

## When this skill does not apply

Posting, replying, or DMing on X; fetching live tweets (the agent supplies the content); and any
non-X research. For those, use the appropriate tool instead.
