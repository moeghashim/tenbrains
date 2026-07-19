import { tokenOverlapScore, tokenSet } from "../core/text.js";
import type { Store } from "../db/repositories.js";
import type { Suggestion } from "./types.js";

const TAG_WEIGHT = 3;
const TAKEAWAY_WEIGHT = 2;
const BOOKMARK_TEXT_WEIGHT = 1;
const FOCUS_TOKEN_WEIGHT = 2;
/** Interests drift: signal loses half its weight every ~2 months. */
const HALF_LIFE_DAYS = 60;

interface Profile {
  weights: Map<string, number>;
  empty: boolean;
}

interface FocusProfile {
  slug: string;
  tokens: Set<string>;
}

/** Exponential decay in (0, 1] by age relative to `now`. */
function decayFactor(createdAt: string, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/**
 * Build a weighted interest profile from saved signal: bookmark tags (strongest),
 * account-takeaway themes, and the text of bookmarked posts, each discounted by
 * an exponential recency decay so last week's saves outweigh last quarter's.
 * This is the local, deterministic stand-in for the original's semantic
 * affinity ranking.
 */
function buildProfile(store: Store, now: Date): Profile {
  const weights = new Map<string, number>();
  const bump = (token: string, weight: number) => {
    weights.set(token, (weights.get(token) ?? 0) + weight);
  };

  const postsById = new Map(store.posts.all().map((p) => [p.id, p]));

  for (const bookmark of store.bookmarks.all()) {
    const decay = decayFactor(bookmark.createdAt, now);
    for (const tag of bookmark.tags) {
      for (const token of tokenSet(tag)) {
        bump(token, TAG_WEIGHT * decay);
      }
    }
    const post = postsById.get(bookmark.postId);
    if (post) {
      for (const token of tokenSet(post.text)) {
        bump(token, BOOKMARK_TEXT_WEIGHT * decay);
      }
    }
  }

  for (const snap of store.snapshots.all()) {
    const decay = decayFactor(snap.createdAt, now);
    for (const token of tokenSet(`${snap.summary} ${snap.takeaways.join(" ")}`)) {
      bump(token, TAKEAWAY_WEIGHT * decay);
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

function scoreProfileCandidate(
  profile: Profile,
  tokens: Set<string>,
  topic: string,
): { score: number; reason: string } | null {
  if (profile.empty) {
    return { score: 0.1, reason: `Analyzed (${topic}) but not yet bookmarked.` };
  }
  const scored = scoreCandidate(profile, tokens);
  if (scored.score <= 0) {
    return null;
  }
  return {
    score: Number(scored.score.toFixed(4)),
    reason: `Matches your saved interest in ${scored.matched.join(", ")}.`,
  };
}

function buildFocusProfile(store: Store): FocusProfile | null {
  const focus = store.objectives.focus();
  const tokens = tokenSet(focus?.description ?? "");
  return focus && tokens.size > 0 ? { slug: focus.slug, tokens } : null;
}

function scoreFocus(
  focus: FocusProfile,
  tokens: Set<string>,
): { score: number; matched: string[] } {
  const score = tokenOverlapScore(tokens, focus.tokens) * FOCUS_TOKEN_WEIGHT;
  const matched = [...tokens].filter((token) => focus.tokens.has(token)).slice(0, 3);
  return { score, matched };
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
  options: { limit?: number; now?: Date } = {},
): GenerateResult {
  const limit = options.limit ?? 10;
  const profile = buildProfile(store, options.now ?? new Date());
  const focus = buildFocusProfile(store);
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

    const base = scoreProfileCandidate(profile, tokens, analysis.topic);
    if (!base) {
      continue;
    }
    const focused = focus ? scoreFocus(focus, tokens) : null;
    const score = Number((base.score + (focused?.score ?? 0)).toFixed(4));
    const reason =
      focus && focused && focused.score > 0
        ? `Aligns with current focus "${focus.slug}" via ${focused.matched.join(", ")}. ${base.reason}`
        : base.reason;

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
