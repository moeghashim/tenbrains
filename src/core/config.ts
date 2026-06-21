import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { PROVIDER_CATALOG, type ProviderId, isProviderId } from "../ai/providers.js";
import { CliError } from "./errors.js";
import { resolveConfigDir, resolveConfigFile } from "./paths.js";

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface TenbrainsConfig {
  defaultProvider?: ProviderId;
  defaultModel?: string;
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  /** X (Twitter) API credentials, used for timeline reads and tweet fetches. */
  x?: { bearerToken?: string };
  updatedAt?: string;
}

/**
 * Whether a config key holds a secret and must be redacted by default. Matches
 * the last dot-segment so compound names like `x.bearerToken` are caught too.
 */
export function isSecretKey(key: string): boolean {
  const last = key.split(".").pop() ?? "";
  return /(api_?key|token|secret|password|bearer)$/i.test(last);
}

export const REDACTED = "********";

export function redactValue(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  const tail = value.slice(-4);
  return `${REDACTED}${tail}`;
}

/**
 * Persisted CLI configuration: default provider/model plus per-provider API
 * keys. Written atomically with 0600 permissions. This is the single store the
 * CLI manages on the user's behalf — credentials are collected through commands
 * (`setup` / `config set`), never by asking the user to edit a file directly.
 */
export class ConfigStore {
  readonly filePath: string;
  private readonly dirPath: string;

  constructor(options: { configDir?: string | undefined } = {}) {
    this.filePath = resolveConfigFile({ configDir: options.configDir });
    this.dirPath = resolveConfigDir({ configDir: options.configDir });
  }

  read(): TenbrainsConfig {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return {};
      }
      throw new CliError("CONFIG_ERROR", `Failed to read config at ${this.filePath}`, {
        cause: error,
      });
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as TenbrainsConfig) : {};
    } catch (error) {
      throw new CliError("CONFIG_ERROR", `Config file is not valid JSON: ${this.filePath}`, {
        cause: error,
      });
    }
  }

  private write(config: TenbrainsConfig): void {
    const next: TenbrainsConfig = { ...config, updatedAt: new Date().toISOString() };
    mkdirSync(this.dirPath, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.filePath);
  }

  /** Read a value by dot-path (e.g. "defaultProvider", "providers.openai.apiKey"). */
  get(key: string): unknown {
    return getPath(this.read() as Record<string, unknown>, key);
  }

  /** Set a value by dot-path, validating known typed keys. Returns the new config. */
  set(key: string, value: string): TenbrainsConfig {
    const config = this.read();
    validateAssignment(key, value);
    setPath(config as Record<string, unknown>, key, value);
    this.write(config);
    return config;
  }

  /** Remove a value by dot-path. Returns whether anything was removed. */
  unset(key: string): boolean {
    const config = this.read();
    const removed = deletePath(config as Record<string, unknown>, key);
    if (removed) {
      this.write(config);
    }
    return removed;
  }

  /** Full config as a flat list of entries, with secrets redacted unless reveal. */
  entries(reveal: boolean): Array<{ key: string; value: unknown }> {
    const flat = flatten(this.read() as Record<string, unknown>);
    return flat.map(({ key, value }) => ({
      key,
      value: !reveal && isSecretKey(key) ? redactValue(value) : value,
    }));
  }

  // --- typed accessors -------------------------------------------------------

  getDefaultProvider(): ProviderId | undefined {
    const value = this.read().defaultProvider;
    return value && isProviderId(value) ? value : undefined;
  }

  getProviderConfig(provider: ProviderId): ProviderConfig {
    return this.read().providers?.[provider] ?? {};
  }

  getXBearer(): string | undefined {
    const token = this.read().x?.bearerToken?.trim();
    return token || undefined;
  }
}

function validateAssignment(key: string, value: string): void {
  if (key === "defaultProvider" && !isProviderId(value)) {
    throw new CliError(
      "VALIDATION",
      `Unknown provider "${value}". Valid: ${Object.keys(PROVIDER_CATALOG).join(", ")}.`,
      { details: { key, value } },
    );
  }
  const providerMatch = /^providers\.([^.]+)\.(apiKey|model)$/.exec(key);
  if (providerMatch && !isProviderId(providerMatch[1] ?? "")) {
    throw new CliError("VALIDATION", `Unknown provider "${providerMatch[1]}" in key "${key}".`, {
      details: { key },
    });
  }
}

// --- dot-path helpers --------------------------------------------------------

function getPath(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function setPath(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] as string;
    const existing = cursor[part];
    if (existing === null || typeof existing !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1] as string] = value;
}

function deletePath(obj: Record<string, unknown>, key: string): boolean {
  const parts = key.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] as string;
    const existing = cursor[part];
    if (existing === null || typeof existing !== "object") {
      return false;
    }
    cursor = existing as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1] as string;
  if (Object.prototype.hasOwnProperty.call(cursor, leaf)) {
    delete cursor[leaf];
    return true;
  }
  return false;
}

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else {
      out.push({ key, value: v });
    }
  }
  return out;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
