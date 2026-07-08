import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { importXArchiveCommand } from "../src/commands/import.js";
import { RunContext } from "../src/core/context.js";
import { extractLikes, extractTweets, parseArchiveJs } from "../src/x/archive.js";

test("parseArchiveJs strips the window.YTD prefix and accepts plain JSON", () => {
  const entries = parseArchiveJs('window.YTD.like.part0 = [ { "like": { "tweetId": "1" } } ]');
  assert.equal(entries.length, 1);
  assert.deepEqual(parseArchiveJs("[1, 2]"), [1, 2]);
  assert.throws(() => parseArchiveJs("var x = []"), /window\.YTD/);
});

test("extractLikes and extractTweets keep only entries with text and id", () => {
  const likes = extractLikes([
    { like: { tweetId: "10", fullText: "insightful post", expandedUrl: "https://x.com/i/10" } },
    { like: { tweetId: "11" } }, // no text -> dropped
  ]);
  assert.equal(likes.length, 1);
  assert.equal(likes[0]?.externalId, "10");

  const tweets = extractTweets([
    {
      tweet: { id_str: "20", full_text: "my tweet", created_at: "Wed Oct 10 20:19:24 +0000 2018" },
    },
    { tweet: { id_str: "21", full_text: "" } },
  ]);
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0]?.postedAt, "2018-10-10T20:19:24.000Z");
});

test("import x-archive ingests likes as bookmarked posts and tweets as posts, idempotently", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tb-archive-"));
  const dataDir = path.join(dir, "data");
  mkdirSync(dataDir);
  writeFileSync(
    path.join(dataDir, "account.js"),
    'window.YTD.account.part0 = [ { "account": { "username": "neo" } } ]',
  );
  writeFileSync(
    path.join(dataDir, "like.js"),
    `window.YTD.like.part0 = [
      { "like": { "tweetId": "100", "fullText": "embeddings power retrieval", "expandedUrl": "https://x.com/a/status/100" } },
      { "like": { "tweetId": "101", "fullText": "agents need structured output" } }
    ]`,
  );
  writeFileSync(
    path.join(dataDir, "tweets.js"),
    `window.YTD.tweets.part0 = [
      { "tweet": { "id_str": "200", "full_text": "shipping my CLI", "created_at": "Wed Oct 10 20:19:24 +0000 2018" } }
    ]`,
  );

  const configDir = mkdtempSync(path.join(tmpdir(), "tb-cfg-"));
  const ctx = new RunContext({
    json: true,
    pretty: false,
    quiet: true,
    dbPath: ":memory:",
    configDir,
  });
  try {
    const result = importXArchiveCommand(ctx, { path: dir });
    const data = result.data as Record<string, number | string | null>;
    assert.equal(data.username, "neo");
    assert.equal(data.likesImported, 2);
    assert.equal(data.bookmarksCreated, 2);
    assert.equal(data.tweetsImported, 1);
    assert.equal(ctx.store().database.stats().posts, 3);
    assert.equal(ctx.store().database.stats().bookmarks, 2);

    // Second run dedupes everything.
    const again = importXArchiveCommand(ctx, { path: dir });
    const data2 = again.data as Record<string, number>;
    assert.equal(data2.likesImported, 0);
    assert.equal(data2.tweetsImported, 0);
    assert.equal(data2.deduped, 3);
    assert.equal(ctx.store().database.stats().posts, 3);
  } finally {
    ctx.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});
