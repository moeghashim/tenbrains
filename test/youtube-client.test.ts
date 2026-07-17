import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parsePlayerResponse, parseTimedText, parseVideoRef } from "../src/youtube/client.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

test("parseVideoRef handles YouTube URL variants and bare ids", () => {
  const id = "dQw4w9WgXcQ";
  for (const input of [
    id,
    `https://www.youtube.com/watch?v=${id}&feature=share`,
    `https://youtu.be/${id}?si=fixture`,
    `https://youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
  ]) {
    assert.deepEqual(parseVideoRef(input), {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
});

test("parseVideoRef rejects non-YouTube and malformed inputs", () => {
  assert.throws(() => parseVideoRef("https://example.com/watch?v=dQw4w9WgXcQ"), /YouTube/);
  assert.throws(() => parseVideoRef("too-short"), /YouTube/);
});

test("parsePlayerResponse extracts metadata plus manual and ASR tracks", () => {
  const player = parsePlayerResponse(fixture("youtube-player-captions.html"));
  assert.equal(player.videoId, "dQw4w9WgXcQ");
  assert.equal(player.title, "Fixture video");
  assert.equal(player.author, "Fixture Channel");
  assert.equal(player.uploadDate, "2009-10-25");
  assert.equal(player.durationSeconds, 212);
  assert.deepEqual(
    player.captionTracks.map(({ lang, kind }) => ({ lang, kind })),
    [
      { lang: "en", kind: "manual" },
      { lang: "es", kind: "asr" },
    ],
  );
});

test("parsePlayerResponse returns no tracks when captions are absent", () => {
  assert.deepEqual(
    parsePlayerResponse(fixture("youtube-player-no-captions.html")).captionTracks,
    [],
  );
});

test("parseTimedText flattens XML and decodes entities", () => {
  assert.equal(
    parseTimedText(fixture("youtube-timedtext.xml")),
    'Agents & tools emit "structured" JSON. It\'s reliable.',
  );
});

test("parseTimedText flattens JSON3 segments and decodes entities", () => {
  assert.equal(
    parseTimedText(fixture("youtube-timedtext.json")),
    "Agents & tools emit JSON3. Unicode: 🧠",
  );
});
