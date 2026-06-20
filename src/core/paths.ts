import { homedir } from "node:os";
import path from "node:path";

/**
 * Filesystem locations the CLI uses. Resolution order for each path is:
 *   1. an explicit override (CLI flag, e.g. --config-dir / --db)
 *   2. the XDG base-directory environment variables (OS convention)
 *   3. a sensible default under the user's home directory
 *
 * The CLI never requires application-specific environment variables and never
 * asks the user to author a dotfile by hand: credential collection happens
 * through `tenbrains setup` / `tenbrains config set`, which write the managed
 * config file returned by {@link resolveConfigFile}.
 */
export interface PathOverrides {
  configDir?: string | undefined;
  dbPath?: string | undefined;
}

const APP_DIR = "tenbrains";

export function resolveConfigDir(overrides: PathOverrides = {}): string {
  if (overrides.configDir?.trim()) {
    return path.resolve(overrides.configDir.trim());
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg?.trim()) {
    return path.join(path.resolve(xdg.trim()), APP_DIR);
  }
  return path.join(homedir(), ".config", APP_DIR);
}

export function resolveConfigFile(overrides: PathOverrides = {}): string {
  return path.join(resolveConfigDir(overrides), "config.json");
}

export function resolveDataDir(overrides: PathOverrides = {}): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg?.trim()) {
    return path.join(path.resolve(xdg.trim()), APP_DIR);
  }
  return path.join(homedir(), ".local", "share", APP_DIR);
}

export function resolveDbPath(overrides: PathOverrides = {}): string {
  const requested = overrides.dbPath?.trim();
  if (requested) {
    return requested === ":memory:" ? ":memory:" : path.resolve(requested);
  }
  return path.join(resolveDataDir(overrides), "tenbrains.db");
}
