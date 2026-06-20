import { hashtags, significantTerms, slugify } from "../core/text.js";
import type { Analysis, Post } from "./types.js";

const MAX_TAGS = 6;

/**
 * Deterministically suggest tags for a post. Prefers, in order: existing tags,
 * any #hashtags in the text, slugified concept names and topic words from the
 * latest analysis, then falls back to the most significant terms in the text.
 * Pure and stable — the same inputs always yield the same tags.
 */
export function suggestTags(
  post: Post,
  analysis: Analysis | null,
  existing: string[] = [],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const tag = slugify(raw);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      ordered.push(tag);
    }
  };

  for (const tag of existing) {
    add(tag);
  }
  for (const tag of hashtags(post.text)) {
    add(tag);
  }
  if (analysis) {
    for (const concept of analysis.concepts) {
      add(concept.name);
    }
    for (const word of analysis.topic.split(/[^A-Za-z0-9]+/)) {
      if (word.length >= 4) {
        add(word);
      }
    }
  }
  for (const term of significantTerms(post.text, MAX_TAGS)) {
    add(term);
  }

  return ordered.slice(0, MAX_TAGS);
}
