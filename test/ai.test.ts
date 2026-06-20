import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJsonObject } from "../src/ai/json.js";
import { mockAnalysis, mockTakeaway } from "../src/ai/mock.js";
import { AnalysisResultSchema, TakeawayResultSchema } from "../src/domain/schemas.js";

test("mockAnalysis returns a schema-valid result with 5 concepts", () => {
  const result = mockAnalysis(
    "Vector databases and embeddings power semantic retrieval for agents.",
  );
  assert.doesNotThrow(() => AnalysisResultSchema.parse(result));
  assert.equal(result.novelConcepts.length, 5);
  assert.ok(result.topic.length > 0);
});

test("mockAnalysis is deterministic", () => {
  const text = "Prompt caching reduces token costs for repeated agent context windows.";
  assert.deepEqual(mockAnalysis(text), mockAnalysis(text));
});

test("mockTakeaway returns 3-5 takeaways and is schema-valid", () => {
  const result = mockTakeaway([
    { text: "Shipping agent-first tools." },
    { text: "Agents love deterministic JSON output." },
    { text: "Local SQLite keeps everything private." },
  ]);
  assert.doesNotThrow(() => TakeawayResultSchema.parse(result));
  assert.ok(result.takeaways.length >= 3 && result.takeaways.length <= 5);
});

test("extractJsonObject handles fences and surrounding prose", () => {
  const text = 'Here is your result:\n```json\n{"topic":"a","nested":{"x":1}}\n```\nThanks!';
  assert.deepEqual(extractJsonObject(text), { topic: "a", nested: { x: 1 } });
});

test("extractJsonObject respects braces inside strings", () => {
  assert.deepEqual(extractJsonObject('{"summary":"use a } brace"}'), {
    summary: "use a } brace",
  });
});

test("extractJsonObject throws PROVIDER_BAD_OUTPUT on garbage", () => {
  assert.throws(() => extractJsonObject("no json here"), /parseable JSON/);
});
