import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CliError } from "../core/errors.js";
import { runMigrations } from "./migrations.js";

export const ID_PREFIXES = ["post", "ana", "acc", "snap", "bm", "sug", "trk", "obj"] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

/** Sortable, prefixed id: <prefix>_<base36 time><random hex>. */
export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(36).padStart(9, "0");
  const rand = randomBytes(5).toString("hex");
  return `${prefix}_${time}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface OpenDbOptions {
  path: string;
  /** When true, only opens if the schema already exists (no migrations run). */
  readonly?: boolean;
}

/**
 * Thin wrapper over Node's built-in SQLite. Owns connection lifecycle, pragmas,
 * and migration. The raw handle is exposed for the repositories layer.
 */
export class Database {
  readonly handle: DatabaseSync;
  readonly path: string;

  private constructor(handle: DatabaseSync, dbPath: string) {
    this.handle = handle;
    this.path = dbPath;
  }

  static open(options: OpenDbOptions): Database {
    const dbPath = options.path;
    if (dbPath !== ":memory:") {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    let handle: DatabaseSync;
    try {
      handle = new DatabaseSync(dbPath);
    } catch (error) {
      throw new CliError("CONFIG_ERROR", `Failed to open database at ${dbPath}`, { cause: error });
    }
    handle.exec("PRAGMA foreign_keys = ON");
    if (dbPath !== ":memory:") {
      handle.exec("PRAGMA journal_mode = WAL");
      handle.exec("PRAGMA busy_timeout = 5000");
    }
    const db = new Database(handle, dbPath);
    if (!options.readonly) {
      runMigrations(handle);
    }
    return db;
  }

  schemaVersion(): number {
    const row = this.handle.prepare("PRAGMA user_version").get() as
      | { user_version: number }
      | undefined;
    return row?.user_version ?? 0;
  }

  /** Row counts per table, for `db stats`. */
  stats(): Record<string, number> {
    const tables = [
      "posts",
      "analyses",
      "accounts",
      "takeaway_snapshots",
      "bookmarks",
      "suggestions",
      "learning_tracks",
      "track_progress",
      "objectives",
      "objective_links",
    ];
    const out: Record<string, number> = {};
    for (const table of tables) {
      const row = this.handle.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      out[table] = row.n;
    }
    return out;
  }

  /** Run a function inside a transaction, rolling back on any thrown error. */
  transaction<T>(fn: () => T): T {
    this.handle.exec("BEGIN");
    try {
      const result = fn();
      this.handle.exec("COMMIT");
      return result;
    } catch (error) {
      this.handle.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.handle.close();
  }
}
