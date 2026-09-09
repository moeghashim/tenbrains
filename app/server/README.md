# Ten Brains local API

Use Node 22. From `app/`, run:

```sh
npm run server
```

The Express API listens on `http://localhost:5174`. Vite proxies `/api` to that port. Discovery documents persist as JSON under `server/data/`.

## Wayfinder providers

Mock mode needs no key and stays deterministic:

```sh
WAYFINDER_PROVIDER=mock npm run server
```

Create the gitignored `server/.env` file for provider settings. Global selection accepts `mock`, `anthropic`, `openai`, `claude-subscription`, `codex-subscription`, or `grok-subscription`:

```dotenv
WAYFINDER_PROVIDER=anthropic
ANTHROPIC_API_KEY=<paste key here>
WAYFINDER_MODEL=claude-sonnet-5
```

When `WAYFINDER_PROVIDER` is unset, selection priority is Anthropic key, OpenAI key, then mock. An explicit provider always wins. Shell environment values override matching values in `server/.env`.

Use any OpenAI-compatible chat-completions endpoint with these settings:

```dotenv
WAYFINDER_PROVIDER=openai
OPENAI_API_KEY=<paste key here>
WAYFINDER_OPENAI_BASE_URL=https://api.openai.com/v1
WAYFINDER_MODEL=gpt-5.6-luna
```

`WAYFINDER_OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. Change it for OpenRouter, Ollama, or another compatible endpoint.

Intake and Grilling sessions can select providers and models independently with `WAYFINDER_INTAKE_PROVIDER`, `WAYFINDER_INTAKE_MODEL`, `WAYFINDER_SESSION_PROVIDER`, and `WAYFINDER_SESSION_MODEL`. Surface settings fall back to the global provider and model.

Use this exact mixed-provider recipe to keep intake in deterministic mock mode and run Grilling sessions on GPT-5.6 Luna:

```dotenv
WAYFINDER_PROVIDER=mock
OPENAI_API_KEY=<paste key here>
WAYFINDER_SESSION_PROVIDER=openai
WAYFINDER_SESSION_MODEL=gpt-5.6-luna
```

All providers use the same SSE and staging contracts. Intake messages append transcript entries and staged candidates only.

Discovery persistence uses these endpoints:

- `GET /api/discoveries` lists discoveries with server-derived map counts and clarity.
- `GET /api/discoveries/:id` reads one full discovery document.
- `POST /api/discoveries` creates a discovery.
- `PATCH /api/discoveries/:id` renames or archives a discovery.

Deletion is intentionally unavailable to avoid destructive surprises while the data model is still settling.

Grilling sessions use these endpoints:

- `POST /api/discoveries/:id/sessions` creates a standalone session or starts one from an approved Grilling ticket.
- `POST /api/discoveries/:id/sessions/:sid/messages` streams `token`, `candidate`, `inquiry`, optional `choices`, `done`, and `error` events.
- `POST /api/discoveries/:id/sessions/:sid/evidence` captures a marked transcript moment.
- `POST /api/discoveries/:id/sessions/:sid/updates/approve` applies selected session candidates.

Only the intake and session approval endpoints mutate the map. Provider turns only stage reviewable candidates.

## Prototype sessions (Phase 8)

Use `POST /api/discoveries/:id/sessions` with an approved `Prototype` ticket's
`ticketId` (type inferred), or explicit `type: "prototype"`. Explicit type may
include `ticketId`, or objective/evidenceTarget for a standalone session. As with
Research, creation returns a greeting and the first streamed message starts the
opening turn. All four ticket types now have server session flows.

A Prototype plan must target the session's **existing approved Prototype ticket**.
A standalone session without a ticket can discuss/report results, but cannot stage
a plan: Wayfinder asks You to select a ticket instead of inventing or creating one.
Create the ticket-linked session to plan against it. Type/ticket mismatches and
missing supplied ticket IDs return HTTP 400.

On opening, optional `stage_prototype({candidates})` proposes one candidate:

```json
{
  "id":"ticket-plan-example",
  "type":"ticket-plan",
  "stagedAfter":"turn 2",
  "ticketId":"existing-prototype-ticket-id",
  "criteria":["Sort one receipt without repeating a step."],
  "checklist":["Build one sorting path.","Run one receipt through it."]
}
```

`criteria` and `checklist` must each contain 1–8 nonblank short strings, at most
20 words/240 characters per item, without control characters or exclamation marks.
The prompt requires observable criteria, imperative checklist actions, and plain
`voice.md` language. Only one plan is accepted per turn, targeting the linked ticket.
Unknown types, missing/non-Prototype/other-session ticket targets, malformed arrays,
and invalid citations are dropped. Repeated tool calls or malformed JSON leave a
plain reply. Plan content participates in the existing content-hash staging dedupe.

The plan emits a normal `candidate` event and remains staged. Only
`POST /api/discoveries/:id/sessions/:sid/updates/approve` with selected candidate IDs
attaches `{criteria, checklist}` to the map ticket's **`plan`** field. GET discovery
then exposes `map.openFrontier[].plan`; other ticket fields and map sections stay
unchanged. Approval revalidates the target and plan. A later approved revised plan
replaces that field; discussions and unapproved revisions cannot change it.

You build outside Ten Brains, then send a result using the **same `isFinding:true`
message contract as Research**. The server stores the exact report and source You
entry before inference, emits `evidence` first, and preserves them even on provider
failure. Ordinary chat does not become evidence. Reports are mirrored to discovery
evidence with a `Prototype session:` source label for later Synthesis.

After a report, Wayfinder asks one probing question, optionally offers choice chips,
and may stage `closed-decision` candidates citing that captured evidence ID. No
plan is accepted on a report turn. Later chat candidates may cite existing session
evidence; report-turn candidates must cite the current report. All Closed Decisions
still require explicit approval and retain only validated session citations.
Wayfinder never claims to build externally or turns model-written facts into evidence.

Mock Prototype derives a deterministic minimal plan from the objective, avoids
repeating a staged/approved plan, and grills captured reports with grounded candidate
citations. All five real transports use the Prototype prompt and optional tool;
intake, Grilling, Synthesis, and Research provider contracts remain separate.

## Research sessions (Phase 8)

Create a session from an approved `Research` ticket's `ticketId`, or pass
`{"type":"research","objective":"Examine recorded examples","evidenceTarget":"Two sources"}`
to `POST /api/discoveries/:id/sessions`. Type/ticket mismatches return HTTP 400.
The creation response contains the greeting; **the first streamed message turn**
structures the objective into 2–4 concrete questions. Send an opening message to
`POST /api/discoveries/:id/sessions/:sid/messages` to begin that turn.

Research uses the existing `inquiry` SSE event (`{question}`) for each suggested
question. Questions persist in `session.lineOfInquiry` with `status: "suggested"`,
never as map candidates. Once inquiries exist, follow-up turns preserve them.
Malformed question output silently leaves the ordinary reply and an empty inquiry
list; a later turn may retry structuring. No model call runs during session creation.

You investigate outside Ten Brains; Wayfinder structures the research and examines
findings. A regular message is chat, not evidence. To capture a finding:

```json
{"message":"  Exact pasted finding.\r\nKeep this spacing.  ","isFinding":true}
```

Only literal boolean `true` on a **Research or Prototype** turn enables capture. The server
checks that the message is nonblank but preserves its exact decoded string,
including outer whitespace, newlines, and Unicode, in both the You entry and
evidence `text`. It creates `id`, `sourceTurn` (the You entry ID), `sessionId`, and
`createdAt`; persists that You entry and the evidence in both `session.evidence`
and discovery evidence **before calling the provider**; and emits an additive
`evidence` SSE event containing that record before any reply tokens. Ignore the
new event if only rendering conversation, then refresh the discovery as usual.

Capture is Your action, not provider output: even a failed provider turn leaves
the finding and source entry saved, without a duplicated You entry on success.
An `error` event does not undo capture. To retry inference without capturing again,
send a normal chat turn (`isFinding` omitted/false), rather than resubmitting the
same finding flag. Ordinary chat and model claims never automatically become
evidence; manual Grilling capture behavior is unchanged.

Every real transport receives the objective/ticket, map, existing session evidence,
Line of Inquiry, and current `findingId` through optional `stage_research`:

- `questions`: optional array of 2–4 short question strings for opening inquiries.
- `candidates`: optional `closed-decision` or `fog-retirement` items using the
  Synthesis fields below. **Both types require nonempty `evidence` citations**
  to existing evidence in this Research session; a finding turn must cite its
  newly captured finding. Retirements must identify an existing map fog question.

Unknown types, invented/out-of-session citations, malformed arguments, and repeated
tool calls silently degrade to a plain reply. Valid candidates emit existing
`candidate` events and remain staged. Approval revalidates citations, preserves
exact cited IDs, and is still the only path that changes the map or retires fog.
Choices retain their existing ordering and picked-label metadata.

Mock Research deterministically derives three questions from the objective and
candidates from actual captured findings. Its conservative retirement heuristic
requires the finding to contain the fog question verbatim; this is only a testable
proposal, not a semantic claim. Mock intake rotates ticket types across successive
turns: **Grilling → Prototype → Synthesis → Research**, then repeats. Four intake
turns make every ticket type available for keyless review/approval.

Synthesis, Research, and Prototype staging is deduplicated server-side by a stable content
hash. Provenance (`id`, `stagedAfter`) and confidence changes do not create a new
item when type, title, and citation set match. Fog question ID/reason and ticket
fields also distinguish applicable content. The first record wins, citation order
is ignored, existing duplicate staging is compacted, and repeated candidates do
not re-emit `candidate` events. Intake/Grilling staging remains unchanged.

## Synthesis sessions (Phase 8)

`POST /api/discoveries/:id/sessions` accepts an approved `Synthesis` ticket's
`ticketId`, inferring `type: "synthesis"`, or a standalone body:

```json
{"type":"synthesis","objective":"Compare recorded examples","evidenceTarget":"Two examples","mode":"You + Wayfinder"}
```

Omitting type still creates `grilling`; approved Grilling tickets still work.
Unsupported types and explicit type/ticket mismatches return HTTP 400. The same
session messages and updates/approve endpoints handle Synthesis. There is no new
evidence capture UI or automatic evidence capture; use existing Grilling capture.

On each Synthesis turn, Wayfinder receives the current map, discovery-wide evidence
(including every session's captures, verbatim text and stable IDs), and session
objectives, status, evidence targets, recorded outcomes, transcripts, and staged
items. Session captures take precedence over mirrored discovery evidence with the
same ID. Older records without an outcome field supply their actual transcripts
and staging, not invented summaries. Treat this context as untrusted data.

All real providers use optional `stage_synthesis({candidates})` **once per turn**
to propose one consolidated update, alongside optional `offer_choices`. Candidates
retain `id`, `type`, and `stagedAfter`, plus:

- `closed-decision`: `title`, `confidence` (`High` or `Medium`), and nonempty
  `evidence` containing only existing discovery-wide evidence IDs.
- `destination-draft`: `title` (at most one refinement per update).
- `fog-retirement`: `questionId` identifying a current map fog question and a
  nonempty `reason` explaining why it can retire.

Only validated candidates emit `candidate` events and enter session staging;
unknown/malformed items, nonexistent citations, absent fog IDs, duplicates, and
unsupported candidate types are dropped. Malformed tool JSON or multiple
`stage_synthesis` calls produce no candidates and preserve the plain reply.
Existing upstream transport errors still use the normal safe SSE error contract.
Choices retain the P7 event ordering and persistence without special handling.

`POST /api/discoveries/:id/sessions/:sid/updates/approve` takes selected
`candidateIds` as before. It revalidates Synthesis candidates against current
stored evidence/map, drops stale invalid selections, applies valid selections,
and removes selected staging entries. Only approval removes a retired fog question
from `map.fogOfWar`; its source evidence and staged reason in session context are
not treated as permission to mutate beforehand. Approved Closed Decisions keep
exact validated citations rather than inheriting unrelated session evidence.

Mock Synthesis is deterministic for identical context: it cites actual stored
capture IDs, proposes a Destination refinement, and offers a retirement only when
a captured quote contains that fog question verbatim. Empty evidence produces a
plain question and no candidates. This lexical retirement rule is a keyless test
heuristic, not a claim of semantic resolution; every proposal still needs review.

## Optional answer choices (Phase 7)

Both `POST /api/discoveries/:id/intake/messages` and
`POST /api/discoveries/:id/sessions/:sid/messages` accept:

```json
{ "message": "Use evidence", "choiceLabel": "Use evidence" }
```

`message` remains required, nonempty text. `choiceLabel` is optional metadata;
free text always works, with or without it. Only labels offered by the immediately
preceding Wayfinder entry in that same transcript count as picks. An explicit
matching `choiceLabel` takes precedence (so a chip can accompany edited text),
otherwise the server matches `message` against offered labels. Matching trims
outer whitespace and is case-sensitive. Invalid, stale, or unoffered metadata is
ignored, never a request error. A picked label persists on the You entry as
`choiceLabel`; no pick means the field is absent.

A successful turn may emit **one** additive event, after all reply tokens and
candidate/inquiry callbacks, immediately before `done`, after persistence:

```text
event: choices
data: {"choices":[{"label":"Use evidence","detail":"Start with one recorded example.","recommended":true},{"label":"Try another example","recommended":false}]}
```

The payload contains 1–4 choices. Every option has a nonempty label (at most
8 whitespace-separated words and 120 characters), an optional nonempty short
sentence `detail` (at most 20 words and 240 characters), and a required boolean
`recommended`. Exactly one recommendation is true. Duplicate labels and control
characters are rejected. Providers are instructed to use plain sentence-case
`voice.md` language, canonical vocabulary, and no additional actors or hedging.
The server enforces structural/length constraints; it does not attempt to judge
all natural-language voice rules.

The same array persists as `choices` on the Wayfinder transcript entry, including
`done.message.choices` and subsequent discovery reads. No offer means no event and
no transcript field. Existing `token`, `candidate`, `inquiry`, `done`, and `error`
payloads retain their fields; clients may ignore `choices` and still assemble the
reply, receive staged items, and finish on `done` as before.

All real transports expose optional `offer_choices({choices})` alongside existing
tools: Anthropic Messages, OpenAI-compatible Chat Completions, Claude subscription,
Codex Responses subscription, and Grok subscription. Absent, duplicate tool calls,
malformed JSON, or invalid offers silently omit choices; they never invent options
or turn optional-output failure into an SSE error. Candidate/provider failures
retain their existing error behavior. Mock offers deterministic question-specific
choices on every generated intake/Grilling reply; initial greetings stay unchanged.
Picking a choice is conversational input only, **not approval or a map write**.

## Subscription credentials and login

From `app/`, with Node 22 first on PATH:

```sh
export PATH="$HOME/.nvm/versions/node/v22.16.0/bin:$PATH"
npm run auth -- status
npm run auth -- login claude-subscription
npm run auth -- login codex-subscription
npm run auth -- login grok-subscription
```

`login` **prints instructions only**. It does not execute a shell, collect tokens, start OAuth, or launch a browser. Run the printed command yourself:

| Provider | Login command | Credential source | Default model / transport |
| --- | --- | --- | --- |
| `claude-subscription` | `claude auth login --claudeai` | `~/.claude/.credentials.json`, `claudeAiOauth` | `claude-sonnet-5`; Anthropic Messages with Bearer OAuth and `anthropic-beta: oauth-2025-04-20` |
| `codex-subscription` | `codex login` | `~/.codex/auth.json`, `tokens` | `gpt-6-astra`; ChatGPT Codex Responses, **not** the metered OpenAI API |
| `grok-subscription` | `grok login` | `~/.grok/auth.json` | `grok-build`; CLI chat proxy with `X-XAI-Token-Auth` and model-override headers |

The installed Grok CLI documents direct proxy access in its README. Its current credential store uses an `https://auth.x.ai::<client>` entry with `key`, `refresh_token`, `expires_at`, and OIDC metadata; the older `https://accounts.x.ai/sign-in` entry is also recognized. Multiple matching accounts are intentionally refused rather than guessed. Other issuers/custom credential helpers are not executed. Grok OIDC refresh only uses the trusted `https://auth.x.ai` discovery/token endpoints; legacy session credentials without refresh material require `grok login`.

Claude uses `accessToken`, `refreshToken`, and millisecond `expiresAt`; Codex uses `access_token`, `refresh_token`, `account_id`, and the JWT `exp` claim when present. JWT decoding is expiry metadata only, not signature verification. Keychain-only CLI credentials are not extracted; file absence reports `needs-login`. API-key-only Codex login is not treated as ChatGPT subscription login.

Status inspection is offline and read-only: `available` means an unexpired local token exists, **not** that the remote service or chosen model has accepted it. Unknown expiry is reported explicitly. Missing, unreadable, malformed, expired, or unsupported account files produce bounded reasons without token material. Source paths are displayed as fixed home-relative paths, never arbitrary credential-file contents or account identifiers.

On a turn, expiring access tokens are refreshed when supported material exists. Refresh requests have timeouts, reject redirects, and concurrent refreshes are coalesced. Refreshed access/refresh tokens stay **in process memory only**: Ten Brains never writes credential files, overwrites CLI-owned credentials, or stores credentials in its repo/config/discovery documents. **Limitation:** rotating refresh tokens can leave the CLI's disk copy stale after a restart; run the provider's login again if that happens. Do not concurrently refresh the same CLI account in several processes. Status does not refresh or call a remote service.

Status and turns share the credential loader, in-memory refresh cache, and validity rules. `available` confirms local validity only: remote model eligibility and quota are not verified. A valid token without refresh material remains usable inside the 30-second proactive refresh window. Authentication failures (missing/expired credentials, rejected refresh, or HTTP 401) end the SSE stream with a safe login instruction; HTTP 400/404 model/request failures, 403 access denial, 429 rate limits, and network failures instead return distinct safe settings/retry instructions. Upstream bodies are never forwarded. The Codex default is `gpt-6-astra` (`gpt-5.4-mini` was dropped upstream); account eligibility varies, and explicit saved model overrides are preserved (reselect without a model to reset to the default). Subscription adapters disable SDK logging. Remote eligibility, subscription limits, and provider terms still apply; third-party subscription OAuth is not guaranteed supported. This is a local personal-use integration, not deployment authentication. No real inference or token-refresh smoke is performed by the automated suite; HTTP/SSE tests launch the real server with fixture credential homes and a network-intercepting preload, exercising valid tokens, expired-token refresh/cache reuse, missing login, and honest upstream failures for both Claude and Codex.

## Provider settings API

`GET /api/providers` returns:

```json
{
  "routing": {
    "intake": { "provider": "mock", "model": "mock" },
    "sessions": { "provider": "codex-subscription", "model": "gpt-6-astra" }
  },
  "providers": [
    { "id": "mock", "status": "available", "reason": "Deterministic local provider; no login required." },
    {
      "id": "codex-subscription", "status": "needs-login",
      "reason": "Credential file not found.", "source": ".codex/auth.json",
      "found": false, "expiresAt": null, "loginCommand": "codex login"
    }
  ]
}
```

The actual `providers` array includes all six ids. Status uses `available` or `needs-login`; `unsupported` is reserved for providers without a supported transport (all three installed CLIs have a supported file format here). Subscription rows expose safe login instructions for Stage 2; there is deliberately no browser-launch/login API endpoint. API-key rows need their environment key rather than a subscription sign-in.

`PATCH /api/providers` accepts one or both surfaces (the API name is **`sessions`**, while its environment prefix is **`SESSION`**):

```json
{
  "intake": { "provider": "mock" },
  "sessions": { "provider": "codex-subscription", "model": "gpt-6-astra" }
}
```

A surface update requires a provider; omitted model resets to that provider's default. Unknown surfaces, providers, extra fields, and invalid model identifiers return generic HTTP 400 errors without echoing input. Model ids are bounded identifiers, not arbitrary text. Updates apply on the next turn and persist atomically in gitignored `server/provider-config.local.json`; temporary files are also ignored. Concurrent updates are serialized. Missing/corrupt config falls back to environment/defaults.

Precedence, independently for provider and model:

1. Surface environment variable (`WAYFINDER_INTAKE_*` or `WAYFINDER_SESSION_*`).
2. Global environment variable (`WAYFINDER_PROVIDER` / `WAYFINDER_MODEL`).
3. Saved surface selection.
4. Existing automatic provider selection (Anthropic key, OpenAI key, mock) and provider-default model.

Shell environment continues to override matching `server/.env` entries. Empty values are treated as unset by the settings API. PATCH saves a preference even when environment overrides it; the response always shows **effective** routing. Remove the overriding environment value and restart to use a saved preference. No API keys, tokens, or credentials are accepted by PATCH.

## Tests and isolation

```sh
npm test
npm run build
```

`WAYFINDER_AUTH_HOME` redirects all three credential paths to a fixture home. `WAYFINDER_CONFIG_PATH` redirects the selection file; `TEN_BRAINS_DATA_DIR` redirects discovery storage. API tests set all three to temporary directories and never read real CLI credential files or use `server/data`. Tests cover unchanged mock workflow, routing, provider detection, redaction, malformed/missing auth, refresh caching, selection persistence, environment precedence, and safe subscription SSE failures. Tests use fake secrets only and never perform provider login.
