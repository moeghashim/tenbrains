const DEFAULT_PRODUCTION_BASE_URL = "https://www.tenbrains.app";
const DEFAULT_DEVELOPMENT_BASE_URL = "http://localhost:3000";

interface ImportMetaEnvLike {
	VITE_TENBRAINS_BASE_URL?: string;
	VITE_RABBITBRAIN_BASE_URL?: string;
	DEV?: boolean;
}

function normalizeBaseUrl(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function readAppBaseUrl(): string {
	const env = ((import.meta as ImportMeta & { env?: ImportMetaEnvLike }).env ?? {}) as ImportMetaEnvLike;
	const configured = env.VITE_TENBRAINS_BASE_URL?.trim() || env.VITE_RABBITBRAIN_BASE_URL?.trim();
	if (configured) {
		return normalizeBaseUrl(configured);
	}
	if (env.DEV) {
		return DEFAULT_DEVELOPMENT_BASE_URL;
	}
	return DEFAULT_PRODUCTION_BASE_URL;
}

export const APP_BASE_URL = readAppBaseUrl();
