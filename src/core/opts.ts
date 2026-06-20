import { CliError } from "./errors.js";

export type Opts = Record<string, unknown>;

export function optString(opts: Opts, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function requireString(opts: Opts, key: string, flag: string): string {
  const value = optString(opts, key);
  if (value === undefined) {
    throw new CliError("USAGE", `Missing required option ${flag}.`, { details: { flag } });
  }
  return value;
}

export function optBool(opts: Opts, key: string): boolean {
  return opts[key] === true;
}

export function optNumber(opts: Opts, key: string, fallback: number): number {
  const value = opts[key];
  if (value === undefined) {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new CliError("USAGE", `Option --${key} must be a number.`, { details: { value } });
  }
  return parsed;
}

/** Parse a comma-separated list option (e.g. --tags a,b,c) into trimmed values. */
export function optList(opts: Opts, key: string): string[] {
  const value = optString(opts, key);
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
