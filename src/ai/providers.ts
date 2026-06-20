/**
 * AI provider catalog. Pure metadata — no network, no secrets — so it is safe
 * to import from the config layer and the `manifest` command. The HTTP adapters
 * that actually call these providers live in {@link file://./client.ts}.
 */
export const PROVIDER_IDS = ["anthropic", "openai", "google", "xai", "mock"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  recommendedModels: string[];
  /** Whether an API key must be configured before this provider can be used. */
  requiresKey: boolean;
  /** Dot-path in the config file where this provider's key is stored. */
  keyConfigPath: string;
}

export const DEFAULT_PROVIDER: ProviderId = "anthropic";

export const PROVIDER_CATALOG: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-4-6",
    recommendedModels: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"],
    requiresKey: true,
    keyConfigPath: "providers.anthropic.apiKey",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    recommendedModels: ["gpt-5-mini", "gpt-5.4", "gpt-4.1", "gpt-4.1-mini"],
    requiresKey: true,
    keyConfigPath: "providers.openai.apiKey",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    recommendedModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    requiresKey: true,
    keyConfigPath: "providers.google.apiKey",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    defaultModel: "grok-4-fast",
    recommendedModels: ["grok-4-fast", "grok-4", "grok-3-mini"],
    requiresKey: true,
    keyConfigPath: "providers.xai.apiKey",
  },
  mock: {
    id: "mock",
    label: "Deterministic mock (offline)",
    defaultModel: "deterministic-v1",
    recommendedModels: ["deterministic-v1"],
    requiresKey: false,
    keyConfigPath: "providers.mock.apiKey",
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getProviderInfo(id: ProviderId): ProviderInfo {
  return PROVIDER_CATALOG[id];
}
