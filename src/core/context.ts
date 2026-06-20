import { Database } from "../db/database.js";
import { Store } from "../db/repositories.js";
import { ConfigStore } from "./config.js";
import { Logger, type OutputMode } from "./output.js";
import { resolveDbPath } from "./paths.js";

export interface GlobalOptions {
  json: boolean;
  pretty: boolean;
  quiet: boolean;
  dbPath?: string | undefined;
  configDir?: string | undefined;
}

/**
 * Per-invocation runtime: output mode, logger, config store, and a lazily
 * opened database. Commands that don't touch persistence (config, manifest)
 * never open the DB.
 */
export class RunContext {
  readonly mode: OutputMode;
  readonly logger: Logger;
  readonly config: ConfigStore;
  private database: Database | null = null;
  private storeInstance: Store | null = null;

  constructor(readonly options: GlobalOptions) {
    this.mode = options.pretty && !options.json ? "pretty" : "json";
    this.logger = new Logger(this.mode, options.quiet);
    this.config = new ConfigStore({ configDir: options.configDir });
  }

  dbPath(): string {
    return resolveDbPath({ dbPath: this.options.dbPath });
  }

  store(): Store {
    if (!this.storeInstance) {
      this.database = Database.open({ path: this.dbPath() });
      this.storeInstance = new Store(this.database);
    }
    return this.storeInstance;
  }

  close(): void {
    this.database?.close();
    this.database = null;
    this.storeInstance = null;
  }
}
