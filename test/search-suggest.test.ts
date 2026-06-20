import assert from "node:assert/strict";
import { test } from "node:test";
import { Database } from "../src/db/database.js";
import { Store } from "../src/db/repositories.js";
import { searchCorpus } from "../src/domain/search.js";
import { generateSuggestions } from "../src/domain/suggest.js";

function seed(): Store {
  const store = new Store(Database.open({ path: ":memory:" }));
  const analyze = (externalId: string, text: string) => {
    const { post } = store.posts.ingest({ text, externalId });
    store.analyses.create({
      postId: post.id,
      provider: "mock",
      model: "deterministic-v1",
      topic: text.split(" ").slice(0, 2).join(" "),
      summary: text,
      intent: "inform",
      concepts: [{ name: text.split(" ")[0] ?? "topic", whyItMattersInTweet: "core" }],
      mock: true,
    });
    return post.id;
  };
  analyze("p1", "vector databases and embeddings power semantic search");
  analyze("p2", "embeddings drive retrieval augmented generation pipelines");
  analyze("p3", "gardening tips for spring tomatoes and herbs");
  return store;
}

test("searchCorpus groups by type and ranks by overlap", () => {
  const store = seed();
  const result = searchCorpus(store, "embeddings retrieval", { limit: 5 });
  assert.ok(result.total >= 2);
  assert.ok(result.groups.analysis.length >= 2);
  // tomato post should not rank for an embeddings query
  assert.ok(!result.groups.analysis.some((h) => h.snippet.includes("tomatoes")));
  store.database.close();
});

test("generateSuggestions ranks against the bookmarked interest profile", () => {
  const store = seed();
  // Bookmark the first embeddings post -> profile favors embeddings terms.
  const firstPost = store.posts.findByExternalId("p1");
  store.bookmarks.create({ postId: firstPost?.id ?? "", tags: ["embeddings"], source: "cli" });

  const result = generateSuggestions(store, { limit: 10 });
  assert.equal(result.profileEmpty, false);
  // The other embeddings post should surface; the gardening post should not outrank it.
  const topPostId = result.suggestions[0]?.postId;
  const topPost = topPostId ? store.posts.findById(topPostId) : null;
  assert.ok(topPost?.text.includes("embeddings"));
  store.database.close();
});

test("dismissed suggestions are not regenerated", () => {
  const store = seed();
  const first = generateSuggestions(store, { limit: 10 });
  const target = first.suggestions[0];
  assert.ok(target);
  store.suggestions.setStatus(target.id, "dismissed");

  const second = generateSuggestions(store, { limit: 10 });
  assert.ok(!second.suggestions.some((s) => s.id === target.id));
  store.database.close();
});
