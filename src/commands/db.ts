import { rmSync } from "node:fs";
import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { type Opts, optBool } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";

export function dbStatsCommand(ctx: RunContext, _opts: Opts): CommandResult {
  const store = ctx.store();
  const tables = store.database.stats();
  const total = Object.values(tables).reduce((sum, n) => sum + n, 0);
  return {
    data: {
      path: store.database.path,
      schemaVersion: store.database.schemaVersion(),
      total,
      tables,
    },
    human: () =>
      [
        `db: ${store.database.path} (schema v${store.database.schemaVersion()})`,
        ...Object.entries(tables).map(([t, n]) => `  ${t}: ${n}`),
      ].join("\n"),
  };
}

export function dbMigrateCommand(ctx: RunContext, _opts: Opts): CommandResult {
  // Opening the store runs any pending migrations as a side effect.
  const store = ctx.store();
  return {
    data: { path: store.database.path, schemaVersion: store.database.schemaVersion() },
    meta: { persisted: true },
    human: () => `Database at schema v${store.database.schemaVersion()}.`,
  };
}

export function dbVacuumCommand(ctx: RunContext, _opts: Opts): CommandResult {
  const store = ctx.store();
  store.database.handle.exec("VACUUM");
  return {
    data: { path: store.database.path, vacuumed: true },
    meta: { persisted: true },
    human: () => "Vacuumed database.",
  };
}

export function dbResetCommand(ctx: RunContext, opts: Opts): CommandResult {
  if (!optBool(opts, "yes")) {
    throw new CliError("USAGE", "Refusing to reset without --yes. This deletes all stored data.");
  }
  const dbPath = ctx.dbPath();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  const store = ctx.store(); // recreates an empty schema
  return {
    data: { path: dbPath, schemaVersion: store.database.schemaVersion(), reset: true },
    meta: { persisted: true },
    human: () => `Reset database at ${dbPath}.`,
  };
}
