const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "any",
  "can",
  "had",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "man",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "did",
  "its",
  "let",
  "put",
  "say",
  "she",
  "too",
  "use",
  "that",
  "with",
  "this",
  "have",
  "from",
  "they",
  "will",
  "your",
  "what",
  "when",
  "make",
  "like",
  "time",
  "just",
  "them",
  "than",
  "then",
  "into",
  "more",
  "some",
  "such",
  "only",
  "over",
  "also",
  "back",
  "after",
  "very",
  "most",
  "good",
  "much",
  "many",
  "been",
  "were",
  "would",
  "about",
  "there",
  "their",
  "which",
  "these",
  "those",
  "could",
  "should",
  "because",
  "here",
  "http",
  "https",
  "com",
  "www",
]);

/** Lowercase content words (length >= 4, non-stopword), URLs stripped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w.replace(/^#/, "")));
}

/** Unique content tokens, hashes stripped — useful for overlap scoring. */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text).map((w) => w.replace(/^#/, "")));
}

/** Top `n` terms by frequency; ties resolved by first appearance (stable). */
export function significantTerms(text: string, n: number): string[] {
  const counts = new Map<string, { count: number; first: number }>();
  let index = 0;
  for (const word of tokenize(text)) {
    const entry = counts.get(word);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(word, { count: 1, first: index });
    }
    index += 1;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, n)
    .map(([word]) => word);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract #hashtags (without the #), lowercased. */
export function hashtags(text: string): string[] {
  return [...text.matchAll(/#(\w{2,})/g)].map((m) => (m[1] as string).toLowerCase());
}
