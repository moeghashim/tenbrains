import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./worker";
import type { DBResult, Env, Statement } from "./env";
import type { AppState, LearnPath } from "../lib/types";
import { hash, seal } from "./security";
import { parseXUrl } from "../lib/url";
import { levelFor, pathProgress } from "../lib/learning";

let db: DatabaseSync, env: Env, session: string;
let network: ReturnType<typeof vi.fn>;
const initial = (): AppState => ({ user: { id: "42", name: "Owner", handle: "owner" }, accounts: [], posts: [{ id: "100", accountId: "42", text: "A source about learning", createdAt: "2026-10-24T00:00:00Z", media: [], tags: ["learning"] }], paths: [], captures: [], followedAccounts: [], followedTags: [] });
function persist(state: AppState) {
  db.prepare("INSERT INTO owner_state(owner_id, data) VALUES('42', ?) ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data").run(JSON.stringify({ storage: 2, user: state.user, lastRefreshed: state.lastRefreshed }));
  db.prepare("DELETE FROM state_entities").run();
  const add = (kind: string, id: string, position: number, data: unknown) => db.prepare("INSERT INTO state_entities VALUES('42', ?, ?, ?, ?)").run(kind, id, position, JSON.stringify(data));
  for (const kind of ["accounts", "posts", "captures"] as const) state[kind].forEach((value, i) => add(kind, value.id, i, value));
  state.paths.forEach(({ explanations, ...path }, i) => {
    add("paths", path.id, i, path);
    explanations.forEach((explanation, n) => add("explanations", `${path.id}:${explanation.id}`, n, { pathId: path.id, explanation }));
  });
  for (const kind of ["followedAccounts", "followedTags"] as const) state[kind].forEach((value, i) => add(kind, value, i, value));
}
function request(path: string, value?: unknown, headers?: Record<string, string>) {
  return worker.fetch(new Request(`https://app.example${path}`, { method: value === undefined ? "GET" : "POST", headers: { cookie: session, ...(value === undefined ? {} : { origin: "https://app.example", "content-type": "application/json" }), ...headers }, body: value === undefined ? undefined : JSON.stringify(value) }), env);
}
async function action(value: unknown) { const response = await request("/api/action", value); return (await response.text()).trim().split("\n").map(line => JSON.parse(line)); }
const completion = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../migrations/0001_backend.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../../migrations/0002_entities.sql", import.meta.url), "utf8"));
  const execute = new Map<Statement, () => DBResult>();
  env = { APP_URL: "https://app.example", OWNER_X_ID: "42", X_CLIENT_ID: "client", SESSION_SECRET: "test-only-not-a-real-secret-1234567890", XAI_API_KEY: "test-key", ASSETS: { fetch: async () => new Response("static") }, DB: { prepare(sql) {
    let args: unknown[] = [];
    const run = () => {
      const query = db.prepare(sql);
      if (query.columns().length) return { meta: {}, results: query.all(...args as never[]) };
      return { meta: { changes: Number(query.run(...args as never[]).changes) } };
    };
    const statement: Statement = { bind(...values) { args = values; return statement; }, async first<T>() { return (db.prepare(sql).get(...args as never[]) || null) as T | null; }, async run() { return run(); } };
    execute.set(statement, run);
    return statement;
  }, async batch(statements) {
    db.exec("BEGIN");
    try { const results = statements.map(s => execute.get(s)!()); db.exec("COMMIT"); return results; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } } };
  persist(initial());
  db.prepare("INSERT INTO sessions VALUES(?, ?, ?)").run(await hash("session-test"), "42", Date.now() + 60000);
  session = `tb_session=${await seal(env, { token: "session-test" }, "session")}`;
  db.prepare("INSERT INTO oauth_tokens(owner_id, encrypted) VALUES(?, ?)").run("42", await seal(env, { access_token: "access-test", refresh_token: "refresh-test", expires_at: Date.now() + 3600000 }, "tokens"));
  network = vi.fn(); vi.stubGlobal("fetch", network);
});
afterEach(() => { vi.unstubAllGlobals(); db.close(); });

describe("URLs", () => {
  it("canonicalizes supported post and profile links", () => {
    expect(parseXUrl("https://twitter.com/owner/status/123?s=20")).toEqual({ type: "post", id: "123", handle: "owner", url: "https://x.com/owner/status/123" });
    expect(parseXUrl("https://x.com/owner/").type).toBe("profile");
  });
  it.each(["http://x.com/owner", "https://x.com.evil.test/owner", "https://x.com@evil.test/owner", "https://evil@x.com/owner", "https://x.com/i/bookmarks", "https://x.com/owner/status/abc", "file:///owner", "https://x.com:444/owner"])("rejects %s", url => expect(() => parseXUrl(url)).toThrow());
});
it("public status exposes flags only, while missing configuration fails closed", async () => {
  expect(await (await request("/api/status")).json()).toEqual({ configured: true, xConfigured: true, aiConfigured: true });
  env.SESSION_SECRET = "";
  expect((await request("/api/state")).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("rejects absent, tampered, expired, and non-owner sessions", async () => {
  expect((await request("/api/state", undefined, { cookie: "" })).status).toBe(401);
  expect((await request("/api/state", undefined, { cookie: session + "bad" })).status).toBe(401);
  db.prepare("UPDATE sessions SET expires_at = 0").run();
  expect((await request("/api/state")).status).toBe(401);
  db.prepare("UPDATE sessions SET expires_at = ?, owner_id = '43'").run(Date.now() + 60000);
  expect((await request("/api/state")).status).toBe(401);
});
it("rejects cross-origin and missing-origin mutations before any upstream request", async () => {
  expect((await request("/api/action", { type: "import" }, { origin: "https://evil.example" })).status).toBe(403);
  expect((await request("/auth/logout", {}, { origin: "" })).status).toBe(403);
  expect(network).not.toHaveBeenCalled();
});
it("issues PKCE with read-only scopes and encrypted secure cookies", async () => {
  const response = await request("/auth/x");
  const location = new URL(response.headers.get("location")!);
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location.searchParams.get("scope")).toBe("tweet.read users.read follows.read bookmark.read offline.access");
  expect(location.searchParams.get("code_challenge")).toHaveLength(43);
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
});
it("rejects OAuth state forgery and non-owner callback without persisting credentials", async () => {
  expect((await request("/auth/callback?state=forged&code=x")).status).toBe(403);
  expect(network).not.toHaveBeenCalled();
  const pending = await seal(env, { state: "expected", verifier: "verifier", expires: Date.now() + 60000 }, "oauth");
  network.mockResolvedValueOnce(Response.json({ access_token: "intruder", refresh_token: "intruder-refresh", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ data: { id: "43", name: "Other", username: "other" } }));
  const before = db.prepare("SELECT encrypted FROM oauth_tokens").get();
  const response = await request("/auth/callback?state=expected&code=x", undefined, { cookie: `tb_oauth=${pending}` });
  expect(response.status).toBe(403);
  expect(db.prepare("SELECT encrypted FROM oauth_tokens").get()).toEqual(before);
  expect(db.prepare("SELECT count(*) AS count FROM sessions").get()?.count).toBe(1);
});
it("logout revokes the server-side session", async () => {
  expect((await request("/auth/logout", {})).status).toBe(204);
  expect((await request("/api/state")).status).toBe(401);
});
it("imports one read-only bookmark page and returns a usable next cursor", async () => {
  network.mockImplementation(async (input: URL, init: RequestInit) => {
    input = new URL(input);
    if (input.hostname === "api.x.ai") {
      const sources = JSON.parse(JSON.parse(init.body as string).messages[1].content).sources;
      return completion({ title: "Bookmark summary", summary: "Saved learning material", posts: sources.map((p: { id: string }) => ({ postId: p.id, tags: ["learning"] })) });
    }
    expect(input.origin + input.pathname).toBe("https://api.x.com/2/users/42/bookmarks");
    expect(input.searchParams.get("max_results")).toBe("20");
    expect(init.method || "GET").toBe("GET");
    return Response.json({ data: [{ id: input.searchParams.has("pagination_token") ? "102" : "101", author_id: "42", text: "bookmarked" }], includes: { users: [{ id: "42", name: "Owner", username: "owner" }] }, meta: { next_token: "page-two" } });
  });
  const first = await action({ type: "import" });
  expect(first.at(-1).nextCursor).toBe("page-two");
  expect(first.at(-1).state.posts).toHaveLength(2);
  const second = await action({ type: "import", cursor: first.at(-1).nextCursor });
  expect(second.at(-1).state.posts).toHaveLength(3);
  expect(new URL(network.mock.calls[2][0]).searchParams.get("pagination_token")).toBe("page-two");
  expect(network).toHaveBeenCalledTimes(4);
});
it("profile capture follows locally with no AI and shared persisted toggle", async () => {
  network.mockResolvedValue(Response.json({ data: { id: "99", name: "Author", username: "author" } }));
  const events = await action({ type: "capture", url: "https://x.com/author" });
  expect(events.at(-1).state.followedAccounts).toEqual(["99"]);
  await action({ type: "followAccount", accountId: "99", follow: false });
  expect((await (await request("/api/state")).json()).followedAccounts).toEqual([]);
  expect(network).toHaveBeenCalledTimes(1);
});
it("detection falls back to a confirmed single post when recent search is unavailable", async () => {
  network.mockResolvedValueOnce(Response.json({ data: { id: "100", author_id: "42", text: "source", conversation_id: "100" }, includes: { users: [{ id: "42", username: "owner", name: "Owner" }] } })).mockResolvedValueOnce(new Response("private upstream details", { status: 403 }));
  const response = await request("/api/detect", { url: "https://x.com/owner/status/100" });
  expect(await response.json()).toMatchObject({ type: "post", count: 1, handle: "owner" });
});
it("validates cited lessons and sends strict non-streaming structured output", async () => {
  const days = Array.from({ length: 5 }, () => ({ concept: "Learn", lesson: "Plain lesson", sourcePostIds: ["100"] }));
  network.mockResolvedValueOnce(completion({ title: "Learning", days, suggestions: [{ postId: "100", minLevel: "Rookie" }] }));
  const result = await action({ type: "learn", postIds: ["100"] });
  expect(result.at(-1).state.paths[0].days).toHaveLength(5);
  expect(result.at(-1).state.paths[0].suggestions).toEqual([{ postId: "100", minLevel: "Rookie" }]);
  expect(result.at(-1).state.paths[0].currentDay).toBe(0);
  expect(network.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
  expect(network.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  const payload = JSON.parse(network.mock.calls[0][1].body);
  expect(payload.stream).toBe(false); expect(payload.response_format.json_schema.strict).toBe(true);
  expect(payload.model).toBe("grok-4.3");
  network.mockResolvedValueOnce(completion({ title: "Fabrication", days: days.map(d => ({ ...d, sourcePostIds: ["fake"] })), suggestions: [] }));
  expect((await action({ type: "learn", postIds: ["100"] })).at(-1).error).toContain("invalid result");
  expect((await (await request("/api/state")).json()).paths).toHaveLength(1);
});
it("uses the configured Grok model for analysis", async () => {
  env.XAI_MODEL = "grok-4.7";
  network.mockResolvedValueOnce(completion({ title: "Learning", summary: "A source summary", tags: ["learning"], sourceNote: "text only", concepts: ["Learning"], isTeachable: true }));
  const result = await action({ type: "analyze", postId: "100" });
  expect(result.at(-1).state.posts[0].analysis.summary).toBe("A source summary");
  expect(JSON.parse(network.mock.calls[0][1].body).model).toBe("grok-4.7");
});
it("reports missing xAI credentials and saves nothing without an upstream call", async () => {
  env.XAI_API_KEY = "";
  expect(await (await request("/api/status")).json()).toEqual({ configured: true, xConfigured: true, aiConfigured: false });
  expect((await action({ type: "learn", postIds: ["100"] })).at(-1).error).toContain("xAI API key");
  expect((await (await request("/api/state")).json()).paths).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});
it.each([4, 8])("rejects %i lessons without saving", async count => {
  network.mockResolvedValue(completion({ title: "Invalid", days: Array.from({ length: count }, () => ({ concept: "x", lesson: "y", sourcePostIds: ["100"] })), suggestions: [] }));
  expect((await action({ type: "learn", postIds: ["100"] })).at(-1).error).toContain("invalid result");
  expect((await (await request("/api/state")).json()).paths).toEqual([]);
});
function path(): LearnPath { return { id: "path", title: "Learning", tag: "learning", sourceLabel: "source", days: Array.from({ length: 5 }, () => ({ concept: "x", lesson: "y", sourcePostIds: ["100"] })), currentDay: 0, explanations: [], suggestions: [] }; }
it("grade 69/70 boundary, repeated failures never revoke completion, score uses shared helper", async () => {
  const state = initial(); state.paths.push(path()); persist(state);
  for (const score of [69, 70, 0]) {
    network.mockResolvedValueOnce(completion({ score, feedback: [{ kind: "gap", text: "Try an example", sourceRef: "100" }] }));
    const result = (await action({ type: "grade", pathId: "path", day: 0, text: "My explanation" })).at(-1).state.paths[0];
    expect(result.currentDay).toBe(score === 69 ? 0 : 1);
    expect(pathProgress(result).completed).toEqual(score === 69 ? [] : [0]);
  }
  expect(pathProgress((await (await request("/api/state")).json()).paths[0]).score).toBe(38);
  expect([24,25,49,50,79,80,100].map(levelFor)).toEqual(["Noob","Rookie","Rookie","Pro","Pro","Ninja","Ninja"]);
});
it.each([-1, 101, 70.5])("rejects invalid grade %s and preserves state", async score => {
  const state = initial(); state.paths.push(path()); persist(state);
  network.mockResolvedValue(completion({ score, feedback: [{ kind: "ok", text: "ok", sourceRef: null }] }));
  expect((await action({ type: "grade", pathId: "path", day: 0, text: "Explanation" })).at(-1).error).toContain("invalid result");
  expect((await (await request("/api/state")).json()).paths[0].explanations).toHaveLength(0);
});
it("conflicting saves return a safe error rather than overwrite newer state", async () => {
  network.mockImplementation(async () => { db.prepare("UPDATE owner_state SET version = version + 1").run(); return completion({ title: "x", summary: "x", tags: [], concepts: [], sourceNote: "x", isTeachable: true }); });
  expect((await action({ type: "analyze", postId: "100" })).at(-1).error).toContain("another request");
  expect((await (await request("/api/state")).json()).posts[0].analysis).toBeUndefined();
});
it("scheduled refresh is bounded and never calls AI; repeat invocation is throttled", async () => {
  const state = initial(); state.followedAccounts = ["1", "2", "3", "4", "5"]; state.followedTags = ["learning"]; persist(state);
  network.mockImplementation(async () => Response.json({ data: [] }));
  await worker.scheduled({}, env); await worker.scheduled({}, env);
  expect(network).toHaveBeenCalledTimes(3);
  expect(network.mock.calls.every(([url]) => new URL(url).hostname === "api.x.com")).toBe(true);
});
it("owner login sets a working encrypted session and stores encrypted tokens only", async () => {
  const pending = await seal(env, { state: "expected", verifier: "verifier", expires: Date.now() + 60000 }, "oauth");
  network.mockResolvedValueOnce(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ data: { id: "42", name: "Owner", username: "owner" } }));
  const response = await request("/auth/callback?state=expected&code=valid", undefined, { cookie: `tb_oauth=${pending}` });
  expect(response.status).toBe(302);
  const cookies = response.headers.getSetCookie();
  session = cookies.find(c => c.startsWith("tb_session="))!.split(";")[0];
  expect(session).not.toContain("new-access");
  expect((await request("/api/state")).status).toBe(200);
  expect(String(db.prepare("SELECT encrypted FROM oauth_tokens").get()?.encrypted)).not.toContain("new-refresh");
  expect((await (await request("/api/state")).json()).posts).toHaveLength(1);
});
it("refreshes expired tokens once and uses the rotated refresh token on the next refresh", async () => {
  db.prepare("UPDATE oauth_tokens SET encrypted = ?").run(await seal(env, { access_token: "expired", refresh_token: "old-refresh", expires_at: 0 }, "tokens"));
  const refreshes: string[] = [];
  network.mockImplementation(async (input: URL | string, init: RequestInit) => {
    if (String(input).includes("oauth2/token")) {
      refreshes.push(new URLSearchParams(init.body as string).get("refresh_token")!);
      return Response.json({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 });
    }
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer fresh");
    return Response.json({ data: [] });
  });
  await action({ type: "import" }); await action({ type: "import" });
  expect(refreshes).toEqual(["old-refresh"]);
  // Advance token expiry without changing its encrypted refresh token.
  const { open } = await import("./security");
  const row = db.prepare("SELECT encrypted FROM oauth_tokens").get()!;
  const saved = await open<{ access_token: string; refresh_token: string; expires_at: number }>(env, String(row.encrypted), "tokens");
  db.prepare("UPDATE oauth_tokens SET encrypted = ?").run(await seal(env, { ...saved, expires_at: 0 }, "tokens"));
  db.prepare("UPDATE jobs SET next_run = 0 WHERE name = 'token-refresh'").run();
  await action({ type: "import" });
  expect(refreshes).toEqual(["old-refresh", "rotated"]);
});
it("media capture states the text-only limitation and preserves actual progress ordering", async () => {
  network.mockResolvedValueOnce(Response.json({ data: { id: "101", author_id: "42", text: "Text to analyze", conversation_id: "101", attachments: { media_keys: ["media"] } }, includes: { users: [{ id: "42", name: "Owner", username: "owner" }], media: [{ media_key: "media", type: "photo", url: "https://pbs.twimg.com/test.jpg" }] } })).mockResolvedValueOnce(Response.json({ data: [] })).mockResolvedValueOnce(completion({ title: "Title", summary: "Summary", tags: ["learning"], sourceNote: "AI note", concepts: ["Concept"], isTeachable: true }));
  const events = await action({ type: "capture", url: "https://x.com/owner/status/101" });
  expect(events.slice(0, -1).map(e => e.stage)).toEqual(["start", "fetch", "analyze", "save"]);
  expect(events.at(-1).state.captures[0].analysis.sourceNote).toBe("text only · media not analyzed");
});
it("upstream errors do not leak their response bodies", async () => {
  network.mockResolvedValue(new Response("SECRET UPSTREAM BODY", { status: 429 }));
  const result = await action({ type: "import" });
  expect(result.at(-1).error).toContain("rate limit");
  expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("zero-based last lesson can be graded first, and all-complete currentDay caps at the final index", async () => {
  const state = initial(); const seven = path();
  seven.days = Array.from({ length: 7 }, (_, i) => ({ concept: `concept-${i}`, lesson: `lesson-${i}`, sourcePostIds: ["100"] }));
  state.paths.push(seven); persist(state);
  network.mockImplementation(async (_input, init) => {
    const learner = JSON.parse(JSON.parse(init.body).messages[1].content).input;
    if (network.mock.calls.length === 1) expect(learner.lesson.concept).toBe("concept-6");
    return completion({ score: 70, feedback: [{ kind: "ok", text: "Accurate", sourceRef: "100" }] });
  });
  const last = (await action({ type: "grade", pathId: "path", day: 6, text: "At my own pace" })).at(-1).state.paths[0];
  expect(last.explanations[0].day).toBe(6); expect(last.currentDay).toBe(0);
  for (let day = 0; day < 6; day++) await action({ type: "grade", pathId: "path", day, text: "Explanation" });
  const saved = (await (await request("/api/state")).json()).paths[0];
  expect(saved.currentDay).toBe(6); expect(pathProgress(saved).completed.sort()).toEqual([0,1,2,3,4,5,6]);
  expect((await request("/api/action", { type: "grade", pathId: "path", day: 7, text: "Out of bounds" })).status).toBe(400);
});
it("import categorizes independently in one AI batch, fills creator tags, and Follow persists imported topics", async () => {
  network.mockImplementation(async (input, init) => {
    if (new URL(input).hostname === "api.x.com") return Response.json({ data: [{ id: "101", author_id: "42", text: "Systems feedback loops" }, { id: "102", author_id: "99", text: "Plant biology", attachments: { media_keys: ["photo"] } }], includes: { users: [{ id: "42", name: "Owner", username: "owner" }, { id: "99", name: "Biologist", username: "biologist" }] } });
    const payload = JSON.parse(init.body);
    expect(payload.stream).toBe(false);
    return completion({ title: "Systems and biology", summary: "Two separate topics in this page.", posts: [{ postId: "101", tags: ["systems-thinking"] }, { postId: "102", tags: ["biology"] }] });
  });
  const imported = (await action({ type: "import" })).at(-1).state;
  expect(network).toHaveBeenCalledTimes(2);
  expect(imported.posts.find((p: { id: string }) => p.id === "101").tags).toEqual(["systems-thinking"]);
  expect(imported.posts.find((p: { id: string }) => p.id === "102").tags).toEqual(["biology"]);
  expect(imported.accounts.find((a: { id: string }) => a.id === "99").tags).toEqual(["biology"]);
  expect(imported.captures[0].analysis.sourceNote).toBe("text only · media not analyzed");
  const followed = (await action({ type: "decide", captureId: imported.captures[0].id, decision: "follow" })).at(-1).state;
  expect(followed.followedTags).toEqual(["systems-thinking", "biology"]);
  expect(followed.followedAccounts).toEqual([]);
  expect(network).toHaveBeenCalledTimes(2);
});
it("empty import avoids AI and provides a useful saved summary", async () => {
  network.mockResolvedValue(Response.json({ data: [] }));
  const saved = (await action({ type: "import" })).at(-1).state;
  expect(network).toHaveBeenCalledTimes(1);
  expect(saved.captures[0].analysis.title).toBe("No bookmarks on this page");
  expect(saved.posts).toHaveLength(1);
});
it.each(["missing", "duplicate", "fabricated"])("rejects %s import source mappings without partial persistence", async invalid => {
  network.mockResolvedValueOnce(Response.json({ data: [{ id: "101", author_id: "42", text: "One" }, { id: "102", author_id: "42", text: "Two" }] }));
  const posts = invalid === "missing" ? [{ postId: "101", tags: ["one"] }] : [{ postId: "101", tags: ["one"] }, { postId: invalid === "duplicate" ? "101" : "fake", tags: ["two"] }];
  network.mockResolvedValueOnce(completion({ title: "Bad map", summary: "Bad map", posts }));
  expect((await action({ type: "import" })).at(-1).error).toBeTruthy();
  const saved = await (await request("/api/state")).json();
  expect(saved.posts).toHaveLength(1); expect(saved.captures).toHaveLength(0);
});
it("new captures and paths lead the arrays; related saved sources get meaningful validated suggestions", async () => {
  const state = initial(); state.paths.push({ ...path(), id: "old-path" });
  state.posts.push({ ...state.posts[0], id: "101", text: "Advanced comparisons and trade-offs" });
  state.captures.push({ id: "old-capture", url: "https://x.com/old", detectedType: "profile", accountId: "old", postIds: [], status: "ready", decision: "follow" });
  persist(state);
  network.mockResolvedValueOnce(Response.json({ data: { id: "99", name: "New", username: "new" } }));
  expect((await action({ type: "capture", url: "https://x.com/new" })).at(-1).state.captures.map((c: { id: string }) => c.id)[1]).toBe("old-capture");
  network.mockImplementation(async (_input, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    expect(input.sources.map((p: { id: string }) => p.id)).toEqual(["100", "101"]);
    expect(input.input.selectedSourceIds).toEqual(["100"]);
    return completion({ title: "New path", days: path().days, suggestions: [{ postId: "101", minLevel: "Pro" }] });
  });
  const learned = (await action({ type: "learn", postIds: ["100"] })).at(-1).state;
  expect(learned.paths[0].title).toBe("New path"); expect(learned.paths[1].id).toBe("old-path");
  expect(learned.paths[0].suggestions).toEqual([{ postId: "101", minLevel: "Pro" }]);
  expect(network).toHaveBeenCalledTimes(2);
});
it("Learn on a saved tag uses the actual tagged posts without X searching", async () => {
  network.mockResolvedValueOnce(completion({ title: "Learning tag", days: path().days, suggestions: [] }));
  const learned = (await action({ type: "learn", tag: "learning" })).at(-1).state.paths[0];
  expect(learned.tag).toBe("learning"); expect(learned.days[0].sourcePostIds).toEqual(["100"]);
  expect(new URL(network.mock.calls[0][0]).hostname).toBe("api.x.ai");
});
it("fabricated suggestion IDs cannot be persisted", async () => {
  network.mockResolvedValueOnce(completion({ title: "Bad suggestions", days: path().days, suggestions: [{ postId: "fake", minLevel: "Ninja" }] }));
  expect((await action({ type: "learn", postIds: ["100"] })).at(-1).error).toContain("invalid result");
  expect((await (await request("/api/state")).json()).paths).toEqual([]);
});
it("concurrent mutations keep one winning revision without partial entity writes", async () => {
  const pending: ((value: Response) => void)[] = [];
  network.mockImplementation(() => new Promise<Response>(resolve => {
    pending.push(resolve);
    if (pending.length === 2) for (const [i, complete] of pending.entries()) complete(completion({ title: "Analysis", summary: "Summary", sourceNote: "text only", tags: [i ? "two" : "one"], concepts: [], isTeachable: true }));
  }));
  const results = await Promise.all([action({ type: "analyze", postId: "100" }), action({ type: "analyze", postId: "100" })]);
  expect(results.filter(events => events.at(-1).error)).toHaveLength(1);
  const saved = await (await request("/api/state")).json();
  expect(saved.posts[0].analysis.tags).toHaveLength(1);
  expect(saved.posts[0].tags.filter((t: string) => t === "one" || t === "two")).toHaveLength(1);
  expect(db.prepare("SELECT version FROM owner_state").get()?.version).toBe(1);
});
it("a failing entity statement rolls back the metadata revision and every batch write", async () => {
  db.exec("CREATE TRIGGER fail_tag BEFORE INSERT ON state_entities WHEN NEW.kind = 'followedTags' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  expect((await action({ type: "followTag", tag: "one", follow: true })).at(-1).error).toBeTruthy();
  expect(db.prepare("SELECT version FROM owner_state").get()?.version).toBe(0);
  expect((await (await request("/api/state")).json()).followedTags).toEqual([]);
});
it("a collection larger than 2MB stays in small per-entity rows and remains writable", async () => {
  const state = initial();
  state.posts = Array.from({ length: 150 }, (_, i) => ({ ...state.posts[0], id: String(i), text: "x".repeat(20000) }));
  expect(JSON.stringify(state).length).toBeGreaterThan(2 * 1024 * 1024);
  persist(state);
  const saved = (await action({ type: "followTag", tag: "learning", follow: true })).at(-1).state;
  expect(saved.posts).toHaveLength(150); expect(saved.followedTags).toEqual(["learning"]);
  expect(db.prepare("SELECT max(length(data)) AS n FROM state_entities").get()?.n).toBeLessThan(30000);
  expect(db.prepare("SELECT length(data) AS n FROM owner_state").get()?.n).toBeLessThan(1000);
});
it("migration preserves old aggregate data and converts legacy one-based explanations", async () => {
  db.close(); db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../migrations/0001_backend.sql", import.meta.url), "utf8"));
  const state = initial(); const legacy = path(); legacy.currentDay = 2;
  legacy.explanations = [{ id: "e", day: 1, text: "Legacy explanation", score: 70, feedback: [], createdAt: "2026-10-24" }];
  state.paths.push(legacy); state.followedTags.push("learning");
  db.prepare("INSERT INTO owner_state(owner_id, data) VALUES('42', ?)").run(JSON.stringify(state));
  db.prepare("INSERT INTO sessions VALUES(?, '42', ?)").run(await hash("session-test"), Date.now() + 60000);
  db.exec(readFileSync(new URL("../../migrations/0002_entities.sql", import.meta.url), "utf8"));
  const saved = await (await request("/api/state")).json();
  expect(saved.posts[0].text).toBe(state.posts[0].text); expect(saved.followedTags).toEqual(["learning"]);
  expect(saved.paths[0].currentDay).toBe(1); expect(saved.paths[0].explanations[0].day).toBe(0);
  expect(pathProgress(saved.paths[0]).completed).toEqual([0]);
});
it("refresh watermarks use numeric BigInt order and source-specific saved IDs only", async () => {
  const state = initial();
  state.followedAccounts = ["42"]; state.followedTags = ["learning"];
  const post = state.posts[0];
  state.posts = [
    { ...post, id: "9", text: "No hashtag" }, { ...post, id: "10", text: "No hashtag" },
    { ...post, id: "invalid-id", text: "No hashtag" },
    { ...post, id: "9007199254740992", accountId: "99", text: "#Learning" },
    { ...post, id: "9007199254740993", accountId: "99", text: "#learning" },
    { ...post, id: "9999999999999999999", accountId: "98", text: "AI categorized learning but no hashtag" }
  ];
  persist(state);
  network.mockImplementation(async () => Response.json({ data: [] }));
  const events = await action({ type: "refresh" });
  const urls = network.mock.calls.map(([url]) => new URL(url));
  expect(urls.find(url => url.pathname.includes("/users/42/"))?.searchParams.get("since_id")).toBe("10");
  expect(urls.find(url => url.pathname.includes("search/recent"))?.searchParams.get("since_id")).toBe("9007199254740993");
  expect(events.some(e => e.message?.includes("hashtag search #learning"))).toBe(true);
  expect(network).toHaveBeenCalledTimes(2);
});
it("new sources omit since_id; an empty follow list does not lookup or refresh tokens", async () => {
  const token = db.prepare("SELECT encrypted FROM oauth_tokens").get()!.encrypted;
  db.prepare("DELETE FROM oauth_tokens").run();
  const noSources = (await action({ type: "refresh" }));
  expect(noSources.some(e => e.message?.includes("Nothing to refresh"))).toBe(true);
  expect(noSources.at(-1).state).toBeTruthy();
  expect(network).not.toHaveBeenCalled();
  expect(db.prepare("SELECT count(*) AS n FROM jobs").get()?.n).toBe(0);
  db.prepare("INSERT INTO oauth_tokens(owner_id, encrypted) VALUES('42', ?)").run(token);
  const state = initial(); state.followedAccounts = ["55"]; state.followedTags = ["new-topic"]; persist(state);
  network.mockImplementation(async () => Response.json({ data: [] }));
  await action({ type: "refresh" });
  expect(network.mock.calls.every(([url]) => !new URL(url).searchParams.has("since_id"))).toBe(true);
  expect(network).toHaveBeenCalledTimes(2);
});
