import { createInterface } from "node:readline/promises";
import { DEFAULT_PROVIDER, getProviderInfo, isProviderId } from "../ai/providers.js";
import { isSecretKey, redactValue } from "../core/config.js";
import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveTextInput } from "../core/input.js";
import { type Opts, optBool, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { resolveDbPath } from "../core/paths.js";

function maybeRedact(key: string, value: unknown, reveal: boolean): unknown {
  return reveal || !isSecretKey(key) ? value : redactValue(value);
}

/**
 * Collect credentials through the CLI and persist them to the managed config
 * file. Non-interactive by default (flags / stdin) so agents can run it; falls
 * back to interactive prompts only when attached to a TTY.
 */
export async function setupCommand(ctx: RunContext, opts: Opts): Promise<CommandResult> {
  const providerArg = optString(opts, "provider") ?? DEFAULT_PROVIDER;
  if (!isProviderId(providerArg)) {
    throw new CliError("VALIDATION", `Unknown provider "${providerArg}".`);
  }
  const provider = providerArg;
  const info = getProviderInfo(provider);

  let apiKeyArg = optString(opts, "apiKey");
  if (apiKeyArg === "-") {
    apiKeyArg = resolveTextInput("-").trim();
  }

  const interactive = apiKeyArg === undefined && info.requiresKey && process.stdin.isTTY === true;
  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      ctx.logger.warn("Input is visible while typing; use --api-key - to pipe a key without echo.");
      apiKeyArg = (await rl.question(`${info.label} API key: `)).trim();
    } finally {
      rl.close();
    }
  }

  if (info.requiresKey && !apiKeyArg) {
    throw new CliError(
      "USAGE",
      `An API key is required for ${info.label}. Pass --api-key <KEY> (or --api-key - to read stdin).`,
    );
  }

  const model = optString(opts, "model") ?? info.defaultModel;
  const makeDefault = optBool(opts, "default") || ctx.config.getDefaultProvider() === undefined;

  if (apiKeyArg) {
    ctx.config.set(info.keyConfigPath, apiKeyArg);
  }
  ctx.config.set(`providers.${provider}.model`, model);
  if (makeDefault) {
    ctx.config.set("defaultProvider", provider);
    ctx.config.set("defaultModel", model);
  }

  // Optionally collect an X (Twitter) API Bearer token in the same flow. It is
  // used to fetch tweets/timelines; single-tweet `analyze` works without it via
  // the free oEmbed path, so this is always optional.
  let xBearerArg = optString(opts, "xBearer");
  if (xBearerArg) {
    xBearerArg = resolveTextInput(xBearerArg).trim();
  }
  const xInteractive =
    xBearerArg === undefined &&
    process.stdin.isTTY === true &&
    optString(opts, "apiKey") === undefined;
  if (xInteractive) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = (await rl.question("X API Bearer token (optional, Enter to skip): ")).trim();
      if (answer) {
        xBearerArg = answer;
      }
    } finally {
      rl.close();
    }
  }
  if (xBearerArg) {
    ctx.config.set("x.bearerToken", xBearerArg);
  }

  return {
    data: {
      provider,
      model,
      default: makeDefault,
      keyConfigured: Boolean(apiKeyArg) || !info.requiresKey,
      xConfigured: Boolean(xBearerArg) || ctx.config.getXBearer() !== undefined,
      configPath: ctx.config.filePath,
    },
    meta: { persisted: true },
    human: () =>
      `Configured ${info.label} (model ${model})${makeDefault ? " as default" : ""}${xBearerArg ? " + X token" : ""}. Saved to ${ctx.config.filePath}.`,
  };
}

export function configSetCommand(ctx: RunContext, opts: Opts): CommandResult {
  const key = requireString(opts, "key", "<key>");
  const rawValue = requireString(opts, "value", "<value>");
  const value = resolveTextInput(rawValue).trim();
  ctx.config.set(key, value);
  return {
    data: { key, value: maybeRedact(key, value, false) },
    meta: { persisted: true, configPath: ctx.config.filePath },
    human: () => `Set ${key}.`,
  };
}

export function configGetCommand(ctx: RunContext, opts: Opts): CommandResult {
  const key = requireString(opts, "key", "<key>");
  const reveal = optBool(opts, "reveal");
  const value = ctx.config.get(key);
  if (value === undefined) {
    throw new CliError("NOT_FOUND", `No config value for "${key}".`, { details: { key } });
  }
  return {
    data: { key, value: maybeRedact(key, value, reveal) },
    human: () => String(maybeRedact(key, value, reveal)),
  };
}

export function configListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const reveal = optBool(opts, "reveal");
  const entries = ctx.config.entries(reveal);
  return {
    data: { entries, configPath: ctx.config.filePath },
    human: () =>
      entries.length === 0
        ? "No config set."
        : entries.map((e) => `${e.key} = ${String(e.value)}`).join("\n"),
  };
}

export function configUnsetCommand(ctx: RunContext, opts: Opts): CommandResult {
  const key = requireString(opts, "key", "<key>");
  const removed = ctx.config.unset(key);
  if (!removed) {
    throw new CliError("NOT_FOUND", `No config value for "${key}".`, { details: { key } });
  }
  return {
    data: { key, removed: true },
    meta: { persisted: true },
    human: () => `Unset ${key}.`,
  };
}

export function configPathCommand(ctx: RunContext, _opts: Opts): CommandResult {
  const configPath = ctx.config.filePath;
  const dbPath = resolveDbPath({ dbPath: ctx.options.dbPath });
  return {
    data: { configPath, dbPath },
    human: () => `config: ${configPath}\ndb:     ${dbPath}`,
  };
}
