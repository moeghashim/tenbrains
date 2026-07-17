import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  objectiveAddCommand,
  objectiveArchiveCommand,
  objectiveFocusCommand,
  objectiveListCommand,
  objectiveShowCommand,
} from "../src/commands/objective.js";
import { recordGetCommand } from "../src/commands/record.js";
import { RunContext } from "../src/core/context.js";
import { Database } from "../src/db/database.js";
import { MIGRATIONS, runMigrations } from "../src/db/migrations.js";
import { Store } from "../src/db/repositories.js";

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
