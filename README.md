# Tenbrains

Tenbrains is an X research workspace for analyzing posts, importing bookmarks, tracking followed accounts, and surfacing suggested posts from your saved signal.

## Features

- Tweet analysis from X URLs/IDs via `xurl`
- Daily X bookmark sync in the web app:
  - Reads a signed-in user’s X bookmarks once per day
  - Imports only new bookmarked posts into Tenbrains
  - Applies suggested tags automatically, while keeping tags editable
- Suggested posts in the web app and API:
  - Recommends posts from followed creators
  - Uses subject/tag-based search
  - Uses takeaway themes as a light ranking signal
  - Supports save and dismiss feedback loops
- Account takeaways from followed X accounts:
  - Follow an account in the web app or CLI
  - Analyze the latest 20 posts into a concise summary plus bullet takeaways
  - Inspect the exact source posts behind each daily snapshot
  - Keep snapshot history per account
- OpenAI-powered extraction of:
  - Topic
  - Summary
  - Intent
  - 5 novel concepts from each tweet
- Interactive learning mode (`--learn`) that:
  - Collects concept familiarity and interest scores (1-5)
  - Prioritizes concepts by novelty and interest
  - Generates a 7-day Feynman learning track (10 min/day, Learn/Explain/Check)
- Model selection per run (`--model`, `--choose-model`)
- Onboarding helper for local setup (`npm run onboarding`)

## Requirements

- Node.js 20+
- `xurl` installed and authenticated for X API access
- OpenAI API key configured
- X OAuth app configured for web sign-in

## Setup

```bash
npm install
npm run onboarding
npm run xurl:analyze:auth
```

For the web app bookmark sync flow, the X OAuth app must request:

```text
users.read tweet.read bookmark.read offline.access
```

## Usage

Analyze a tweet:

```bash
npm run xurl:analyze -- "https://x.com/user/status/1234567890"
```

Analyze and generate a learning track:

```bash
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --learn
```

Choose a model interactively:

```bash
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --choose-model
```

Use a specific model:

```bash
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --model gpt-4.1
```

Follow an account for takeaway tracking:

```bash
npm run xurl:takeaway -- follow ctatedev
```

Refresh one account takeaway:

```bash
npm run xurl:takeaway -- refresh ctatedev
```

Refresh all followed account takeaways:

```bash
npm run xurl:takeaway -- refresh --all
```

Show the latest takeaway for an account:

```bash
npm run xurl:takeaway -- show ctatedev
```

Show full takeaway history for an account:

```bash
npm run xurl:takeaway -- show ctatedev --history
```

Inspect bookmark sync status or work with suggestions from the CLI:

```bash
TENBRAINS_AUTH_COOKIE='next-auth.session-token=...' npm run xurl:suggestions -- status
TENBRAINS_AUTH_COOKIE='next-auth.session-token=...' npm run xurl:suggestions -- list
TENBRAINS_AUTH_COOKIE='next-auth.session-token=...' npm run xurl:suggestions -- save <suggestion_id>
TENBRAINS_AUTH_COOKIE='next-auth.session-token=...' npm run xurl:suggestions -- dismiss <suggestion_id>
```

## Web App

- `/app/bookmarks` now shows imported X bookmarks with source labeling and suggested tags
- `/app/suggestions` is the workspace for ranked post recommendations
- `/app/takeaway` is the dedicated workspace for account takeaways
- Daily X bookmark imports are triggered by `/api/internal/bookmarks/sync`
- Daily account takeaway refreshes are triggered by `/api/internal/takeaways/refresh`

End-user workflow:

1. Sign in with X in the web app.
2. Tenbrains stores the X OAuth credentials needed for bookmark sync.
3. A daily cron imports new X bookmarks into `/app/bookmarks`.
4. Imported bookmarks arrive with suggested tags that can be edited later.
5. `/app/suggestions` recommends posts based on follows, bookmark patterns, and takeaway themes.
6. Saving or dismissing a suggestion immediately feeds back into future ranking.

## Development

```bash
npm run check
npm test
```

### Embeddings Backfill

After deploying the embeddings Convex functions, operators can backfill existing bookmarks, analyses, and takeaway snapshots manually. Start with a dry run; it reads Convex and reports planned work, but makes zero embedding API calls and zero writes.

```bash
NEXT_PUBLIC_CONVEX_URL="https://<deployment>.convex.cloud" \
CONVEX_DEPLOY_KEY="<deploy-key>" \
USER_SECRETS_ENCRYPTION_KEY="<secret-key>" \
PLATFORM_OPENAI_API_KEY="<optional-fallback-key>" \
node scripts/backfill-embeddings.mjs --dry-run --source=all
```

Run the migration without `--dry-run` after reviewing the summary:

```bash
NEXT_PUBLIC_CONVEX_URL="https://<deployment>.convex.cloud" \
CONVEX_DEPLOY_KEY="<deploy-key>" \
USER_SECRETS_ENCRYPTION_KEY="<secret-key>" \
PLATFORM_OPENAI_API_KEY="<optional-fallback-key>" \
node scripts/backfill-embeddings.mjs --source=all --batch-size=32
```

Useful scoped runs:

```bash
node scripts/backfill-embeddings.mjs --source=bookmark --user=<userId> --limit=100
node scripts/backfill-embeddings.mjs --source=analysis --batch-size=16
```

Flags:

- `--dry-run`: plan only; no embedding requests and no writes.
- `--source=bookmark|analysis|takeaway|all`: choose which source rows to inspect.
- `--user=<userId>`: restrict to one Convex user id.
- `--limit=<n>`: cap considered rows across selected sources.
- `--batch-size=<n>`: source rows per embedding request, capped at the service maximum of 96.

## Deployment Notes

- Web account takeaways and bookmark sync require the existing X API credentials plus a `CRON_SECRET` value for the internal scheduled routes
- `vercel.json` should register both `/api/internal/takeaways/refresh` and `/api/internal/bookmarks/sync` once per day
- Vercel invokes cron routes with `GET`; the internal routes also accept `POST` for manual server-side triggering
- Web bookmark sync also requires:
  - `AUTH_X_ID`
  - `AUTH_X_SECRET`
  - `AUTH_SECRET`
  - `USER_SECRETS_ENCRYPTION_KEY`
- CLI takeaway state is stored locally in the Tenbrains config directory alongside provider config. Legacy `~/.config/rabbitbrain` state and `RABBITBRAIN_*` env vars are still read as migration fallbacks.

Developer notes:

- Bookmark sync uses the signed-in user’s X OAuth token plus stored refresh token to read `/2/users/:id/bookmarks`.
- Imported bookmarks are deduplicated by post ID and persisted with source metadata.
- Suggested tags are generated deterministically from existing bookmark tags and subject follows, then stored as editable bookmark tags.
- Suggestions are built from:
  - followed creators’ recent posts
  - subject/tag-based recent search
  - recent takeaway themes with light ranking weight
- Suggestion save and dismiss actions write user feedback that immediately affects the next ranked suggestion set.

## Releases

Tenbrains uses Changesets and GitHub Releases.

```bash
npm run changeset
```

Maintainers merge changesets into `main`, and GitHub Actions versions the repo, publishes packages, deploys the web app, and attaches the extension zip to the GitHub Release from the resulting `main` push.

## Documentation

- xurl setup and safety notes: `docs/xurl.md`
- Release runbook: `docs/releases.md`
- Agent instructions: `AGENTS.md`

## License

MIT. See [LICENSE](./LICENSE).
