import type { Store } from "../db/repositories.js";

export type SearchType = "analysis" | "takeaway" | "bookmark";

export interface SearchHit {
  type: SearchType;
  id: string;
  score: number;
  title: string;
  snippet: string;
  refs: Record<string, unknown>;
}

export interface SearchResult {
  query: string;
  total: number;
  groups: Record<SearchType, SearchHit[]>;
}

interface FtsRow {
  ref_id: string;
  title: string;
  snip: string;
  rank: number;
}

/**
 * Turn a free-text query into an FTS5 MATCH expression. Each word is quoted
 * (so FTS operators in user input are inert) and words are OR-ed, letting
 * BM25 rank partial matches instead of dropping them.
 */
export function toMatchQuery(query: string): string | null {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) {
    return null;
  }
  return words.map((w) => `"${w}"`).join(" OR ");
}

/**
 * Full-text search across stored analyses, account takeaways, and bookmarks,
 * backed by the trigger-maintained `search_fts` FTS5 table. Porter stemming
 * matches inflected forms ("embedding" finds "embeddings"); ranking is BM25
 * with the title column weighted double. Fully local and deterministic.
 */
export function searchCorpus(
  store: Store,
  query: string,
  options: { types?: SearchType[]; limit?: number } = {},
): SearchResult {
  const types = new Set<SearchType>(options.types ?? ["analysis", "takeaway", "bookmark"]);
  const limit = options.limit ?? 10;
  const groups: Record<SearchType, SearchHit[]> = { analysis: [], takeaway: [], bookmark: [] };
  const match = toMatchQuery(query);

  if (match) {
    const stmt = store.database.handle.prepare(
      `SELECT ref_id, title, snippet(search_fts, -1, '', '', '…', 24) AS snip,
              bm25(search_fts, 0, 0, 2.0, 1.0) AS rank
       FROM search_fts
       WHERE search_fts MATCH ? AND type = ?
       ORDER BY rank
       LIMIT ?`,
    );
    for (const type of types) {
      const rows = stmt.all(match, type, limit) as unknown as FtsRow[];
      for (const row of rows) {
        const refs = resolveRefs(store, type, row.ref_id);
        if (refs === null) {
          continue; // index row outlived its record; `db reindex` cleans these
        }
        groups[type].push({
          type,
          id: row.ref_id,
          // bm25() returns "lower is better" negatives; flip so higher = better.
          // BM25 magnitudes can be tiny in small corpora, so keep 6 decimals.
          score: Number((-row.rank).toFixed(6)),
          title: row.title,
          snippet: row.snip,
          refs,
        });
      }
    }
  }

  const total = groups.analysis.length + groups.takeaway.length + groups.bookmark.length;
  return { query, total, groups };
}

function resolveRefs(store: Store, type: SearchType, id: string): Record<string, unknown> | null {
  if (type === "analysis") {
    const analysis = store.analyses.findById(id);
    if (!analysis) {
      return null;
    }
    const post = store.posts.findById(analysis.postId);
    return { postId: analysis.postId, author: post?.authorUsername ?? null };
  }
  if (type === "takeaway") {
    const snap = store.snapshots.findById(id);
    if (!snap) {
      return null;
    }
    const account = store.accounts.findById(snap.accountId);
    return { accountId: snap.accountId, username: account?.username ?? null };
  }
  const bookmark = store.bookmarks.findById(id);
  if (!bookmark) {
    return null;
  }
  return { postId: bookmark.postId, tags: bookmark.tags };
}
