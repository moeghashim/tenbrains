# Tenbrains Releases

Tenbrains uses Changesets and GitHub Releases for release automation directly from `main` pushes.

## What gets released

- Public npm packages in `packages/*`
- The web app in `apps/web` via Vercel production deploy
- The Chrome extension zip from `apps/extension/dist`

Private apps are not published to npm.

## Contributor flow

1. Make the code change.
2. Run `npm run changeset`.
3. Pick the correct bump level for the affected package group.
4. Write a short summary that can appear in release notes.
5. Commit the generated `.changeset/*.md` file with your change.

## Maintainer flow

1. Merge changesets into `main`.
2. Let the `Release` workflow run on the resulting `main` push.
3. The workflow will:
   - detect pending `.changeset/*.md` files
   - run `npm run release:version`
   - update `package-lock.json`
   - commit the version/changelog changes back to `main`
   - run `npm run release:publish`
   - run `npm run -w @tenbrains/web build`
   - run `npm run extension:package`
   - deploy the release commit to Vercel production
   - create the GitHub Release and attach the extension zip

## Required GitHub Secrets

- `NPM_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Production runtime secrets stay in Vercel and are not duplicated into this workflow.

## Local release commands

- Create a changeset: `npm run changeset`
- Inspect release status: `npm run release:status`
- Apply pending version bumps locally: `npm run release:version`
- Publish unreleased public packages locally: `npm run release:publish`

Local publish and deploy are fallback workflows only. The standard path is through GitHub Actions.
