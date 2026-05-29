# Tenbrains Chrome Extension Release

## Local Development

1. Install dependencies with `npm install`.
2. Start the web app with `npm run -w @tenbrains/web dev`.
3. Start the extension dev server with `npm run extension:dev`.
4. Load the unpacked extension from `apps/extension/dist` in Chrome.

## Production Packaging

1. Prefer the zip attached to the matching GitHub Release tag (`vX.Y.Z`).
2. If needed, rebuild locally with `npm run extension:package`.
3. Confirm the artifact exists at `apps/extension/dist/tenbrains-for-x-<version>.zip`.
4. Confirm the production manifest contains:
   - `storage`
   - `https://x.com/*`
   - `https://www.tenbrains.app/*`
   - `https://tenbrains.app/*`
5. Confirm `http://localhost:3000/*` is absent from the packaged manifest.

## Chrome Web Store Checklist

1. Create or log into the Chrome Web Store publisher account.
2. Upload the zip from the GitHub Release (or the local fallback zip) to create the listing.
3. Set visibility to `Public` and enable deferred publishing.
4. Fill the listing with the prepared title, description, screenshots, promo image, privacy answers, and the privacy/contact URL: `https://www.tenbrains.app/privacy`.
5. Add reviewer instructions covering:
   - install on desktop Chrome
   - visit `https://x.com`
   - click `Analyze`
   - sign in with X when prompted
   - verify inline analysis and bookmark save
6. After approval, publish the staged release and verify install, sign-in, analysis, and bookmarking from the live store item.
