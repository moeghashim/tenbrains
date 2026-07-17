# Spec — Learning objectives for tenbrains

**Status:** Draft for team review · **Owner:** @moeghashim · **Target:** tenbrains ≥ 2.3.0
**Locked decisions:** first-class & separate from bookmark tags · multiple objectives with one
optional *current focus* · manual tagging (no auto-suggest).

---

## 1. Summary

Add a persistent, first-class **objective** — a stated learning goal like
"Stablecoins" — that any record can be tagged with: a followed account, an
analyzed post, a YouTube transcript, a bookmark, a learning track. An objective
becomes an organizing lens across the whole tool: everything you gather *toward*
a goal is linked to it, untagged material stays "general," and progress
accumulates per objective instead of being scattered across one-off tracks.

```bash
tenbrains objective add "Stablecoins" --focus
tenbrains takeaway follow maker --objective stablecoins     # I follow them to learn this
tenbrains analyze --url "https://youtu.be/…" --objective stablecoins --learn
tenbrains objective show stablecoins    # every tagged account/post/track + progress
```

## 2. Motivation

- Today a learning track is built from **one** post's concepts and stands alone.
  There's no way to say "these ten posts, two accounts, and three videos are all
  me working toward understanding stablecoins."
- A goal is a natural spine for the tool: it ties `follow`, `analyze` (X +
  YouTube), `bookmark`, and `learn` together and gives `suggest`/`digest` a
  direction to point at.
- It's the difference between a pile of analyses and a **curriculum**.

## 3. Goals / non-goals

**Goals**
- A first-class `objectives` entity, distinct from bookmark tags.
- Tag accounts, posts (X/thread/YouTube), bookmarks, and tracks with one or more
  objectives, manually and explicitly.
- Hold **multiple** objectives at once, with one optional **current focus**.
- `objective show <slug>` lists everything tagged to a goal and reports progress.
- Everything local, deterministic, persisted — same ethos as the rest of the CLI.

**In scope (the complete feature)** — the objective as a full organizing lens:
tag records, build learning toward a goal, and let `suggest`/`digest`/`search`
point at it. Delivered as a sequence of review-sized PRs (§8), not staged
releases — it all ships as one feature at 2.3.0.

**Non-goals**
- Auto-suggesting an objective from content relevance (manual tagging only —
  locked decision). A later, separate feature could add it.
- Sharing/export of objectives; cross-objective analytics.

## 4. Concept & model

### 4.1 First-class, separate from bookmark tags — and why

Bookmarks already carry free-text `tags` for loose labeling ("rag", "agents").
Objectives are **not** tags: they carry *goal semantics* a tag can't —
a description, an active/archived lifecycle, a "current focus", tagged records of
mixed type (accounts *and* posts *and* tracks), and progress. Building objectives
on top of the tag system would blur "a loose label" with "a thing I'm working
toward." They coexist: tags stay for labeling, objectives are for direction.

### 4.2 Multiple objectives, one current focus

You can pursue several goals at once (Stablecoins *and* AI agents). Any number of
objectives exist; **at most one** is marked the *current focus*. Focus is a
convenience, not a trap:

- It's the default target of `objective show` (no argument).
- It's the bias target for `suggest`/`digest` (delivered in a later PR, §8).
- **It does not auto-tag anything.** Tagging is always explicit via `--objective`.
  Untagged records are "general" by design — that's the whole point of the
  distinction the user drew.

### 4.3 Manual tagging

Objectives are attached explicitly with `--objective <slug>` (repeatable) at
create time, or with `objective link` after the fact. Inferring a likely
objective from content is out of scope — a possible separate feature later.

## 5. Data model (migration v4)

Schema is at v3 today (YouTube added none); objectives add **v4**.

```sql
CREATE TABLE objectives (
  id          TEXT PRIMARY KEY,      -- obj_<sortable>
  slug        TEXT NOT NULL UNIQUE,  -- kebab handle used by --objective
  name        TEXT NOT NULL,         -- "Stablecoins"
  description TEXT,                  -- fuller statement of the goal (feeds learn/suggest relevance)
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  is_focus    INTEGER NOT NULL DEFAULT 0,      -- at most one row = 1 (enforced in app layer)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE objective_links (
  objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  record_type  TEXT NOT NULL,        -- 'post' | 'account' | 'bookmark' | 'track'
  record_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (objective_id, record_type, record_id)
);
CREATE INDEX idx_objlinks_record ON objective_links(record_type, record_id);
```

Polymorphic many-to-many: a post can serve two objectives; an objective spans
record types. The reverse index makes "what objectives is this record tagged
with?" a single lookup for `record get`. New id prefix: `obj_`.

## 6. CLI surface

### 6.1 Manage objectives

```
objective add <name> [--description <text>] [--focus]   # create; derives the slug
objective list [--status active|archived|all]           # objectives + tagged counts + focus marker
objective show [<slug>]                                  # detail + tagged records + progress (defaults to focus)
objective focus <slug> | --clear                         # set / clear the current focus
objective archive <slug>                                 # lifecycle: hide from default lists, keep links
objective link   --objective <slug> <recordId>          # tag an existing record (post_/acc_/bm_/trk_)
objective unlink --objective <slug> <recordId>          # untag
```

### 6.2 Tag at creation time — `--objective <slug>` (repeatable)

```
analyze … --objective stablecoins                 # tag the resulting post (X/thread/YouTube/text)
takeaway follow <user> --objective stablecoins     # tag the account
bookmark add … --objective stablecoins             # tag the bookmark's post
learn generate --objective stablecoins             # the track belongs to the objective
```

- Unknown slug → structured `NOT_FOUND` pointing at `objective add` (it does **not**
  auto-create, to avoid typo-objectives — see §11).
- `learn` inherits the objective from its source analysis' post when tagged, so a
  track built from a tagged video is linked automatically; `--objective` overrides.
- Tagging commands add `meta.objectives: ["stablecoins", …]` to their envelope.

### 6.3 `objective show` output

Groups tagged records by type and reports descriptive **counts** (not a fabricated
percentage): accounts followed, posts/transcripts analyzed, bookmarks, learning
tracks and their day-completion. This is the "how far along am I on stablecoins?"
view.

## 7. Impact map (the blast radius, now decided)

| Surface | Change |
|---|---|
| **Data model** | `objectives` + `objective_links` tables; `obj_` id; migration v4. |
| **New `objective` cmd** | add / list / show / focus / archive / link / unlink. |
| **`analyze`** (X, thread, YouTube, text) | `--objective` tags the post — one flag covers every source because they all route through `analyze`. |
| **`takeaway follow`** | `--objective` tags the account. |
| **`bookmark add`** | `--objective` tags the post. |
| **`learn generate` / `analyze --learn`** | Track tagged to the objective (explicit or inherited); counts toward its progress. |
| **`record get`** | Shows a record's objective tags. |
| **`manifest` + contract test** | New command, flags, id prefix, error rows documented. |
| **`suggest` / `digest` / `search`** | Bias/filter by objective (delivered in the final PR). |

## 8. Delivery — one feature, four PRs

The complete feature ships as one release (**2.3.0**), built as a sequence of
review-sized PRs. Each is independently CI-green and builds on the last; Codex
opens one, hands a review prompt back to Claude for sign-off, then proceeds to
the next.

| PR | Scope | Leaves the tool able to… |
|---|---|---|
| **1 — core** | `objectives` + `objective_links` tables (migration v4), repository, `obj_` id, `objective add/list/show/focus/archive`, `record get` shows tags | create, focus, and inspect objectives |
| **2 — tagging** | `objective link/unlink` + `--objective` on `analyze`/`takeaway follow`/`bookmark add`/`learn` (learn inherits from a tagged post) | attach records to a goal; `objective show` lists them |
| **3 — learn lens** | reweight learn-track concept ordering by the objective's description (deterministic token overlap, the mechanism `suggest` already uses); richer `objective show` progress | build study plans aimed at the goal |
| **4 — bias** | `suggest` ranks toward the focus; `digest`/`search` gain an `--objective` filter; bump to **2.3.0** | point the whole tool at the goal |

The version bump to 2.3.0 lands with PR 4; PRs 1–3 are additive and unreleased.
Each PR keeps `npm run check` green and carries its own tests + doc updates.

## 9. Interaction with YouTube (PR #8)

Clean and non-blocking. YouTube ships without objective-awareness; because it
routes through `analyze`, `--objective` covers YouTube transcripts uniformly the
moment this lands — no YouTube-specific work. Merge order doesn't matter; the only
shared file is `analyze.ts` (one added flag) and `package.json` (YouTube → 2.2.0,
objectives → 2.3.0), so no real conflict.

## 10. Testing

- **Repo/unit:** create objective, slug uniqueness, link/unlink, many-to-many,
  cascade on objective delete, reverse lookup, single-focus invariant.
- **Command (offline, `--provider mock`):** `objective add/list/show/focus`;
  `--objective` tagging on `analyze` and `takeaway follow`; unknown-slug error;
  `learn` inheriting the objective from a tagged post.
- **Manifest contract test** updated for the new command tree, flags, and `obj_` id.

## 11. Risks & open questions

| Item | Take |
|---|---|
| Typo objectives (`--objective stablecions`) | Requires the objective to exist (`NOT_FOUND` otherwise). Optional `analyze --objective <slug> --new-objective` could auto-create — flagged for the team, off by default. |
| Overlap with bookmark tags | Kept deliberately separate (§4.1); revisit only if users conflate them in practice. |
| Single-focus invariant | Enforced in the repository layer (setting a focus clears the others) rather than a DB constraint, since SQLite can't express "≤1 row where is_focus=1" cleanly. |
| PR sequencing | Each PR must land CI-green and sign off before the next starts, so a mid-feature `main` is always coherent (an unused-but-harmless objectives table after PR 1, etc.). |

## 12. Effort & rollout

One feature, four review-sized PRs (§8), all through the standard branch → PR →
CI (DCO + typecheck/lint/test) flow, each signed off before the next. Total
surface: one migration, an `objectives` repository + `objective` command module,
`--objective` additions to four existing commands, the learn-relevance reweight,
the suggest/digest/search bias, tests per PR, and docs (README,
`skill/SKILL.md`, `skill/references/cli-contract.md`, manifest test). Ships as
**2.3.0** when PR 4 lands.
