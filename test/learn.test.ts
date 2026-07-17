import assert from "node:assert/strict";
import { test } from "node:test";
import { Database } from "../src/db/database.js";
import { Store } from "../src/db/repositories.js";
import {
  buildFeynmanTrack,
  nextPendingDay,
  prioritizeConcepts,
  scheduledDay,
} from "../src/domain/learn.js";
import type { Concept } from "../src/domain/types.js";

const CONCEPTS: Concept[] = [
  { name: "Alpha", whyItMattersInTweet: "a" },
  { name: "Beta", whyItMattersInTweet: "b" },
  { name: "Gamma", whyItMattersInTweet: "c" },
];

test("prioritizeConcepts puts highest interest first", () => {
  const ordered = prioritizeConcepts(CONCEPTS, [
    { concept: "Gamma", familiarity: 1, interest: 5 },
    { concept: "Alpha", familiarity: 1, interest: 2 },
  ]);
  assert.equal(ordered[0]?.name, "Gamma");
});

test("prioritizeConcepts breaks interest ties by novelty (low familiarity first)", () => {
  const ordered = prioritizeConcepts(CONCEPTS, [
    { concept: "Alpha", familiarity: 5, interest: 3 },
    { concept: "Beta", familiarity: 1, interest: 3 },
    { concept: "Gamma", familiarity: 3, interest: 3 },
  ]);
  assert.equal(ordered[0]?.name, "Beta");
});

test("objective token overlap takes precedence while ratings break relevance ties", () => {
  const concepts: Concept[] = [
    {
      name: "Consensus Validators",
      whyItMattersInTweet: "Secures the network.",
    },
    {
      name: "Reserve Audits",
      whyItMattersInTweet: "Checks reserve backing and transparency.",
    },
  ];
  const ordered = prioritizeConcepts(
    concepts,
    [
      { concept: "Consensus Validators", familiarity: 1, interest: 5 },
      { concept: "Reserve Audits", familiarity: 5, interest: 1 },
    ],
    "Understand reserve backing and audit transparency.",
  );
  assert.equal(ordered[0]?.name, "Reserve Audits");
});

test("an unrelated objective description preserves the existing rating order", () => {
  const ordered = prioritizeConcepts(
    CONCEPTS,
    [
      { concept: "Gamma", familiarity: 1, interest: 5 },
      { concept: "Alpha", familiarity: 1, interest: 2 },
    ],
    "Reserve backing transparency",
  );
  assert.equal(ordered[0]?.name, "Gamma");
});

test("buildFeynmanTrack always yields 7 days with all step fields", () => {
  const days = buildFeynmanTrack(CONCEPTS, 10, []);
  assert.equal(days.length, 7);
  for (const day of days) {
    assert.ok(day.learn && day.explain && day.check);
    assert.ok(day.day >= 1 && day.day <= 7);
  }
});

test("buildFeynmanTrack splits minutes into the learn step proportionally", () => {
  const days = buildFeynmanTrack(CONCEPTS, 20, []);
  assert.ok(days[0]?.learn.startsWith("8 min"));
});

test("buildFeynmanTrack returns empty for no concepts", () => {
  assert.deepEqual(buildFeynmanTrack([], 10, []), []);
});

test("nextPendingDay skips done days and returns null when complete", () => {
  const days = buildFeynmanTrack(CONCEPTS, 10, []);
  assert.equal(nextPendingDay(days, []), 1);
  const p = (day: number) => ({ day, notes: null, completedAt: "t" });
  assert.equal(nextPendingDay(days, [p(1), p(2)]), 3);
  // Out-of-order completion: day 2 pending even though 3 is done.
  assert.equal(nextPendingDay(days, [p(1), p(3)]), 2);
  assert.equal(nextPendingDay(days, [1, 2, 3, 4, 5, 6, 7].map(p)), null);
});

test("scheduledDay maps elapsed calendar time to a clamped day number", () => {
  const created = "2026-07-01T12:00:00.000Z";
  assert.equal(scheduledDay(created, new Date("2026-07-01T18:00:00Z"), 7), 1);
  assert.equal(scheduledDay(created, new Date("2026-07-04T12:00:00Z"), 7), 4);
  assert.equal(scheduledDay(created, new Date("2026-08-01T12:00:00Z"), 7), 7); // clamped
});

test("track progress persists via markDone and rides along on reads", () => {
  const store = new Store(Database.open({ path: ":memory:" }));
  const { post } = store.posts.ingest({ text: "track post" });
  const analysis = store.analyses.create({
    postId: post.id,
    provider: "mock",
    model: "m",
    topic: "T",
    summary: "S",
    intent: "I",
    concepts: CONCEPTS,
    mock: true,
  });
  const days = buildFeynmanTrack(CONCEPTS, 10, []);
  const track = store.tracks.create({
    analysisId: analysis.id,
    minutesPerDay: 10,
    ratings: [],
    days,
  });
  assert.deepEqual(track.progress, []);

  const updated = store.tracks.markDone(track.id, 1, "clicked for me");
  assert.equal(updated.progress.length, 1);
  assert.equal(updated.progress[0]?.day, 1);
  assert.equal(updated.progress[0]?.notes, "clicked for me");
  assert.equal(store.tracks.list(10)[0]?.progress.length, 1);
  store.database.close();
});
