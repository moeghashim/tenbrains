import type { DatabaseSync } from "node:sqlite";

/**
 * Rebuild the `search_fts` index from the source tables. The doc-text
 * expressions here define the *current* index shape; the frozen copies in the
 * `fts5-search-index` migration were snapshotted from this file. Keep changes
 * here (plus a new migration updating the triggers) — never edit the old
 * migration.
 */
export function rebuildSearchIndex(db: DatabaseSync): { indexed: number } {
  db.exec(/* sql */ `
    DELETE FROM search_fts;

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
  `);
  const row = db.prepare("SELECT COUNT(*) AS n FROM search_fts").get() as { n: number };
  return { indexed: row.n };
}
