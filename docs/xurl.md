# xurl Setup and Safe Usage

This project uses `xurl` for X API operations and agent workflows.

## What is installed

- Codex skill: `xurl` (project scope)
- CLI binary: `xurl` (installed via Homebrew cask)

Verify:

```bash
npx skills list
xurl version
```

## Authentication (manual and safe)

Do authentication setup manually on your machine, outside agent sessions.

Required redirect URI in X Developer Portal:

```text
http://localhost:8080/callback
```

Recommended auth flow:

```bash
xurl auth oauth2
```

Check current auth state:

```bash
xurl auth status
```

## Security policy

- Never paste secrets in chat.
- Never run secret-bearing auth flags in agent sessions.
- Never use `-v` or `--verbose` in agent sessions.
- Never read or print `~/.xurl` in agent sessions.

Forbidden secret flags in agent sessions include:

- `--bearer-token`
- `--consumer-key`
- `--consumer-secret`
- `--access-token`
- `--token-secret`
- `--client-id`
- `--client-secret`

## Default commands

```bash
xurl whoami
xurl search "from:XDevelopers" -n 10
xurl post "Hello from xurl"
xurl /2/users/me
```

## npm shortcuts in this repo

```bash
npm run onboarding
npm run xurl:status
npm run xurl:whoami
npm run xurl:search
npm run xurl:analyze:auth
npm run xurl:analyze -- "https://x.com/user/status/1234567890"
```

Use onboarding first. It checks:

- `xurl` installed
- X OAuth2 auth available (and can run `xurl auth oauth2`)
- provider analyze auth available (and can run `npm run xurl:analyze:auth`)

Set up a provider once. Config now lives under `~/.config/tenbrains/ai-providers.json` and will read legacy provider state from `~/.config/rabbitbrain` when no Tenbrains config exists yet:

```bash
npm run xurl:analyze:auth
npm run xurl:analyze:auth -- --provider openai
npm run xurl:analyze:auth -- --provider anthropic
```

Then analyze tweets:

```bash
npm run xurl:analyze -- "https://x.com/user/status/1234567890"
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --provider google
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --provider xai --model grok-3-fast
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --choose-provider --choose-model
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --choose-model
npm run xurl:analyze -- "https://x.com/user/status/1234567890" --model gpt-4.1
```

Supported providers:

- `openai`
- `google` (Gemini)
- `xai` (Grok)
- `anthropic` (Claude)

Environment variable overrides are provider-specific:

- `OPENAI_API_KEY` / `OPENAI_MODEL`
- `GOOGLE_API_KEY` / `GOOGLE_MODEL`
- `XAI_API_KEY` / `XAI_MODEL`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`

## Expected behavior before auth

If authentication is not configured yet, `whoami` and `search` may fail with an auth error. That is expected until OAuth setup is complete.
