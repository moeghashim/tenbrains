import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { digestCommand } from "../src/commands/digest.js";
import { searchCommand } from "../src/commands/search.js";
import { RunContext } from "../src/core/context.js";

function ctxWithTempConfig(): { ctx: RunContext; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tb-objective-filter-"));
  const ctx = new RunContext({
    json: true,
    pretty: false,
    quiet: true,
    dbPath: ":memory:",
    configDir: dir,
  });
  return { ctx, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("search and digest objective filters scope derived records across link types", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    const objective = store.objectives.create({ name: "Scoped Research" });
    const taggedPost = store.posts.create({ text: "objective tagged analysis and bookmark" });
    const untaggedPost = store.posts.create({ text: "objective untagged analysis and bookmark" });
    const directBookmarkPost = store.posts.create({ text: "objective direct bookmark" });
    const createAnalysis = (postId: string, label: string) =>
      store.analyses.create({
        postId,
        provider: "mock",
        model: "mock",
        topic: `Objective ${label}`,
        summary: `Objective ${label} analysis`,
        intent: "Explain",
        concepts: [],
        mock: true,
      });
    const taggedAnalysis = createAnalysis(taggedPost.id, "tagged");
    createAnalysis(untaggedPost.id, "untagged");
    createAnalysis(directBookmarkPost.id, "bookmark-only");

    const taggedAccount = store.accounts.create("tagged-account");
    const untaggedAccount = store.accounts.create("untagged-account");
    const createTakeaway = (accountId: string, label: string) =>
      store.snapshots.create({
        accountId,
        provider: "mock",
        model: "mock",
        summary: `Objective ${label} takeaway`,
        takeaways: [`Objective ${label} insight`],
        sourcePostIds: [],
        mock: true,
      });
    const taggedTakeaway = createTakeaway(taggedAccount.id, "tagged");
    createTakeaway(untaggedAccount.id, "untagged");

    const inheritedBookmark = store.bookmarks.create({
      postId: taggedPost.id,
      tags: ["objective"],
      source: "test",
    });
    store.bookmarks.create({
      postId: untaggedPost.id,
      tags: ["objective"],
      source: "test",
    });
    const directBookmark = store.bookmarks.create({
      postId: directBookmarkPost.id,
      tags: ["objective"],
      source: "test",
    });

    store.objectives.link(objective.id, "post", taggedPost.id);
    store.objectives.link(objective.id, "account", taggedAccount.id);
    store.objectives.link(objective.id, "bookmark", directBookmark.id);

    const searched = searchCommand(ctx, {
      query: "objective",
      objective: objective.slug,
      limit: 10,
    });
    const groups = (
      searched.data as {
        groups: {
          analysis: Array<{ id: string }>;
          takeaway: Array<{ id: string }>;
          bookmark: Array<{ id: string }>;
        };
      }
    ).groups;
    assert.deepEqual(
      groups.analysis.map((hit) => hit.id),
      [taggedAnalysis.id],
    );
    assert.deepEqual(
      groups.takeaway.map((hit) => hit.id),
      [taggedTakeaway.id],
    );
    assert.deepEqual(
      new Set(groups.bookmark.map((hit) => hit.id)),
      new Set([inheritedBookmark.id, directBookmark.id]),
    );
    assert.equal(searched.meta?.objective, objective.slug);

    const digested = digestCommand(ctx, { days: 7, objective: objective.slug });
    assert.deepEqual((digested.data as { counts: Record<string, number> }).counts, {
      analyses: 1,
      takeaways: 1,
      bookmarks: 2,
    });
    assert.equal(digested.meta?.objective, objective.slug);
  } finally {
    ctx.close();
    cleanup();
  }
});

test("search and digest reject unknown objective filters before returning output", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    for (const run of [
      () => searchCommand(ctx, { query: "anything", objective: "missing" }),
      () => digestCommand(ctx, { objective: "missing" }),
    ]) {
      assert.throws(run, (error: unknown) => (error as { code?: string }).code === "NOT_FOUND");
    }
  } finally {
    ctx.close();
    cleanup();
  }
});
