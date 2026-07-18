import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProgram } from "../src/cli.js";
import { buildManifest } from "../src/commands/manifest.js";

interface CommandSpec {
  name: string;
  commands: CommandSpec[];
}

function flattenPaths(specs: CommandSpec[], prefix = ""): string[] {
  return specs.flatMap((spec) => {
    const path = prefix ? `${prefix} ${spec.name}` : spec.name;
    return [path, ...flattenPaths(spec.commands, path)];
  });
}

/**
 * Contract snapshot: the manifest IS the public agent-facing API. Adding a
 * command is fine (extend the list); renaming or removing one, or changing an
 * error/exit code, is a breaking change and should be a deliberate decision.
 */
test("manifest command tree matches the published contract", () => {
  const manifest = buildManifest(buildProgram());
  const paths = flattenPaths(manifest.commands as CommandSpec[]).sort();
  assert.deepEqual(paths, [
    "analyze",
    "analyze get",
    "analyze list",
    "bookmark",
    "bookmark add",
    "bookmark list",
    "bookmark remove",
    "bookmark show",
    "bookmark tag",
    "config",
    "config get",
    "config list",
    "config path",
    "config set",
    "config unset",
    "db",
    "db migrate",
    "db reindex",
    "db reset",
    "db stats",
    "db vacuum",
    "digest",
    "import",
    "import x-archive",
    "learn",
    "learn done",
    "learn generate",
    "learn list",
    "learn show",
    "learn today",
    "manifest",
    "objective",
    "objective add",
    "objective archive",
    "objective focus",
    "objective link",
    "objective list",
    "objective show",
    "objective unlink",
    "record",
    "record get",
    "search",
    "setup",
    "suggest",
    "suggest add",
    "suggest dismiss",
    "suggest generate",
    "suggest list",
    "suggest save",
    "takeaway",
    "takeaway follow",
    "takeaway list",
    "takeaway refresh",
    "takeaway show",
    "takeaway unfollow",
  ]);
});

test("manifest publishes objective flags and the obj_ id prefix", () => {
  const manifest = buildManifest(buildProgram());
  assert.ok(
    (manifest.ids as { prefixes: string[] }).prefixes.includes("obj"),
    "manifest is missing obj_ ids",
  );
  const objective = (
    manifest.commands as Array<{
      name: string;
      commands: Array<{ name: string; options: Array<{ flags: string }> }>;
    }>
  ).find((command) => command.name === "objective");
  const optionsFor = (name: string) =>
    objective?.commands.find((command) => command.name === name)?.options.map((o) => o.flags) ?? [];
  assert.ok(optionsFor("add").includes("--description <text>"));
  assert.ok(optionsFor("add").includes("--focus"));
  assert.ok(optionsFor("list").includes("--status <status>"));
  assert.ok(optionsFor("focus").includes("--clear"));
  assert.ok(optionsFor("link").includes("--objective <slug>"));
  assert.ok(optionsFor("unlink").includes("--objective <slug>"));
});

test("manifest marks every creation-time --objective flag repeatable", () => {
  const manifest = buildManifest(buildProgram());
  const commands = manifest.commands as Array<{
    name: string;
    options: Array<{ flags: string; repeatable: boolean }>;
    commands: Array<{
      name: string;
      options: Array<{ flags: string; repeatable: boolean }>;
    }>;
  }>;
  const option = (
    command: { options: Array<{ flags: string; repeatable: boolean }> } | undefined,
  ) => command?.options.find((item) => item.flags === "--objective <slug>");
  const child = (parent: string, name: string) =>
    commands
      .find((command) => command.name === parent)
      ?.commands.find((item) => item.name === name);

  assert.equal(option(commands.find((command) => command.name === "analyze"))?.repeatable, true);
  assert.equal(option(child("takeaway", "follow"))?.repeatable, true);
  assert.equal(option(child("bookmark", "add"))?.repeatable, true);
  assert.equal(option(child("learn", "generate"))?.repeatable, true);
});

test("repeatable objective options retain every slug in CLI order", () => {
  const analyze = buildProgram().commands.find((command) => command.name() === "analyze");
  assert.ok(analyze);
  analyze.parseOptions(["--objective", "stablecoins", "--objective", "payments"]);
  assert.deepEqual(analyze.opts().objective, ["stablecoins", "payments"]);
});

test("manifest describes the objective learn lens and progress surface", () => {
  const manifest = buildManifest(buildProgram());
  const commands = manifest.commands as Array<{
    name: string;
    commands: Array<{ name: string; description: string }>;
  }>;
  const child = (parent: string, name: string) =>
    commands
      .find((command) => command.name === parent)
      ?.commands.find((command) => command.name === name);

  assert.match(child("learn", "generate")?.description ?? "", /objective descriptions/);
  assert.match(child("objective", "show")?.description ?? "", /progress/);
});

test("manifest error and exit codes are stable", () => {
  const manifest = buildManifest(buildProgram());
  assert.deepEqual(manifest.exitCodes, {
    USAGE: 2,
    NOT_FOUND: 3,
    MISSING_CREDENTIALS: 4,
    CONFIG_ERROR: 4,
    PROVIDER_NETWORK: 5,
    PROVIDER_UNAUTHORIZED: 5,
    PROVIDER_RATE_LIMITED: 5,
    PROVIDER_BAD_OUTPUT: 5,
    PROVIDER_UPSTREAM: 5,
    VALIDATION: 6,
    CONFLICT: 7,
    INTERNAL: 1,
  });
  const codes = manifest.errorCodes as string[];
  assert.ok(codes.includes("MISSING_CREDENTIALS"));
  assert.ok(codes.includes("CONFLICT"));
});

test("analyze manifest exposes YouTube and companion-action flags", () => {
  const manifest = buildManifest(buildProgram());
  const analyze = (
    manifest.commands as Array<{
      name: string;
      options: Array<{ flags: string }>;
    }>
  ).find((command) => command.name === "analyze");
  const flags = analyze?.options.map((option) => option.flags) ?? [];
  for (const expected of ["--lang <code>", "--transcript <text>", "--summarize", "--learn"]) {
    assert.ok(flags.includes(expected), `analyze is missing ${expected}`);
  }
});

test("every command exposes the common output/storage flags", () => {
  const manifest = buildManifest(buildProgram());
  const check = (spec: { name: string; options: Array<{ flags: string }>; commands: never[] }) => {
    const flags = spec.options.map((o) => o.flags).join(" ");
    for (const expected of ["--json", "--pretty", "--quiet", "--db", "--config-dir"]) {
      assert.ok(flags.includes(expected), `${spec.name} is missing ${expected}`);
    }
    for (const child of spec.commands as (typeof spec)[]) {
      check(child);
    }
  };
  for (const spec of manifest.commands as Parameters<typeof check>[0][]) {
    check(spec);
  }
});
