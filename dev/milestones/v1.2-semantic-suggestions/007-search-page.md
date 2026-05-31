---
id: 007
title: Add the semantic search page
milestone: v1.2-semantic-suggestions
prd: docs/prd/track-a-semantic-suggestions.md
commit_scope: "feat(web)"
priority: medium
depends_on: ["006"]
files: ["apps/web/app/app/search/page.tsx", "apps/web/components/semantic-search-browser.tsx", "apps/web/components/semantic-search-browser.js", "apps/web/components/workspace-menu.ts", "apps/web/components/app-workspace-nav.tsx", "apps/web/test/search-page.test.tsx", "docs/pr-screenshots/search-page.png"]
---

## Scope

- `/app/search` page + component(s); nav entry; loading/empty/no-key/error states; minimal component test and/or a PR screenshot in `docs/pr-screenshots`.

## Depends on

- PR6.

## Acceptance criteria

- [ ] Typing a query and submitting renders grouped results linking into existing views.
- [ ] No-key state explains how to add an OpenAI key.
- [ ] Matches existing app page styling/layout.

## Out of scope

- Search API changes beyond what PR6 shipped.
- CLI or extension search UI.
- Ranking algorithm changes.

## Suggested approach

Use the existing app page shape from `apps/web/app/app/bookmarks/page.tsx`, `apps/web/app/app/suggestions/page.tsx`, and `apps/web/components/app-workspace-nav.tsx`. Add a `Search` entry to `apps/web/components/workspace-menu.ts`, build a client component that calls `POST /api/me/search`, and cover loading, empty, no-key, and error states without changing the API contract from PR6.
