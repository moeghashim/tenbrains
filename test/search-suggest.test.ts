import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Database } from "../src/db/database.js";
import { rebuildSearchIndex } from "../src/db/fts.js";
import { MIGRATIONS, runMigrations } from "../src/db/migrations.js";
import { Store } from "../src/db/repositories.js";
import { searchCorpus, toMatchQuery } from "../src/domain/search.js";
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

test("search matches inflected forms via stemming", () => {
  const store = seed();
  // Stored text says "embeddings"; a singular query should still hit.
  const result = searchCorpus(store, "embedding", { limit: 5 });
  assert.ok(result.groups.analysis.length >= 2);
  store.database.close();
});

test("search index follows bookmark updates and deletes", () => {
  const store = seed();
  const post = store.posts.findByExternalId("p3");
  const bookmark = store.bookmarks.create({ postId: post?.id ?? "", tags: [], source: "cli" });

  store.bookmarks.updateTags(bookmark.id, ["horticulture"]);
  let result = searchCorpus(store, "horticulture", { types: ["bookmark"] });
  assert.equal(result.groups.bookmark[0]?.id, bookmark.id);

  store.bookmarks.delete(bookmark.id);
  result = searchCorpus(store, "horticulture", { types: ["bookmark"] });
  assert.equal(result.total, 0);
  store.database.close();
});

test("FTS operators in the query are inert", () => {
  const store = seed();
  // Would be a syntax error if passed to MATCH raw.
  const result = searchCorpus(store, 'embeddings AND NOT ("*', { limit: 5 });
  assert.ok(result.groups.analysis.length >= 2);
  assert.equal(toMatchQuery("!!! ***"), null);
  store.database.close();
});

test("migrating a v1 database backfills the search index", () => {
  // Build a v1 database with pre-existing rows, as a real upgrade would see.
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(MIGRATIONS[0]?.up ?? "");
  raw.exec("PRAGMA user_version = 1");
  raw.exec(`INSERT INTO posts (id, text, created_at) VALUES ('post_1', 'embeddings rule', 'now')`);
  raw.exec(
    `INSERT INTO analyses (id, post_id, provider, model, topic, summary, intent, concepts_json, mock, created_at)
     VALUES ('ana_1', 'post_1', 'mock', 'm', 'Embeddings', 'sum', 'inform', '[]', 1, 'now')`,
  );

  const result = runMigrations(raw);
  assert.ok(result.applied.includes("fts5-search-index"));
  const row = raw.prepare("SELECT COUNT(*) AS n FROM search_fts WHERE type = 'analysis'").get() as {
    n: number;
  };
  assert.equal(row.n, 1);
  raw.close();
});

test("rebuildSearchIndex restores a cleared index", () => {
  const store = seed();
  store.database.handle.exec("DELETE FROM search_fts");
  assert.equal(searchCorpus(store, "embeddings").total, 0);
  const { indexed } = rebuildSearchIndex(store.database.handle);
  assert.equal(indexed, 3);
  assert.ok(searchCorpus(store, "embeddings").total >= 2);
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

test("recency decay: fresh bookmarks outweigh stale ones with equal base signal", () => {
  const store = new Store(Database.open({ path: ":memory:" }));
  const analyze = (externalId: string, text: string) => {
    const { post } = store.posts.ingest({ text, externalId });
    store.analyses.create({
      postId: post.id,
      provider: "mock",
      model: "m",
      topic: text,
      summary: text,
      intent: "inform",
      concepts: [],
      mock: true,
    });
    return post;
  };

  // Two equally-weighted interests, one saved long ago, one saved recently.
  const stale = analyze("s1", "quantum computing hardware qubits");
  const fresh = analyze("f1", "gardening tomatoes composting soil");
  store.bookmarks.create({ postId: stale.id, tags: ["quantum"], source: "cli" });
  store.bookmarks.create({ postId: fresh.id, tags: ["gardening"], source: "cli" });
  // Age the first bookmark 180 days (3 half-lives -> 1/8 weight).
  const staleBm = store.bookmarks.findByPostId(stale.id);
  const past = new Date(Date.now() - 180 * 86_400_000).toISOString();
  store.database.handle
    .prepare("UPDATE bookmarks SET created_at = ? WHERE id = ?")
    .run(past, staleBm?.id ?? "");

  // Two candidates, each matching one interest with the same token overlap.
  analyze("c1", "quantum computing hardware qubits breakthrough");
  analyze("c2", "gardening tomatoes composting soil guide");

  const result = generateSuggestions(store, { limit: 10 });
  const top = store.posts.findById(result.suggestions[0]?.postId ?? "");
  assert.ok(top?.text.includes("gardening"), `expected fresh interest on top, got: ${top?.text}`);
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
