import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { analyzeCommand } from "../src/commands/analyze.js";
import { bookmarkAddCommand } from "../src/commands/bookmark.js";
import { learnGenerateCommand } from "../src/commands/learn.js";
import {
  objectiveAddCommand,
  objectiveArchiveCommand,
  objectiveFocusCommand,
  objectiveLinkCommand,
  objectiveListCommand,
  objectiveShowCommand,
  objectiveUnlinkCommand,
} from "../src/commands/objective.js";
import { recordGetCommand } from "../src/commands/record.js";
import { takeawayFollowCommand } from "../src/commands/takeaway.js";
import { RunContext } from "../src/core/context.js";
import { Database } from "../src/db/database.js";
import { MIGRATIONS, runMigrations } from "../src/db/migrations.js";
import { Store } from "../src/db/repositories.js";
import { buildFeynmanTrack } from "../src/domain/learn.js";

function freshStore(): Store {
  return new Store(Database.open({ path: ":memory:" }));
}

function ctxWithTempConfig(): { ctx: RunContext; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tb-objectives-"));
  const ctx = new RunContext({
    json: true,
    pretty: false,
    quiet: true,
    dbPath: ":memory:",
    configDir: dir,
  });
  return { ctx, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("migration v4 creates objectives and the polymorphic link table", () => {
  const store = freshStore();
  assert.equal(store.database.schemaVersion(), 4);
  const tables = store.database.handle
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('objectives', 'objective_links') ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  assert.deepEqual(
    tables.map((row) => row.name),
    ["objective_links", "objectives"],
  );
  assert.equal(store.database.stats().objectives, 0);
  assert.equal(store.database.stats().objective_links, 0);
  store.database.close();
});

test("migration v4 upgrades v3 data without rewriting earlier migrations", () => {
  const handle = new DatabaseSync(":memory:");
  handle.exec("PRAGMA foreign_keys = ON");
  for (const migration of MIGRATIONS.filter(({ version }) => version <= 3)) {
    handle.exec(migration.up);
    handle.exec(`PRAGMA user_version = ${migration.version}`);
  }
  handle
    .prepare("INSERT INTO posts (id, text, created_at) VALUES (?, ?, ?)")
    .run("post_existing", "Existing research", "2026-01-01T00:00:00.000Z");

  const result = runMigrations(handle);

  assert.deepEqual(result, { from: 3, to: 4, applied: ["learning-objectives"] });
  assert.equal(
    (handle.prepare("SELECT text FROM posts WHERE id = ?").get("post_existing") as { text: string })
      .text,
    "Existing research",
  );
  assert.equal(
    (
      handle
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("objective_links") as { n: number }
    ).n,
    1,
  );
  handle.close();
});

test("objectives create stable slugs, ids, descriptions, and reject duplicates", () => {
  const store = freshStore();
  const objective = store.objectives.create({
    name: "Stablecoins & Payments",
    description: "Understand settlement design.",
  });
  assert.match(objective.id, /^obj_/);
  assert.equal(objective.slug, "stablecoins-payments");
  assert.equal(objective.description, "Understand settlement design.");
  assert.equal(objective.status, "active");
  assert.deepEqual(store.objectives.get(objective.id), objective);
  assert.deepEqual(store.objectives.get(objective.slug), objective);
  assert.throws(
    () => store.objectives.create({ name: "Stablecoins & Payments" }),
    (error: unknown) => (error as { code?: string }).code === "CONFLICT",
  );
  store.database.close();
});

test("single-focus invariant holds across create, switch, clear, and archive", () => {
  const store = freshStore();
  const first = store.objectives.create({ name: "Stablecoins", focus: true });
  const second = store.objectives.create({ name: "AI Agents", focus: true });
  assert.equal(store.objectives.get(first.slug)?.isFocus, false);
  assert.equal(store.objectives.focus()?.id, second.id);

  store.objectives.setFocus(first.slug);
  assert.equal(store.objectives.focus()?.id, first.id);
  const focusedRows = store.database.handle
    .prepare("SELECT COUNT(*) AS n FROM objectives WHERE is_focus = 1")
    .get() as { n: number };
  assert.equal(focusedRows.n, 1);

  store.objectives.setFocus(null);
  assert.equal(store.objectives.focus(), null);
  store.objectives.setFocus(second.slug);
  const archived = store.objectives.archive(second.slug);
  assert.equal(archived.status, "archived");
  assert.equal(archived.isFocus, false);
  assert.equal(store.objectives.focus(), null);
  assert.throws(
    () => store.objectives.setFocus(second.slug),
    (error: unknown) => (error as { code?: string }).code === "CONFLICT",
  );
  store.database.close();
});

test("objective links support many-to-many, reverse lookup, unlink, and cascade delete", () => {
  const store = freshStore();
  const stablecoins = store.objectives.create({ name: "Stablecoins" });
  const payments = store.objectives.create({ name: "Payments" });
  const firstPost = store.posts.create({ text: "Settlement layers" });
  const secondPost = store.posts.create({ text: "Payment rails" });

  assert.equal(store.objectives.link(stablecoins.slug, "post", firstPost.id), true);
  assert.equal(store.objectives.link(stablecoins.slug, "post", firstPost.id), false);
  store.objectives.link(payments.slug, "post", firstPost.id);
  store.objectives.link(stablecoins.slug, "post", secondPost.id);
  assert.deepEqual(
    store.objectives.forRecord("post", firstPost.id).map((objective) => objective.slug),
    ["payments", "stablecoins"],
  );
  assert.equal(store.objectives.links(stablecoins.slug).length, 2);
  assert.equal(
    store.objectives.list("active").find((objective) => objective.id === stablecoins.id)?.linkCount,
    2,
  );

  assert.equal(store.objectives.unlink(stablecoins.slug, "post", secondPost.id), true);
  assert.equal(store.objectives.unlink(stablecoins.slug, "post", secondPost.id), false);
  store.database.handle.prepare("DELETE FROM objectives WHERE id = ?").run(stablecoins.id);
  assert.equal(
    store.database.handle
      .prepare("SELECT COUNT(*) AS n FROM objective_links WHERE objective_id = ?")
      .get(stablecoins.id)?.n,
    0,
  );
  store.database.close();
});

test("objective commands manage lifecycle and default show to the current focus", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const added = objectiveAddCommand(ctx, {
      name: "Stablecoins",
      description: "Understand reserves and settlement.",
      focus: true,
    });
    const objective = (added.data as { objective: { id: string; slug: string } }).objective;
    assert.equal(added.meta?.objectiveId, objective.id);
    assert.equal(added.meta?.focused, true);

    const listed = objectiveListCommand(ctx, {});
    assert.equal((listed.data as { count: number }).count, 1);
    const shown = objectiveShowCommand(ctx, {});
    assert.equal(
      (shown.data as { objective: { slug: string }; counts: { total: number } }).objective.slug,
      "stablecoins",
    );
    assert.equal((shown.data as { counts: { total: number } }).counts.total, 0);

    objectiveAddCommand(ctx, { name: "AI Agents" });
    objectiveFocusCommand(ctx, { slug: "ai-agents" });
    assert.equal(ctx.store().objectives.focus()?.slug, "ai-agents");
    objectiveFocusCommand(ctx, { clear: true });
    assert.equal(ctx.store().objectives.focus(), null);
    assert.throws(
      () => objectiveShowCommand(ctx, {}),
      (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
    );

    const archived = objectiveArchiveCommand(ctx, { slug: "stablecoins" });
    assert.equal((archived.data as { objective: { status: string } }).objective.status, "archived");
    assert.equal(
      (objectiveListCommand(ctx, { status: "archived" }).data as { count: number }).count,
      1,
    );
  } finally {
    ctx.close();
    cleanup();
  }
});

test("record get resolves obj_ ids and includes reverse objective tags", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    const objective = store.objectives.create({ name: "Stablecoins" });
    const post = store.posts.create({ text: "Stablecoin reserve design" });
    store.objectives.link(objective.slug, "post", post.id);

    const postResult = recordGetCommand(ctx, { id: post.id });
    assert.deepEqual(
      (
        postResult.data as {
          objectives: Array<{ slug: string }>;
        }
      ).objectives.map((item) => item.slug),
      ["stablecoins"],
    );

    const objectiveResult = recordGetCommand(ctx, { id: objective.id });
    assert.equal((objectiveResult.data as { type: string }).type, "objective");
  } finally {
    ctx.close();
    cleanup();
  }
});

test("objective link/unlink validates records and show groups hydrated records by type", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    const objective = store.objectives.create({ name: "Stablecoins" });
    const post = store.posts.create({ text: "Stablecoin reserve design" });
    const account = store.accounts.create("payments");
    const bookmark = store.bookmarks.create({ postId: post.id, tags: [], source: "test" });
    const analysis = store.analyses.create({
      postId: post.id,
      provider: "mock",
      model: "mock",
      topic: "Stablecoins",
      summary: "Reserve design",
      intent: "Explain",
      concepts: [],
      mock: true,
    });
    const track = store.tracks.create({
      analysisId: analysis.id,
      minutesPerDay: 10,
      ratings: [],
      days: [],
    });

    for (const recordId of [post.id, account.id, bookmark.id, track.id]) {
      const result = objectiveLinkCommand(ctx, {
        objective: objective.slug,
        recordId,
      });
      assert.equal((result.data as { linked: boolean }).linked, true);
      assert.deepEqual(result.meta?.objectives, ["stablecoins"]);
    }

    const shown = objectiveShowCommand(ctx, { slug: objective.slug });
    const records = (
      shown.data as {
        records: {
          posts: unknown[];
          accounts: unknown[];
          bookmarks: unknown[];
          tracks: unknown[];
        };
      }
    ).records;
    assert.deepEqual(
      Object.fromEntries(Object.entries(records).map(([type, values]) => [type, values.length])),
      { posts: 1, accounts: 1, bookmarks: 1, tracks: 1 },
    );

    const unlinked = objectiveUnlinkCommand(ctx, {
      objective: objective.slug,
      recordId: post.id,
    });
    assert.equal((unlinked.data as { unlinked: boolean }).unlinked, true);
    assert.deepEqual(unlinked.meta?.objectives, []);
    assert.throws(
      () =>
        objectiveLinkCommand(ctx, {
          objective: objective.slug,
          recordId: "post_missing",
        }),
      (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
    );
  } finally {
    ctx.close();
    cleanup();
  }
});

test("analyze tags a post and generated track with repeatable explicit objectives", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    store.objectives.create({ name: "Stablecoins" });
    store.objectives.create({ name: "Payments" });
    const result = await analyzeCommand(ctx, {
      provider: "mock",
      text: "Stablecoin settlement and payment rails need resilient reserve designs.",
      learn: true,
      objective: ["stablecoins", "payments"],
    });
    const data = result.data as {
      post: { id: string };
      track: { id: string };
    };
    assert.deepEqual(result.meta?.objectives, ["stablecoins", "payments"]);
    assert.deepEqual(
      store.objectives.forRecord("post", data.post.id).map((objective) => objective.slug),
      ["payments", "stablecoins"],
    );
    assert.deepEqual(
      store.objectives.forRecord("track", data.track.id).map((objective) => objective.slug),
      ["payments", "stablecoins"],
    );
  } finally {
    ctx.close();
    cleanup();
  }
});

test("follow and bookmark tagging stay explicit and report meta.objectives", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    store.objectives.create({ name: "Stablecoins" });
    const followed = takeawayFollowCommand(ctx, {
      username: "payments",
      objective: ["stablecoins"],
    });
    const account = (followed.data as { account: { id: string } }).account;
    assert.deepEqual(followed.meta?.objectives, ["stablecoins"]);
    assert.deepEqual(
      store.objectives.forRecord("account", account.id).map((objective) => objective.slug),
      ["stablecoins"],
    );

    const bookmarked = bookmarkAddCommand(ctx, {
      text: "Stablecoin payment rails",
      objective: ["stablecoins"],
    });
    const data = bookmarked.data as { bookmark: { id: string }; post: { id: string } };
    assert.deepEqual(bookmarked.meta?.objectives, ["stablecoins"]);
    assert.deepEqual(
      store.objectives.forRecord("post", data.post.id).map((objective) => objective.slug),
      ["stablecoins"],
    );
    assert.deepEqual(store.objectives.forRecord("bookmark", data.bookmark.id), []);
  } finally {
    ctx.close();
    cleanup();
  }
});

test("learn inherits source-post objectives unless explicit objectives override them", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    store.objectives.create({
      name: "Inherited Goal",
      description: "Prioritize inherited concepts.",
    });
    store.objectives.create({
      name: "Explicit Goal",
      description: "Prioritize learning concepts.",
    });
    const analyzed = await analyzeCommand(ctx, {
      provider: "mock",
      text: "A source post for an inherited learning objective.",
      objective: ["inherited-goal"],
    });
    const analysis = (analyzed.data as { analysis: { id: string } }).analysis;

    const inherited = learnGenerateCommand(ctx, { analysis: analysis.id });
    const inheritedTrack = (inherited.data as { track: { id: string } }).track;
    assert.deepEqual(inherited.meta?.objectives, ["inherited-goal"]);
    assert.equal(
      (inherited.data as { track: { days: Array<{ concept: string }> } }).track.days[0]?.concept,
      "Inherited",
    );
    assert.deepEqual(
      store.objectives.forRecord("track", inheritedTrack.id).map((objective) => objective.slug),
      ["inherited-goal"],
    );

    const overridden = learnGenerateCommand(ctx, {
      analysis: analysis.id,
      objective: ["explicit-goal"],
    });
    const overriddenTrack = (overridden.data as { track: { id: string } }).track;
    assert.deepEqual(overridden.meta?.objectives, ["explicit-goal"]);
    assert.equal(
      (overridden.data as { track: { days: Array<{ concept: string }> } }).track.days[0]?.concept,
      "Learning",
    );
    assert.deepEqual(
      store.objectives.forRecord("track", overriddenTrack.id).map((objective) => objective.slug),
      ["explicit-goal"],
    );
  } finally {
    ctx.close();
    cleanup();
  }
});

test("unknown objective returns NOT_FOUND before a tagging command writes", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    await assert.rejects(
      analyzeCommand(ctx, {
        provider: "mock",
        text: "This should not persist.",
        objective: ["missing-objective"],
      }),
      (error: unknown) =>
        (error as { code?: string; message?: string }).code === "NOT_FOUND" &&
        (error as { message?: string }).message?.includes("objective add") === true,
    );
    assert.equal(ctx.store().database.stats().posts, 0);
    assert.equal(ctx.store().database.stats().analyses, 0);
  } finally {
    ctx.close();
    cleanup();
  }
});

test("current focus never tags content without an explicit objective", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    store.objectives.create({ name: "Focused Goal", focus: true });
    const result = await analyzeCommand(ctx, {
      provider: "mock",
      text: "Focus is a view, not an implicit tag.",
    });
    const post = (result.data as { post: { id: string } }).post;
    assert.deepEqual(result.meta?.objectives, []);
    assert.deepEqual(store.objectives.forRecord("post", post.id), []);
  } finally {
    ctx.close();
    cleanup();
  }
});

test("objective description lenses analyze --learn concept ordering", async () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    ctx.store().objectives.create({
      name: "Reserve Safety",
      description: "Study reserves and backing.",
    });
    const result = await analyzeCommand(ctx, {
      provider: "mock",
      text: "Consensus validators networks settlement reserves.",
      learn: true,
      objective: ["reserve-safety"],
    });
    const track = (result.data as { track: { days: Array<{ concept: string }> } }).track;
    assert.equal(track.days[0]?.concept, "Reserves");
  } finally {
    ctx.close();
    cleanup();
  }
});

test("a multi-objective track uses maximum overlap against one description", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    store.objectives.create({
      name: "Reserve Models",
      description: "Alpha reserve models",
    });
    store.objectives.create({
      name: "Settlement Rails",
      description: "Beta settlement rails",
    });
    const post = store.posts.create({ text: "A multi-objective source." });
    const analysis = store.analyses.create({
      postId: post.id,
      provider: "mock",
      model: "mock",
      topic: "Financial infrastructure",
      summary: "Reserve and settlement concepts",
      intent: "Explain",
      concepts: [
        {
          name: "Reserve Settlement",
          whyItMattersInTweet: "Connects two goals.",
        },
        {
          name: "Alpha Reserve",
          whyItMattersInTweet: "Matches one goal deeply.",
        },
      ],
      mock: true,
    });

    const result = learnGenerateCommand(ctx, {
      analysis: analysis.id,
      objective: ["reserve-models", "settlement-rails"],
    });
    const track = (result.data as { track: { days: Array<{ concept: string }> } }).track;
    assert.deepEqual(result.meta?.objectives, ["reserve-models", "settlement-rails"]);
    assert.equal(track.days[0]?.concept, "Alpha Reserve");
  } finally {
    ctx.close();
    cleanup();
  }
});

test("objective show reports descriptive learning and research progress counts", () => {
  const { ctx, cleanup } = ctxWithTempConfig();
  try {
    const store = ctx.store();
    const objective = store.objectives.create({ name: "Reserve Safety" });
    const account = store.accounts.create("payments");
    const post = store.posts.create({
      text: "Reserve audit transcript",
      raw: { source: "youtube" },
    });
    store.bookmarks.create({ postId: post.id, tags: [], source: "test" });
    const concepts = [{ name: "Reserve Audits", whyItMattersInTweet: "Checks backing." }];
    const analysis = store.analyses.create({
      postId: post.id,
      provider: "mock",
      model: "mock",
      topic: "Reserve Audits",
      summary: "Audit reserves",
      intent: "Explain",
      concepts,
      mock: true,
    });
    const track = store.tracks.create({
      analysisId: analysis.id,
      minutesPerDay: 10,
      ratings: [],
      days: buildFeynmanTrack(concepts, 10, []),
    });
    const secondTrack = store.tracks.create({
      analysisId: analysis.id,
      minutesPerDay: 15,
      ratings: [],
      days: buildFeynmanTrack(concepts, 15, []),
    });
    store.tracks.markDone(track.id, 1);
    for (let day = 1; day <= 3; day += 1) {
      store.tracks.markDone(secondTrack.id, day);
    }
    store.objectives.link(objective.id, "account", account.id);
    store.objectives.link(objective.id, "post", post.id);
    store.objectives.link(objective.id, "track", track.id);
    store.objectives.link(objective.id, "track", secondTrack.id);

    const shown = objectiveShowCommand(ctx, { slug: objective.slug });
    assert.deepEqual((shown.data as { progress: Record<string, number> }).progress, {
      accountsFollowed: 1,
      postsAnalyzed: 0,
      transcriptsAnalyzed: 1,
      bookmarksSaved: 1,
      learningTracks: 2,
      learningTracksCompleted: 0,
      learningDaysCompleted: 4,
      learningDaysTotal: 14,
    });

    for (let day = 2; day <= 7; day += 1) {
      store.tracks.markDone(track.id, day);
    }
    const completed = objectiveShowCommand(ctx, { slug: objective.slug });
    const progress = (completed.data as { progress: Record<string, number> }).progress;
    assert.equal(progress.learningTracksCompleted, 1);
    assert.equal(progress.learningDaysCompleted, 10);
  } finally {
    ctx.close();
    cleanup();
  }
});
