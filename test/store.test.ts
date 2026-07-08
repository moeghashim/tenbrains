import assert from "node:assert/strict";
import { test } from "node:test";
import { Database } from "../src/db/database.js";
import { currentSchemaVersion } from "../src/db/migrations.js";
import { Store } from "../src/db/repositories.js";

function freshStore(): Store {
  return new Store(Database.open({ path: ":memory:" }));
}

test("schema migrates to the current version on open", () => {
  const store = freshStore();
  assert.equal(store.database.schemaVersion(), currentSchemaVersion());
  store.database.close();
});

test("posts.ingest dedupes by externalId", () => {
  const store = freshStore();
  const a = store.posts.ingest({ text: "hello", externalId: "x1" });
  const b = store.posts.ingest({ text: "hello again", externalId: "x1" });
  assert.equal(a.deduped, false);
  assert.equal(b.deduped, true);
  assert.equal(a.post.id, b.post.id);
  assert.equal(store.database.stats().posts, 1);
  store.database.close();
});

test("analyses persist and round-trip concepts as JSON", () => {
  const store = freshStore();
  const { post } = store.posts.ingest({ text: "concept post" });
  const analysis = store.analyses.create({
    postId: post.id,
    provider: "mock",
    model: "deterministic-v1",
    topic: "T",
    summary: "S",
    intent: "I",
    concepts: [{ name: "C1", whyItMattersInTweet: "why" }],
    mock: true,
  });
  const loaded = store.analyses.findById(analysis.id);
  assert.equal(loaded?.concepts[0]?.name, "C1");
  assert.equal(loaded?.mock, true);
  assert.equal(store.analyses.latestForPost(post.id)?.id, analysis.id);
  store.database.close();
});

test("bookmarks enforce one-per-post via repo lookup", () => {
  const store = freshStore();
  const { post } = store.posts.ingest({ text: "bm post" });
  store.bookmarks.create({ postId: post.id, tags: ["a", "b"], source: "cli" });
  assert.ok(store.bookmarks.findByPostId(post.id));
  const updated = store.bookmarks.updateTags(store.bookmarks.findByPostId(post.id)?.id ?? "", [
    "c",
  ]);
  assert.deepEqual(updated.tags, ["c"]);
  store.database.close();
});

test("suggestions upsert and respect status transitions", () => {
  const store = freshStore();
  const { post } = store.posts.ingest({ text: "sug post" });
  const s1 = store.suggestions.upsert({ postId: post.id, reason: "r1", score: 1 });
  const s2 = store.suggestions.upsert({ postId: post.id, reason: "r2", score: 5 });
  assert.equal(s1.id, s2.id); // same row
  assert.equal(s2.score, 5);
  store.suggestions.setStatus(s1.id, "dismissed");
  assert.equal(store.suggestions.findById(s1.id)?.status, "dismissed");
  assert.equal(store.suggestions.list("pending", 10).length, 0);
  store.database.close();
});

test("cascading delete removes an account's snapshots", () => {
  const store = freshStore();
  const account = store.accounts.create("neo");
  store.snapshots.create({
    accountId: account.id,
    provider: "mock",
    model: "deterministic-v1",
    summary: "s",
    takeaways: ["t1", "t2", "t3"],
    sourcePostIds: [],
    mock: true,
  });
  assert.equal(store.snapshots.all().length, 1);
  store.accounts.delete(account.id);
  assert.equal(store.snapshots.all().length, 0);
  // The cascade-deleted snapshot must also leave the search index.
  const fts = store.database.handle
    .prepare("SELECT COUNT(*) AS n FROM search_fts WHERE type = 'takeaway'")
    .get() as { n: number };
  assert.equal(fts.n, 0);
  store.database.close();
});
