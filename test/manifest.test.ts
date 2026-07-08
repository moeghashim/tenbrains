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
