import type { ConfigStore } from "../core/config.js";
import { CliError } from "../core/errors.js";
import { DEFAULT_PROVIDER, type ProviderId, getProviderInfo, isProviderId } from "./providers.js";

export interface ResolvedProvider {
  provider: ProviderId;
  model: string;
  apiKey: string | null;
}

export interface ResolveOptions {
  provider?: string | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
}

/**
 * Resolve which provider/model/key to use for a run. Precedence per field:
 *   provider:  --provider  >  config.defaultProvider  >  built-in default
 *   model:     --model     >  config providers.<id>.model  >  config.defaultModel*  >  catalog default
 *   apiKey:    --api-key    >  config providers.<id>.apiKey  >  none
 *   (*defaultModel only applies when the chosen provider is the default provider)
 *
 * No environment variables are consulted: credentials come from CLI flags or
 * the managed config store, both populated through CLI commands.
 */
export function resolveProvider(config: ConfigStore, opts: ResolveOptions): ResolvedProvider {
  if (opts.provider && !isProviderId(opts.provider)) {
    throw new CliError("VALIDATION", `Unknown provider "${opts.provider}".`, {
      details: { provider: opts.provider },
    });
  }

  const stored = config.read();
  const provider: ProviderId =
    (opts.provider as ProviderId | undefined) ?? config.getDefaultProvider() ?? DEFAULT_PROVIDER;
  const info = getProviderInfo(provider);
  const providerConfig = config.getProviderConfig(provider);

  const model =
    opts.model?.trim() ||
    providerConfig.model?.trim() ||
    (provider === stored.defaultProvider ? stored.defaultModel?.trim() : undefined) ||
    info.defaultModel;

  const apiKey = opts.apiKey?.trim() || providerConfig.apiKey?.trim() || null;

  if (info.requiresKey && !apiKey) {
    throw new CliError(
      "MISSING_CREDENTIALS",
      `No API key configured for ${info.label}. Run "tenbrains setup --provider ${provider} --api-key <KEY>", or "tenbrains config set ${info.keyConfigPath} <KEY>", or pass --api-key.`,
      { details: { provider, keyConfigPath: info.keyConfigPath } },
    );
  }

  return { provider, model, apiKey };
}
