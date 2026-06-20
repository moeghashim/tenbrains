import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  name: string;
  up: string;
}

/**
 * Ordered, append-only schema migrations. The applied version is tracked with
 * SQLite's built-in `PRAGMA user_version`, so no bookkeeping table is needed.
 * Never edit an existing migration's SQL — add a new one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: /* sql */ `
      CREATE TABLE posts (
        id              TEXT PRIMARY KEY,
        external_id     TEXT UNIQUE,
        url             TEXT,
        author_username TEXT,
        author_name     TEXT,
        text            TEXT NOT NULL,
        posted_at       TEXT,
        raw_json        TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_posts_author ON posts(author_username);
      CREATE INDEX idx_posts_created ON posts(created_at);

      CREATE TABLE analyses (
        id            TEXT PRIMARY KEY,
        post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        topic         TEXT NOT NULL,
        summary       TEXT NOT NULL,
        intent        TEXT NOT NULL,
        concepts_json TEXT NOT NULL,
        mock          INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX idx_analyses_post ON analyses(post_id);
      CREATE INDEX idx_analyses_created ON analyses(created_at);

      CREATE TABLE accounts (
        id                TEXT PRIMARY KEY,
        username          TEXT NOT NULL UNIQUE,
        name              TEXT,
        followed_at       TEXT NOT NULL,
        last_refreshed_at TEXT
      );

      CREATE TABLE takeaway_snapshots (
        id                   TEXT PRIMARY KEY,
        account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        provider             TEXT NOT NULL,
        model                TEXT NOT NULL,
        summary              TEXT NOT NULL,
        takeaways_json       TEXT NOT NULL,
        source_post_ids_json TEXT NOT NULL,
        post_count           INTEGER NOT NULL,
        mock                 INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL
      );
      CREATE INDEX idx_snapshots_account ON takeaway_snapshots(account_id, created_at);

      CREATE TABLE bookmarks (
        id         TEXT PRIMARY KEY,
        post_id    TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
        tags_json  TEXT NOT NULL DEFAULT '[]',
        note       TEXT,
        source     TEXT NOT NULL DEFAULT 'cli',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE suggestions (
        id         TEXT PRIMARY KEY,
        post_id    TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
        reason     TEXT NOT NULL,
        score      REAL NOT NULL DEFAULT 0,
        status     TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_suggestions_status ON suggestions(status, score);

      CREATE TABLE learning_tracks (
        id              TEXT PRIMARY KEY,
        analysis_id     TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        minutes_per_day INTEGER NOT NULL,
        ratings_json    TEXT NOT NULL,
        days_json       TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_tracks_analysis ON learning_tracks(analysis_id);
    `,
  },
];

export function currentSchemaVersion(): number {
  return MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
}

/** Apply any migrations newer than the database's current user_version. */
export function runMigrations(db: DatabaseSync): { from: number; to: number; applied: string[] } {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const from = row?.user_version ?? 0;
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) {
      continue;
    }
    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
      applied.push(migration.name);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const to = currentSchemaVersion();
  return { from, to, applied };
}
