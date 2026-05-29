# Tenbrains for X

Chrome extension that injects Tenbrains controls into `x.com`, analyzes public posts inline, and saves tagged insights to Tenbrains bookmarks.

## Scripts

- `npm run dev` starts the extension dev server
- `npm run build` builds the unpacked extension in `dist/`
- `npm run package` builds and zips the production artifact
- `npm run test` runs the extension unit/component tests

## Runtime

- Production base URL defaults to `https://www.tenbrains.app`
- Development base URL defaults to `http://localhost:3000`
- Override with `VITE_TENBRAINS_BASE_URL` when needed. `VITE_RABBITBRAIN_BASE_URL` is still read as a legacy alias.
