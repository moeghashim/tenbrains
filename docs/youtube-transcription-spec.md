# Spec — YouTube transcription for tenbrains

**Status:** Draft for team review · **Owner:** @moeghashim · **Target:** tenbrains ≥ 2.2.0
**Shareable page:** deployed to Cloudflare Pages (see the repo PR for the live URL)

---

## 1. Summary

Let `tenbrains analyze` accept a YouTube URL, fetch the video's caption track for
free, and run the transcript through the **existing** analysis pipeline — the
same `{ topic, summary, intent, 5 concepts }` extraction, persistence, learning
tracks, search, and digest that already work for tweets. A transcript is treated
as one more kind of long-form content, not a new subsystem.

```bash
tenbrains analyze --url "https://youtube.com/watch?v=dQw4w9WgXcQ"
# → fetches captions, analyses the transcript, persists post + analysis
# meta.source = "youtube"; --learn, search, digest all work unchanged
```

## 2. Motivation

- Long-form video is a major research surface tenbrains can't touch today.
- The analysis pipeline is content-agnostic — topic/summary/intent/concepts
  apply to a transcript as cleanly as to a tweet or a thread.
- It costs almost nothing to add: the fetch problem has the same shape as the
  tweet-oEmbed path already in the codebase.

## 3. Goals / non-goals

**Goals**
- Fetch a public video's transcript with **no API key, no paid tier, no new runtime dependency**.
- Reuse the whole downstream pipeline (persist → `--learn` → `search` → `digest` → `suggest`).
- Fail with structured, machine-readable errors and a manual fallback — never crash.
- Pure, fixture-tested parsers so a YouTube markup change is a one-line fix.

**Non-goals (v1)**
- Audio-based transcription (Whisper / yt-dlp) for videos with no captions.
- Chapter/timestamp-aware segmentation or a raw-transcript viewer UI.
- Playlists / channel bulk import.
- Auto-translation of captions beyond selecting an available language track.

## 4. Design

### 4.1 Fetch — free-first caption scrape

Mirrors `src/x/client.ts` (the tweet oEmbed path): an undocumented-but-free
endpoint, pure parsers split from the network layer, structured errors.

1. `GET` the watch-page HTML.
2. Extract the `ytInitialPlayerResponse` JSON embedded in the page.
3. Read `captions.playerCaptionsTracklistRenderer.captionTracks[]` — each entry
   has a `baseUrl`, a language code, and a `kind` (`"asr"` = auto-generated vs a
   human/manual track).
4. `GET` the chosen track's `baseUrl` (timedtext XML / JSON3) and flatten it to
   plain text.

**Track selection:** prefer a manual track over ASR; prefer the requested
`--lang`, then English, then the first available.

**No new dependency.** This is `fetch` + regex/JSON parsing — the same toolkit
the oEmbed path already uses. We explicitly reject:
- `youtube-transcript` (npm) — fragile, redundant with ~150 lines of our own.
- `yt-dlp` — external binary; violates the "self-contained, no native modules" stance.
- YouTube Data API `captions.download` — requires the video owner's OAuth for
  most videos, the same dead end that makes X timelines a paid-tier feature.

### 4.2 Integration — extend `analyze`, no parallel command

A transcript is content, so it enters the pipeline you already have. `analyze`
detects a YouTube URL in `--url` and routes to the transcript fetcher, exactly
as `--thread` routes differently from a plain tweet.

| Field | Source |
|---|---|
| `post.text` | flattened transcript |
| `post.externalId` | `yt:<videoId>` (distinct prefix; dedupes re-runs, no collision with tweet ids) |
| `post.url` | canonical `https://www.youtube.com/watch?v=<id>` |
| `post.authorUsername` / `authorName` | channel |
| `post.postedAt` | upload date |
| `post.raw` | video metadata (channel, duration, caption lang, asr-vs-manual) → `posts.raw_json` |
| `meta.source` | `"youtube"` |

Everything after ingestion — `analyzePost`, persistence, `--learn`, `search`,
`digest`, `suggest` — runs **unchanged**.

### 4.3 Storage — no migration

Reuse `posts` + `analyses`. Video metadata rides in the existing `posts.raw_json`
column, so v1 ships **with no schema change** (currently v3). First-class
full-text search over raw transcripts (vs. their analyses) is a future migration,
not a v1 requirement.

### 4.4 Prompt — one generalizing tweak

The analyzer prompt is tweet-tuned (*"You are analyzing a post on X"*; the concept
field is `whyItMattersInTweet`). Pass an optional `kind: "tweet" | "transcript"`
into `analyzePost` and swap that one sentence to *"You are analyzing a video
transcript."* The output schema is untouched, so nothing downstream changes.

### 4.5 Errors & fallback (reuse the `PROVIDER_*` scaffolding)

| Condition | Error code | Exit |
|---|---|---|
| Video not found / deleted / no caption tracks at all | `NOT_FOUND` | 3 |
| Private / age-restricted / members-only / region-blocked | `PROVIDER_UNAUTHORIZED` | 5 |
| Rate limited | `PROVIDER_RATE_LIMITED` | 5 |
| Network / timeout | `PROVIDER_NETWORK` | 5 |
| Page markup changed, can't parse player response | `PROVIDER_BAD_OUTPUT` | 5 |

Every "no captions" path points the user at the manual escape hatch:
`analyze --transcript @file` (or `-`), which supplies a transcript directly and
also makes the whole feature testable offline with no network — mirroring
`--text` / `--thread`.

## 5. CLI surface

```
analyze --url <youtube-url>            # fetch + analyse a video's captions
analyze --url <url> --lang es          # prefer a caption language
analyze --transcript @file | -         # supply a transcript manually (no network)
analyze --url <url> --learn            # transcript → 7-day learning track (already works)
```

New flags: `--lang <code>` (caption language preference) and
`--transcript <text|@file|->`. `meta.source` gains `"youtube"`; the manifest
contract test is updated to document both.

## 6. Long transcripts

A 40-minute video is thousands of words vs. a 280-char tweet — real token cost.
v1 sends the transcript as-is (modern context windows absorb it) and emits a soft
length warning past a threshold. A `--summarize-first` pre-pass is an easy
follow-up, out of scope for v1.

## 7. Testing

- **Pure-parser unit tests with fixtures** (no network): `parseVideoRef` (watch /
  youtu.be / shorts / embed / bare id), `parsePlayerResponse` (captions present /
  absent, manual vs ASR), `parseTimedText` (XML + JSON3, entity decoding).
- **Offline command test** via `--transcript @file` exercising the full
  analyse → persist path — same style as the `--thread` and `import x-archive` tests.
- **One live smoke test** against a real video before merge.

Precedent: this is the same test shape as the thread feature (pure parsers +
one offline command test + a live smoke).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| YouTube changes watch-page markup → extraction breaks | Isolate in pure, fixture-tested parsers; breakage is a one-line fix + updated fixture. Same risk class as the existing oEmbed HTML parsing. |
| Video genuinely has no captions (no manual, no ASR) | Structured `NOT_FOUND` → `--transcript @file`. Audio transcription is explicitly deferred. |
| ToS / gray-area scraping | Same posture as the tweet oEmbed and archive paths — public captions for personal research; noted in docs. |
| Token cost on long transcripts | Soft warning in v1; `--summarize-first` later. |

## 9. Effort & rollout

Shape and size closely match the already-shipped thread feature:

- `src/youtube/client.ts` (~200 lines, pure parsers + orchestration)
- `analyze.ts` integration (~40 lines) + 2 schema lines + 1 prompt param
- fixture unit tests + one offline command test + live smoke
- docs: README, `skill/SKILL.md`, `skill/references/cli-contract.md`; manifest test update

One focused PR, through the existing branch → PR → CI (DCO + typecheck/lint/test) flow.
Version bump to **2.2.0** on merge.

## 10. Open decisions (for the team)

1. **Fold into `analyze` (recommended) vs. a dedicated `tenbrains youtube` command.**
   Folding in reuses everything and adds no surface; a separate command is only
   worth it if video-specific features (chapters, timestamps, a transcript viewer)
   are expected to grow.
2. **Caption-only v1 (recommended)**, with `--transcript @file` as the manual
   fallback — deferring audio/Whisper transcription entirely?
3. **npm version** — ship as a minor (2.2.0) since it's purely additive.
