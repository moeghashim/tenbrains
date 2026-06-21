import assert from "node:assert/strict";
import { test } from "node:test";
import { isFetchMode, parseOembedPayload, parseTweetRef } from "../src/x/client.js";

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
