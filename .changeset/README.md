# Changesets

Tenbrains uses Changesets to prepare release PRs for the repo.

## Contributor flow

1. Make your code change.
2. Run `npm run changeset`.
3. Write a short summary for release notes.
4. Commit the generated markdown file in this folder with your work.

## Maintainer flow

1. Merge changesets into `main`.
2. Let the `Release` workflow detect the pending changesets on the next `main` push.
3. The workflow versions packages, commits the release back to `main`, publishes public packages, deploys the web app, and creates the GitHub Release automatically.

See `docs/releases.md` for the full release runbook.
