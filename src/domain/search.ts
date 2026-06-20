import { tokenSet } from "../core/text.js";
import type { Store } from "../db/repositories.js";
import type { Account, Post } from "./types.js";

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

function snippet(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Token-overlap score in [0,1], with a bonus when the raw query appears verbatim. */
function score(queryTokens: Set<string>, docText: string, rawQuery: string): number {
  if (queryTokens.size === 0) {
    return 0;
  }
  const docTokens = tokenSet(docText);
  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) {
      overlap += 1;
    }
  }
  const base = overlap / queryTokens.size;
  const phraseBonus = docText.toLowerCase().includes(rawQuery.toLowerCase()) ? 0.25 : 0;
  return Math.min(1, base + phraseBonus);
}

/**
 * Keyword search across stored analyses, account takeaways, and bookmarks.
 * Deterministic and fully local — no embeddings or network. Results are grouped
 * by source type and ranked by token overlap with the query.
 */
export function searchCorpus(
  store: Store,
  query: string,
  options: { types?: SearchType[]; limit?: number } = {},
): SearchResult {
  const types = new Set<SearchType>(options.types ?? ["analysis", "takeaway", "bookmark"]);
  const limit = options.limit ?? 10;
  const queryTokens = tokenSet(query);

  const postsById = new Map<string, Post>(store.posts.all().map((p) => [p.id, p]));
  const accountsById = new Map<string, Account>(store.accounts.list().map((a) => [a.id, a]));

  const groups: Record<SearchType, SearchHit[]> = { analysis: [], takeaway: [], bookmark: [] };

  if (types.has("analysis")) {
    for (const analysis of store.analyses.all()) {
      const post = postsById.get(analysis.postId);
      const conceptText = analysis.concepts
        .map((c) => `${c.name} ${c.whyItMattersInTweet}`)
        .join(" ");
      const docText = `${post?.text ?? ""} ${analysis.topic} ${analysis.summary} ${analysis.intent} ${conceptText}`;
      const value = score(queryTokens, docText, query);
      if (value > 0) {
        groups.analysis.push({
          type: "analysis",
          id: analysis.id,
          score: Number(value.toFixed(3)),
          title: analysis.topic,
          snippet: snippet(analysis.summary),
          refs: { postId: analysis.postId, author: post?.authorUsername ?? null },
        });
      }
    }
  }

  if (types.has("takeaway")) {
    for (const snap of store.snapshots.all()) {
      const account = accountsById.get(snap.accountId);
      const docText = `${account?.username ?? ""} ${snap.summary} ${snap.takeaways.join(" ")}`;
      const value = score(queryTokens, docText, query);
      if (value > 0) {
        groups.takeaway.push({
          type: "takeaway",
          id: snap.id,
          score: Number(value.toFixed(3)),
          title: account ? `@${account.username}` : "account takeaway",
          snippet: snippet(snap.summary),
          refs: { accountId: snap.accountId, username: account?.username ?? null },
        });
      }
    }
  }

  if (types.has("bookmark")) {
    for (const bookmark of store.bookmarks.all()) {
      const post = postsById.get(bookmark.postId);
      const docText = `${post?.text ?? ""} ${bookmark.tags.join(" ")} ${bookmark.note ?? ""}`;
      const value = score(queryTokens, docText, query);
      if (value > 0) {
        groups.bookmark.push({
          type: "bookmark",
          id: bookmark.id,
          score: Number(value.toFixed(3)),
          title: bookmark.tags[0] ? `#${bookmark.tags[0]}` : (post?.authorUsername ?? "bookmark"),
          snippet: snippet(post?.text ?? bookmark.note ?? ""),
          refs: { postId: bookmark.postId, tags: bookmark.tags },
        });
      }
    }
  }

  let total = 0;
  for (const type of Object.keys(groups) as SearchType[]) {
    groups[type].sort((a, b) => b.score - a.score);
    groups[type] = groups[type].slice(0, limit);
    total += groups[type].length;
  }

  return { query, total, groups };
}
