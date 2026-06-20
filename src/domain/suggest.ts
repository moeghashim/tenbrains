import { tokenSet } from "../core/text.js";
import type { Store } from "../db/repositories.js";
import type { Suggestion } from "./types.js";

const TAG_WEIGHT = 3;
const TAKEAWAY_WEIGHT = 2;
const BOOKMARK_TEXT_WEIGHT = 1;

interface Profile {
  weights: Map<string, number>;
  empty: boolean;
}

/**
 * Build a weighted interest profile from saved signal: bookmark tags (strongest),
 * account-takeaway themes, and the text of bookmarked posts. This is the local,
 * deterministic stand-in for the original's semantic affinity ranking.
 */
function buildProfile(store: Store): Profile {
  const weights = new Map<string, number>();
  const bump = (token: string, weight: number) => {
    weights.set(token, (weights.get(token) ?? 0) + weight);
  };

  const postsById = new Map(store.posts.all().map((p) => [p.id, p]));

  for (const bookmark of store.bookmarks.all()) {
    for (const tag of bookmark.tags) {
      for (const token of tokenSet(tag)) {
        bump(token, TAG_WEIGHT);
      }
    }
    const post = postsById.get(bookmark.postId);
    if (post) {
      for (const token of tokenSet(post.text)) {
        bump(token, BOOKMARK_TEXT_WEIGHT);
      }
    }
  }

  for (const snap of store.snapshots.all()) {
    for (const token of tokenSet(`${snap.summary} ${snap.takeaways.join(" ")}`)) {
      bump(token, TAKEAWAY_WEIGHT);
    }
  }

  return { weights, empty: weights.size === 0 };
}

function scoreCandidate(
  profile: Profile,
  tokens: Set<string>,
): { score: number; matched: string[] } {
  const matched: Array<{ token: string; weight: number }> = [];
  let score = 0;
  for (const token of tokens) {
    const weight = profile.weights.get(token);
    if (weight) {
      score += weight;
      matched.push({ token, weight });
    }
  }
  matched.sort((a, b) => b.weight - a.weight);
  return { score, matched: matched.slice(0, 3).map((m) => m.token) };
}

export interface GenerateResult {
  created: number;
  updated: number;
  profileEmpty: boolean;
  suggestions: Suggestion[];
}

/**
 * Regenerate pending suggestions: rank analyzed-but-unsaved posts against the
 * interest profile. Posts already saved or dismissed are left untouched.
 */
export function generateSuggestions(
  store: Store,
  options: { limit?: number } = {},
): GenerateResult {
  const limit = options.limit ?? 10;
  const profile = buildProfile(store);
  const bookmarkedPostIds = new Set(store.bookmarks.all().map((b) => b.postId));

  let created = 0;
  let updated = 0;

  for (const post of store.posts.all()) {
    if (bookmarkedPostIds.has(post.id)) {
      continue;
    }
    const existing = store.suggestions.findByPostId(post.id);
    if (existing && existing.status !== "pending") {
      continue; // respect prior save/dismiss feedback
    }

    const analysis = store.analyses.latestForPost(post.id);
    if (!analysis) {
      continue; // only suggest posts we understand
    }

    const conceptText = analysis.concepts.map((c) => c.name).join(" ");
    const tokens = tokenSet(`${post.text} ${analysis.topic} ${conceptText}`);

    let score: number;
    let reason: string;
    if (profile.empty) {
      score = 0.1;
      reason = `Analyzed (${analysis.topic}) but not yet bookmarked.`;
    } else {
      const scored = scoreCandidate(profile, tokens);
      if (scored.score <= 0) {
        continue;
      }
      score = scored.score;
      reason = `Matches your saved interest in ${scored.matched.join(", ")}.`;
    }

    const before = existing !== null;
    store.suggestions.upsert({ postId: post.id, reason, score });
    if (before) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return {
    created,
    updated,
    profileEmpty: profile.empty,
    suggestions: store.suggestions.list("pending", limit),
  };
}
