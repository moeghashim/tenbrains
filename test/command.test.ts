import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { analyzeCommand } from "../src/commands/analyze.js";
import { recordGetCommand } from "../src/commands/record.js";
import { takeawayFollowCommand, takeawayRefreshCommand } from "../src/commands/takeaway.js";
import { RunContext } from "../src/core/context.js";

function ctxWithTempConfig(): { ctx: RunContext; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tb-cmd-"));
  const ctx = new RunContext({
    json: true,
    pretty: false,
    quiet: true,
    dbPath: ":memory:",
    configDir: dir,
  });
  return { ctx, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("analyzeCommand (mock) persists a post + analysis and returns the envelope payload", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const result = await analyzeCommand(ctx, {
      provider: "mock",
      text: "Agent-first CLIs should emit structured JSON and persist outcomes to a database.",
      id: "tw-int-1",
      author: "neo",
    });
    const data = result.data as { analysis: { id: string; concepts: unknown[] } };
    assert.equal(result.meta?.mock, true);
    assert.equal(result.meta?.persisted, true);
    assert.equal(data.analysis.concepts.length, 5);
    assert.equal(ctx.store().database.stats().analyses, 1);

    // record get resolves the freshly stored analysis by id
    const fetched = recordGetCommand(ctx, { id: data.analysis.id });
    assert.equal((fetched.data as { type: string }).type, "analysis");
  } finally {
    ctx.close();
    cleanup();
  }
});

test("analyzeCommand --learn also persists a 7-day track", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const result = await analyzeCommand(ctx, {
      provider: "mock",
      text: "Prompt caching and context windows matter for agent cost.",
      learn: true,
      minutes: 15,
    });
    const data = result.data as { track?: { days: unknown[]; minutesPerDay: number } };
    assert.ok(data.track);
    assert.equal(data.track?.days.length, 7);
    assert.equal(data.track?.minutesPerDay, 15);
  } finally {
    ctx.close();
    cleanup();
  }
});

test("analyzeCommand surfaces MISSING_CREDENTIALS for a keyless real provider", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    await assert.rejects(
      analyzeCommand(ctx, { provider: "openai", text: "hi" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "MISSING_CREDENTIALS",
    );
  } finally {
    ctx.close();
    cleanup();
  }
});

test("takeaway follow + refresh (mock) stores a snapshot with source posts", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    takeawayFollowCommand(ctx, { username: "@neo", name: "Neo" });
    const posts = JSON.stringify([
      { text: "Shipping agent-first tools.", externalId: "a" },
      { text: "Deterministic JSON output for agents.", externalId: "b" },
      { text: "Local SQLite keeps data private.", externalId: "c" },
    ]);
    const result = await takeawayRefreshCommand(ctx, {
      username: "neo",
      provider: "mock",
      posts,
    });
    const data = result.data as { snapshot: { takeaways: string[]; sourcePostIds: string[] } };
    assert.ok(data.snapshot.takeaways.length >= 3);
    assert.equal(data.snapshot.sourcePostIds.length, 3);
    assert.equal(ctx.store().database.stats().takeaway_snapshots, 1);
  } finally {
    ctx.close();
    cleanup();
  }
});
