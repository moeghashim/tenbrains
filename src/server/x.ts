import type { Account, Post, Media } from "../lib/types";
import { Env, SafeError } from "./env";
import { open, seal } from "./security";

type Tokens = { access_token: string; refresh_token: string; expires_at: number };
export async function exchange(env: Env, params: URLSearchParams): Promise<Tokens> {
  params.set("client_id", env.X_CLIENT_ID);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (env.X_CLIENT_SECRET) headers.Authorization = `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`;
  const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body: params, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new SafeError("X authorization failed. Sign in again.", 502);
  const body = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  if (!body.access_token || !body.refresh_token || !Number.isFinite(body.expires_in)) throw new SafeError("X returned invalid authorization.", 502);
  return { ...body, expires_at: Date.now() + body.expires_in * 1000 };
}
export async function accessToken(env: Env) {
  const row = await env.DB.prepare("SELECT encrypted, version FROM oauth_tokens WHERE owner_id = ?").bind(env.OWNER_X_ID).first<{ encrypted: string; version: number }>();
  if (!row) throw new SafeError("Connect your X account first.", 401);
  const tokens = await open<Tokens>(env, row.encrypted, "tokens");
  if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  // Reserve refresh before contacting X: rotated refresh tokens must never be reused concurrently.
  const lock = await env.DB.prepare("INSERT INTO jobs(name, next_run) VALUES('token-refresh', ?) ON CONFLICT(name) DO UPDATE SET next_run = excluded.next_run WHERE jobs.next_run <= ?").bind(Date.now() + 60000, Date.now()).run();
  if (!lock.meta.changes) throw new SafeError("X session is refreshing. Retry shortly.", 409);
  const current = await env.DB.prepare("SELECT encrypted, version FROM oauth_tokens WHERE owner_id = ?").bind(env.OWNER_X_ID).first<{ encrypted: string; version: number }>();
  if (!current || current.version !== row.version) throw new SafeError("X session changed. Retry.", 409);
  const fresh = await exchange(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
  const saved = await env.DB.prepare("UPDATE oauth_tokens SET encrypted = ?, version = version + 1 WHERE owner_id = ? AND version = ?").bind(await seal(env, fresh, "tokens"), env.OWNER_X_ID, row.version).run();
  if (!saved.meta.changes) throw new SafeError("X session changed. Retry.", 409);
  return fresh.access_token;
}
type XUser = { id: string; username: string; name: string; description?: string; profile_image_url?: string; public_metrics?: { followers_count: number; following_count: number } };
type XPost = { id: string; author_id: string; text: string; created_at?: string; conversation_id?: string; attachments?: { media_keys?: string[] } };
type XMedia = { media_key: string; type: string; url?: string; preview_image_url?: string; duration_ms?: number; variants?: { bit_rate?: number; content_type: string; url: string }[] };
export type XResult = { data?: XPost[]; includes?: { users?: XUser[]; media?: XMedia[] }; meta?: { next_token?: string } };
export async function xget<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.x.com/2/${path}`);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new SafeError(response.status === 429 ? "X rate limit reached. Try later." : "X could not read this content. Check access and try again.", 502);
  const body = await response.json() as T & { errors?: unknown; data?: unknown };
  if (body.errors && !body.data) throw new SafeError("X content is unavailable.", 502);
  return body;
}
export const fields = { "tweet.fields": "created_at,author_id,conversation_id,attachments", expansions: "author_id,attachments.media_keys", "user.fields": "description,profile_image_url,public_metrics", "media.fields": "url,preview_image_url,duration_ms,type,variants" };
export function account(user: XUser): Account {
  return { id: user.id, handle: user.username, name: user.name, bio: user.description || "", avatar: user.profile_image_url, followers: user.public_metrics?.followers_count || 0, following: user.public_metrics?.following_count || 0, tags: [] };
}
export async function profile(token: string, handle: string) {
  const result = await xget<{ data: XUser }>(token, `users/by/username/${encodeURIComponent(handle)}`, { "user.fields": fields["user.fields"] });
  if (!result.data) throw new SafeError("X profile unavailable.", 404);
  return account(result.data);
}
export function normalize(result: XResult): { accounts: Account[]; posts: Post[] } {
  return {
    accounts: (result.includes?.users || []).map(account),
    posts: (result.data || []).map(p => ({ id: p.id, accountId: p.author_id, text: p.text, createdAt: p.created_at || new Date().toISOString(), tags: [...new Set([...p.text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m => m[1].toLowerCase()))], threadId: p.conversation_id, media: (p.attachments?.media_keys || []).flatMap<Media>(k => {
      const m = result.includes?.media?.find(m => m.media_key === k);
      const video = m?.variants?.filter(v => v.content_type === "video/mp4").sort((a,b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0]?.url;
      return m ? [{ type: m.type === "photo" ? "image" as const : "video" as const, url: m.type === "photo" ? m.url || "" : video || m.url || "", poster: m.preview_image_url, duration: m.duration_ms ? m.duration_ms / 1000 : undefined }] : [{ type: "image" as const, url: "" }];
    }) }))
  };
}
export async function conversation(token: string, id: string) {
  const first = await xget<{ data: XPost; includes: XResult["includes"] }>(token, `tweets/${id}`, fields);
  if (!first.data) throw new SafeError("Post unavailable.", 404);
  const initial = normalize({ data: [first.data], includes: first.includes });
  try {
    const result = await xget<XResult>(token, "tweets/search/recent", { ...fields, query: `conversation_id:${first.data.conversation_id || id} from:${first.data.author_id}`, max_results: "20" });
    const found = normalize(result);
    const posts = [...new Map([...initial.posts, ...found.posts.filter(p => p.accountId === first.data.author_id)].map(p => [p.id, p])).values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    if (posts.length > 1) posts.forEach((post, index) => { post.position = index; });
    return { accounts: [...initial.accounts, ...found.accounts], posts, partial: true };
  } catch {
    // Recent search may be unavailable or outside coverage. Never invent a thread count.
    return { ...initial, partial: true };
  }
}
