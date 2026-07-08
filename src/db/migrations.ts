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
  {
    version: 2,
    name: "fts5-search-index",
    // One FTS5 table indexes every searchable record (analyses, takeaway
    // snapshots, bookmarks) as a (title, body) document, kept in sync by
    // triggers on the source tables so no application write path can forget
    // it. Porter stemming makes "embedding" match "embeddings". The doc-text
    // expressions are mirrored in src/db/fts.ts (`rebuildSearchIndex`) — keep
    // future changes there, this migration is frozen.
    up: /* sql */ `
      CREATE VIRTUAL TABLE search_fts USING fts5(
        type UNINDEXED,
        ref_id UNINDEXED,
        title,
        body,
        tokenize = 'porter unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER trg_fts_analysis_ai AFTER INSERT ON analyses BEGIN
        INSERT INTO search_fts (type, ref_id, title, body)
        VALUES (
          'analysis', NEW.id, NEW.topic,
          COALESCE((SELECT text FROM posts WHERE id = NEW.post_id), '') || ' ' ||
          NEW.topic || ' ' || NEW.summary || ' ' || NEW.intent || ' ' ||
          COALESCE((
            SELECT group_concat(json_extract(j.value, '$.name') || ' ' ||
                                COALESCE(json_extract(j.value, '$.whyItMattersInTweet'), ''), ' ')
            FROM json_each(NEW.concepts_json) j
          ), '')
        );
      END;
      CREATE TRIGGER trg_fts_analysis_ad AFTER DELETE ON analyses BEGIN
        DELETE FROM search_fts WHERE type = 'analysis' AND ref_id = OLD.id;
      END;

      CREATE TRIGGER trg_fts_snapshot_ai AFTER INSERT ON takeaway_snapshots BEGIN
        INSERT INTO search_fts (type, ref_id, title, body)
        VALUES (
          'takeaway', NEW.id,
          '@' || COALESCE((SELECT username FROM accounts WHERE id = NEW.account_id), 'account'),
          COALESCE((SELECT username FROM accounts WHERE id = NEW.account_id), '') || ' ' ||
          NEW.summary || ' ' ||
          COALESCE((SELECT group_concat(j.value, ' ') FROM json_each(NEW.takeaways_json) j), '')
        );
      END;
      CREATE TRIGGER trg_fts_snapshot_ad AFTER DELETE ON takeaway_snapshots BEGIN
        DELETE FROM search_fts WHERE type = 'takeaway' AND ref_id = OLD.id;
      END;

      CREATE TRIGGER trg_fts_bookmark_ai AFTER INSERT ON bookmarks BEGIN
        INSERT INTO search_fts (type, ref_id, title, body)
        VALUES (
          'bookmark', NEW.id,
          CASE WHEN json_array_length(NEW.tags_json) > 0
               THEN '#' || json_extract(NEW.tags_json, '$[0]')
               ELSE COALESCE((SELECT author_username FROM posts WHERE id = NEW.post_id), 'bookmark')
          END,
          COALESCE((SELECT text FROM posts WHERE id = NEW.post_id), '') || ' ' ||
          COALESCE((SELECT group_concat(j.value, ' ') FROM json_each(NEW.tags_json) j), '') || ' ' ||
          COALESCE(NEW.note, '')
        );
      END;
      CREATE TRIGGER trg_fts_bookmark_au AFTER UPDATE ON bookmarks BEGIN
        DELETE FROM search_fts WHERE type = 'bookmark' AND ref_id = OLD.id;
        INSERT INTO search_fts (type, ref_id, title, body)
        VALUES (
          'bookmark', NEW.id,
          CASE WHEN json_array_length(NEW.tags_json) > 0
               THEN '#' || json_extract(NEW.tags_json, '$[0]')
               ELSE COALESCE((SELECT author_username FROM posts WHERE id = NEW.post_id), 'bookmark')
          END,
          COALESCE((SELECT text FROM posts WHERE id = NEW.post_id), '') || ' ' ||
          COALESCE((SELECT group_concat(j.value, ' ') FROM json_each(NEW.tags_json) j), '') || ' ' ||
          COALESCE(NEW.note, '')
        );
      END;
      CREATE TRIGGER trg_fts_bookmark_ad AFTER DELETE ON bookmarks BEGIN
        DELETE FROM search_fts WHERE type = 'bookmark' AND ref_id = OLD.id;
      END;

      INSERT INTO search_fts (type, ref_id, title, body)
      SELECT 'analysis', a.id, a.topic,
        COALESCE(p.text, '') || ' ' || a.topic || ' ' || a.summary || ' ' || a.intent || ' ' ||
        COALESCE((
          SELECT group_concat(json_extract(j.value, '$.name') || ' ' ||
                              COALESCE(json_extract(j.value, '$.whyItMattersInTweet'), ''), ' ')
          FROM json_each(a.concepts_json) j
        ), '')
      FROM analyses a LEFT JOIN posts p ON p.id = a.post_id;

      INSERT INTO search_fts (type, ref_id, title, body)
      SELECT 'takeaway', s.id, '@' || COALESCE(acc.username, 'account'),
        COALESCE(acc.username, '') || ' ' || s.summary || ' ' ||
        COALESCE((SELECT group_concat(j.value, ' ') FROM json_each(s.takeaways_json) j), '')
      FROM takeaway_snapshots s LEFT JOIN accounts acc ON acc.id = s.account_id;

      INSERT INTO search_fts (type, ref_id, title, body)
      SELECT 'bookmark', b.id,
        CASE WHEN json_array_length(b.tags_json) > 0
             THEN '#' || json_extract(b.tags_json, '$[0]')
             ELSE COALESCE(p.author_username, 'bookmark')
        END,
        COALESCE(p.text, '') || ' ' ||
        COALESCE((SELECT group_concat(j.value, ' ') FROM json_each(b.tags_json) j), '') || ' ' ||
        COALESCE(b.note, '')
      FROM bookmarks b LEFT JOIN posts p ON p.id = b.post_id;
    `,
  },
  {
    version: 3,
    name: "track-progress",
    up: /* sql */ `
      CREATE TABLE track_progress (
        track_id     TEXT NOT NULL REFERENCES learning_tracks(id) ON DELETE CASCADE,
        day          INTEGER NOT NULL,
        notes        TEXT,
        completed_at TEXT NOT NULL,
        PRIMARY KEY (track_id, day)
      ) WITHOUT ROWID;
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
