import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleThread,
  isFetchMode,
  parseOembedPayload,
  parseThreadSearchPayload,
  parseTweetRef,
} from "../src/x/client.js";

test("parseTweetRef accepts a bare numeric id", () => {
  const ref = parseTweetRef("20");
  assert.equal(ref.id, "20");
  assert.match(ref.url, /status\/20$/);
});

test("parseTweetRef extracts the id from twitter.com and x.com URLs", () => {
  assert.equal(parseTweetRef("https://twitter.com/jack/status/20").id, "20");
  assert.equal(parseTweetRef("https://x.com/jack/status/20?s=21").id, "20");
});

test("parseTweetRef upgrades http to https and tolerates unknown URLs", () => {
  assert.equal(parseTweetRef("http://x.com/jack/status/20").url.startsWith("https:"), true);
  const unknown = parseTweetRef("https://example.com/foo");
  assert.equal(unknown.id, undefined);
});

test("parseTweetRef rejects non-id, non-URL input", () => {
  assert.throws(() => parseTweetRef("not a tweet"), /Could not parse/);
});

test("parseOembedPayload extracts text, author, and id; decodes entities", () => {
  const payload = {
    url: "https://twitter.com/jack/status/20",
    author_name: "jack",
    author_url: "https://twitter.com/jack",
    html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr &amp; saying hi</p>&mdash; jack (@jack) <a href="x">March 21, 2006</a></blockquote>',
  };
  const tweet = parseOembedPayload(payload, payload.url);
  assert.equal(tweet.text, "just setting up my twttr & saying hi");
  assert.equal(tweet.authorUsername, "jack");
  assert.equal(tweet.authorName, "jack");
  assert.equal(tweet.externalId, "20");
});

test("parseOembedPayload converts <br> to newlines and decodes numeric entities", () => {
  const payload = {
    url: "https://x.com/u/status/99",
    author_url: "https://x.com/u/",
    html: "<p>line one<br>it&#39;s two</p>&mdash; u (@u)",
  };
  const tweet = parseOembedPayload(payload, payload.url);
  assert.equal(tweet.text, "line one\nit's two");
  assert.equal(tweet.authorUsername, "u");
});

test("parseOembedPayload extracts the post date from the trailing link", () => {
  const payload = {
    url: "https://twitter.com/u/status/20",
    author_name: "U",
    author_url: "https://twitter.com/u",
    html: '<blockquote><p>just setting up my twttr</p>&mdash; U (@u) <a href="https://twitter.com/u/status/20">March 21, 2006</a></blockquote>',
  };
  const tweet = parseOembedPayload(payload, payload.url);
  assert.equal(tweet.postedAt, "2006-03-21T00:00:00.000Z");
});

test("parseOembedPayload throws when no tweet text is present", () => {
  assert.throws(
    () => parseOembedPayload({ html: "<blockquote></blockquote>" }, "u"),
    /extract tweet text/,
  );
});

test("isFetchMode guards the three modes", () => {
  assert.equal(isFetchMode("auto"), true);
  assert.equal(isFetchMode("oembed"), true);
  assert.equal(isFetchMode("api"), true);
  assert.equal(isFetchMode("nope"), false);
});

test("parseThreadSearchPayload maps replies and drops empty entries", () => {
  const parts = parseThreadSearchPayload(
    {
      data: [
        { id: "102", text: "second", created_at: "2026-07-01T00:01:00Z" },
        { id: "103", text: "" },
        { id: "101", text: "first" },
      ],
    },
    "neo",
  );
  assert.equal(parts.length, 2);
  assert.equal(parts[0]?.url, "https://x.com/neo/status/102");
  assert.equal(parts[0]?.authorUsername, "neo");
});

test("assembleThread dedupes the root and orders parts by snowflake id", () => {
  const root = { text: "root", externalId: "99" };
  const replies = [
    { text: "third", externalId: "101" },
    { text: "root again", externalId: "99" },
    { text: "second", externalId: "100" },
    // A shorter id is numerically smaller even if lexically larger.
    { text: "much later", externalId: "1000" },
  ];
  const parts = assembleThread(root, replies);
  assert.deepEqual(
    parts.map((p) => p.externalId),
    ["99", "100", "101", "1000"],
  );
});
