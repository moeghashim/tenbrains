import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./manifest.config.js";

export default defineConfig({
	plugins: [react(), crx({ manifest })],
	resolve: {
		alias: [
			{
				find: "@tenbrains/contracts/bookmark-tags",
				replacement: fileURLToPath(new URL("../../packages/contracts/src/bookmark-tags.ts", import.meta.url)),
			},
			{
				find: "@tenbrains/contracts",
				replacement: fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
			},
		],
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
