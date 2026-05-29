import { defineManifest } from "@crxjs/vite-plugin";

import packageJson from "./package.json";

const isProductionBuild = process.env.NODE_ENV === "production";

export default defineManifest({
	manifest_version: 3,
	name: "Tenbrains for X",
	description: "Analyze public X posts and save tagged insights to Tenbrains.",
	version: packageJson.version,
	action: {
		default_title: "Tenbrains for X",
		default_popup: "src/popup/index.html",
	},
	background: {
		service_worker: "src/background/main.ts",
		type: "module",
	},
	content_scripts: [
		{
			matches: ["https://x.com/*"],
			js: ["src/content/main.tsx"],
			run_at: "document_idle",
		},
	],
	permissions: ["storage"],
	host_permissions: [
		"https://x.com/*",
		"https://www.tenbrains.app/*",
		"https://tenbrains.app/*",
		...(isProductionBuild ? [] : ["http://localhost:3000/*"]),
	],
	icons: {
		16: "src/assets/icons/icon-16.png",
		32: "src/assets/icons/icon-32.png",
		48: "src/assets/icons/icon-48.png",
		128: "src/assets/icons/icon-128.png",
	},
});
