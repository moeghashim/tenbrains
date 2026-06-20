import assert from "node:assert/strict";
import { test } from "node:test";
import { hashtags, significantTerms, slugify, tokenSet } from "../src/core/text.js";

test("significantTerms ranks by frequency, drops stopwords and short words", () => {
  const terms = significantTerms("agents agents agents tools tools the and a", 3);
  assert.deepEqual(terms.slice(0, 2), ["agents", "tools"]);
  assert.ok(!terms.includes("the"));
  assert.ok(!terms.includes("and"));
});

test("significantTerms is deterministic and ignores URLs", () => {
  const text = "vector database https://example.com vector embeddings";
  assert.deepEqual(significantTerms(text, 5), significantTerms(text, 5));
  assert.ok(!significantTerms(text, 5).includes("example"));
});

test("slugify normalizes to kebab-case", () => {
  assert.equal(slugify("Large Language Models!"), "large-language-models");
  assert.equal(slugify("#RAG"), "rag");
});

test("tokenSet dedupes and strips hashes", () => {
  const set = tokenSet("#agents agents tools agents");
  assert.ok(set.has("agents"));
  assert.ok(set.has("tools"));
  assert.equal([...set].filter((t) => t === "agents").length, 1);
});

test("hashtags extracts lowercased tags", () => {
  assert.deepEqual(hashtags("Loving #Agents and #LLMs today"), ["agents", "llms"]);
});
