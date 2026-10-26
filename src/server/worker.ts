import { z } from "zod";
import type { AppState, ProgressEvent } from "../lib/types";
import { parseXUrl } from "../lib/url";
import { actionSchema, refresh, runAction } from "./actions";
import { configured, Env, requireConfig, SafeError } from "./env";
import { authenticated, cookie, csrf, hash, open, random, seal, setCookie, sessionToken } from "./security";
import { load, save } from "./store";
import { conversation, exchange, xget, accessToken, profile } from "./x";

function errorMessage(error: unknown) { return error instanceof SafeError ? error.message : "Request failed safely. Please retry."; }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new SafeError("Expected JSON.", 415);
  const text = await request.text();
  if (text.length > 32768) throw new SafeError("Request too large.", 413);
  try { return JSON.parse(text); } catch { throw new SafeError("Invalid JSON."); }
}
async function auth(request: Request, env: Env, path: string) {
  requireConfig(env);
  if (path === "/auth/x" && request.method === "GET") {
    const state = random(), verifier = random();
    const url = new URL("https://x.com/i/oauth2/authorize");
    Object.entries({ response_type: "code", client_id: env.X_CLIENT_ID, redirect_uri: `${new URL(env.APP_URL).origin}/auth/callback`, scope: "tweet.read users.read follows.read bookmark.read offline.access", state, code_challenge: await hash(verifier), code_challenge_method: "S256" }).forEach(([k,v]) => url.searchParams.set(k,v));
    return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": setCookie(env, "tb_oauth", await seal(env, { state, verifier, expires: Date.now() + 600000 }, "oauth"), 600), "Cache-Control": "no-store" } });
  }
  if (path === "/auth/callback" && request.method === "GET") {
    const url = new URL(request.url);
    let pending: { state: string; verifier: string; expires: number };
    try { pending = await open(env, cookie(request, "tb_oauth") || "", "oauth"); } catch { throw new SafeError("Invalid OAuth session.", 403); }
    if (pending.expires < Date.now() || pending.state !== url.searchParams.get("state") || !url.searchParams.get("code")) throw new SafeError("Invalid OAuth state.", 403);
    const tokens = await exchange(env, new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: `${new URL(env.APP_URL).origin}/auth/callback`, code_verifier: pending.verifier }));
    const me = await xget<{ data: { id: string; name: string; username: string } }>(tokens.access_token, "users/me");
    if (me.data?.id !== env.OWNER_X_ID) throw new SafeError("This app is restricted to its owner.", 403);
    await env.DB.prepare("INSERT INTO oauth_tokens(owner_id, encrypted) VALUES(?, ?) ON CONFLICT(owner_id) DO UPDATE SET encrypted = excluded.encrypted, version = oauth_tokens.version + 1").bind(env.OWNER_X_ID, await seal(env, tokens, "tokens")).run();
    const state: AppState = { user: { id: me.data.id, name: me.data.name, handle: me.data.username }, accounts: [], posts: [], paths: [], captures: [], followedAccounts: [], followedTags: [] };
    await env.DB.prepare("INSERT INTO owner_state(owner_id, data) VALUES(?, ?) ON CONFLICT(owner_id) DO NOTHING").bind(env.OWNER_X_ID, JSON.stringify({ storage: 2, user: state.user })).run();
    const session = random();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
    await env.DB.prepare("INSERT INTO sessions(token_hash, owner_id, expires_at) VALUES(?, ?, ?)").bind(await hash(session), env.OWNER_X_ID, Date.now() + 30 * 86400000).run();
    const headers = new Headers({ Location: new URL(env.APP_URL).origin, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", setCookie(env, "tb_session", await seal(env, { token: session }, "session"), 30 * 86400)); headers.append("Set-Cookie", setCookie(env, "tb_oauth", "", 0));
    return new Response(null, { status: 302, headers });
  }
  if (path === "/auth/logout" && request.method === "POST") {
    csrf(request, env); await authenticated(request, env);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash((await sessionToken(request, env))!)).run();
    return new Response(null, { status: 204, headers: { "Set-Cookie": setCookie(env, "tb_session", "", 0), "Cache-Control": "no-store" } });
  }
  throw new SafeError("Not found.", 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/status" && request.method === "GET") return json({ configured: configured(env), xConfigured: !!(env.X_CLIENT_ID && env.OWNER_X_ID), aiConfigured: !!env.XAI_API_KEY });
      if (path.startsWith("/auth/")) return await auth(request, env, path);
      if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
      await authenticated(request, env);
      if (request.method === "POST") csrf(request, env);
      if (path === "/api/state" && request.method === "GET") return json((await load(env)).state);
      if (path === "/api/detect" && request.method === "POST") {
        const input = z.object({ url: z.string().max(2048) }).safeParse(await body(request));
        if (!input.success) throw new SafeError("Invalid URL request.");
        let url: ReturnType<typeof parseXUrl>;
        try { url = parseXUrl(input.data.url); } catch { throw new SafeError("Use a valid X profile or post URL."); }
        const token = await accessToken(env);
        if (url.type === "profile") { const user = await profile(token, url.handle); return json({ type: "profile", count: 0, handle: user.handle }); }
        const result = await conversation(token, url.id!);
        const post = result.posts.find(p => p.id === url.id)!;
        return json({ type: result.posts.length > 1 ? "thread" : "post", count: result.posts.length, handle: result.accounts.find(a => a.id === post.accountId)?.handle || url.handle, coverage: "Recent-search results may be incomplete; count includes confirmed posts only." });
      }
      if (path === "/api/action" && request.method === "POST") {
        const parsed = actionSchema.safeParse(await body(request));
        if (!parsed.success) throw new SafeError("Invalid action.");
        let canceled = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const emit = (event: ProgressEvent) => { if (!canceled) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); };
            void runAction(env, parsed.data, emit).catch(error => emit({ error: errorMessage(error) })).finally(() => { if (!canceled) controller.close(); });
          },
          cancel() { canceled = true; }
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      throw new SafeError("Not found.", 404);
    } catch (error) { return json({ error: errorMessage(error) }, error instanceof SafeError ? error.status : 500); }
  },
  async scheduled(_event: unknown, env: Env) {
    requireConfig(env);
    const { state, version } = await load(env);
    await refresh(env, state, () => {});
    await save(env, state, version);
  }
};
