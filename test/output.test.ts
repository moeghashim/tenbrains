import assert from "node:assert/strict";
import { test } from "node:test";
import { CliError } from "../src/core/errors.js";
import { type Streams, emitError, emitResult } from "../src/core/output.js";

function capture(): { streams: Streams; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    streams: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) },
    out,
    err,
  };
}

test("emitResult writes a success envelope to stdout in json mode", () => {
  const { streams, out, err } = capture();
  emitResult("analyze", { data: { topic: "x" }, meta: { id: "ana_1" } }, "json", streams);
  const parsed = JSON.parse(out.join(""));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "analyze");
  assert.deepEqual(parsed.data, { topic: "x" });
  assert.equal(parsed.meta.id, "ana_1");
  assert.equal(err.length, 0);
});

test("emitResult uses the human renderer in pretty mode", () => {
  const { streams, out } = capture();
  emitResult(
    "x",
    { data: { n: 2 }, human: (d) => `n=${(d as { n: number }).n}` },
    "pretty",
    streams,
  );
  assert.equal(out.join("").trim(), "n=2");
});

test("emitError writes an error envelope to stdout and a summary to stderr", () => {
  const { streams, out, err } = capture();
  emitError(
    "analyze",
    new CliError("NOT_FOUND", "missing", { details: { id: "z" } }),
    "json",
    streams,
  );
  const parsed = JSON.parse(out.join(""));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "NOT_FOUND");
  assert.deepEqual(parsed.error.details, { id: "z" });
  assert.match(err.join(""), /NOT_FOUND: missing/);
});

test("emitError in pretty mode writes only to stderr", () => {
  const { streams, out, err } = capture();
  emitError("x", new CliError("USAGE", "bad"), "pretty", streams);
  assert.equal(out.length, 0);
  assert.match(err.join(""), /USAGE: bad/);
});
