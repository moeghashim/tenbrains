import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeynmanTrack, prioritizeConcepts } from "../src/domain/learn.js";
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
