import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ConfigStore } from "../src/core/config.js";

function tempConfig(): { store: ConfigStore; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tb-cfg-"));
  return { store: new ConfigStore({ configDir: dir }), dir };
}

test("set/get round-trips a nested dot-path value", () => {
  const { store, dir } = tempConfig();
  store.set("providers.openai.apiKey", "sk-abc");
  assert.equal(store.get("providers.openai.apiKey"), "sk-abc");
  rmSync(dir, { recursive: true, force: true });
});

test("config file is written with 0600 permissions", () => {
  const { store, dir } = tempConfig();
  store.set("defaultProvider", "anthropic");
  const mode = statSync(store.filePath).mode & 0o777;
  assert.equal(mode, 0o600);
  rmSync(dir, { recursive: true, force: true });
});

test("entries redact secret keys unless revealed", () => {
  const { store, dir } = tempConfig();
  store.set("providers.anthropic.apiKey", "sk-secret-1234");
  const redacted = store.entries(false).find((e) => e.key.endsWith("apiKey"));
  assert.ok(String(redacted?.value).startsWith("********"));
  assert.ok(String(redacted?.value).endsWith("1234"));
  const revealed = store.entries(true).find((e) => e.key.endsWith("apiKey"));
  assert.equal(revealed?.value, "sk-secret-1234");
  rmSync(dir, { recursive: true, force: true });
});

test("compound secret keys like x.bearerToken are redacted", () => {
  const { store, dir } = tempConfig();
  store.set("x.bearerToken", "AAAAbbbbCCCC1234");
  const entry = store.entries(false).find((e) => e.key === "x.bearerToken");
  assert.ok(String(entry?.value).startsWith("********"));
  assert.ok(String(entry?.value).endsWith("1234"));
  assert.equal(store.getXBearer(), "AAAAbbbbCCCC1234");
  rmSync(dir, { recursive: true, force: true });
});

test("set validates known typed keys", () => {
  const { store, dir } = tempConfig();
  assert.throws(() => store.set("defaultProvider", "nope"), /Unknown provider/);
  rmSync(dir, { recursive: true, force: true });
});

test("unset removes a value and reports false when absent", () => {
  const { store, dir } = tempConfig();
  store.set("providers.xai.apiKey", "k");
  assert.equal(store.unset("providers.xai.apiKey"), true);
  assert.equal(store.get("providers.xai.apiKey"), undefined);
  assert.equal(store.unset("providers.xai.apiKey"), false);
  rmSync(dir, { recursive: true, force: true });
});
