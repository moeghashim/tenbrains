import type { ProviderId } from "@tenbrains/contracts";

export interface ProviderCatalogEntry {
	id: ProviderId;
	label: string;
	envVar: string;
	keyHint: string;
	defaultModel: string;
	models: readonly string[];
}

export interface EmbeddingCatalogEntry {
	provider: ProviderId;
	model: string;
	dimensions: number;
}

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;

export const PROVIDER_CATALOG: Record<ProviderId, ProviderCatalogEntry> = {
	openai: {
		id: "openai",
		label: "OpenAI",
		envVar: "OPENAI_API_KEY",
		keyHint: "Starts with sk-",
		defaultModel: "gpt-5-mini",
		models: ["gpt-5-mini", "gpt-5.4", "gpt-4.1", "gpt-4.1-mini"],
	},
	google: {
		id: "google",
		label: "Gemini",
		envVar: "GOOGLE_API_KEY",
		keyHint: "Google AI Studio API key",
		defaultModel: "gemini-2.5-flash",
		models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
	},
	xai: {
		id: "xai",
		label: "Grok",
		envVar: "XAI_API_KEY",
		keyHint: "xAI API key",
		defaultModel: "grok-4-fast",
		models: ["grok-4-fast", "grok-4", "grok-3-mini"],
	},
	anthropic: {
		id: "anthropic",
		label: "Claude",
		envVar: "ANTHROPIC_API_KEY",
		keyHint: "Starts with sk-ant-",
		defaultModel: "claude-sonnet-4-6",
		models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
	},
};

export const EMBEDDING_CATALOG: Record<string, EmbeddingCatalogEntry> = {
	[OPENAI_EMBEDDING_MODEL]: {
		provider: "openai",
		model: OPENAI_EMBEDDING_MODEL,
		dimensions: OPENAI_EMBEDDING_DIMENSIONS,
	},
};

export const PROVIDER_OPTIONS = Object.values(PROVIDER_CATALOG);

export function getProviderCatalogEntry(provider: ProviderId): ProviderCatalogEntry {
	return PROVIDER_CATALOG[provider];
}

export function getEmbeddingCatalogEntry(model: string): EmbeddingCatalogEntry | null {
	return EMBEDDING_CATALOG[model] ?? null;
}

export function getDefaultEmbeddingCatalogEntry(): EmbeddingCatalogEntry {
	return EMBEDDING_CATALOG[OPENAI_EMBEDDING_MODEL];
}

export function resolveProviderCatalogModel(provider: ProviderId, model?: string): string {
	const entry = getProviderCatalogEntry(provider);
	const trimmed = model?.trim();
	if (trimmed && entry.models.includes(trimmed)) {
		return trimmed;
	}
	return entry.defaultModel;
}
