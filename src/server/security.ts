import { Env, SafeError, requireConfig } from "./env";

const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export async function hash(s: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))); }
async function key(env: Env, purpose: string) {
  const secret = purpose === "tokens" ? env.TOKEN_ENCRYPTION_KEY || env.SESSION_SECRET : env.SESSION_SECRET;
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(`${purpose}:${secret}`)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(env: Env, value: unknown, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env, purpose), enc.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}
export async function open<T>(env: Env, value: string, purpose: string): Promise<T> {
  const [iv, cipher] = value.split(".");
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(env, purpose), unb64(cipher))));
}
export function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function setCookie(env: Env, name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(env.APP_URL).protocol === "https:" ? "; Secure" : ""}`;
}
export function csrf(request: Request, env: Env) {
  if (request.headers.get("origin") !== new URL(env.APP_URL).origin) throw new SafeError("Origin rejected.", 403);
}
export async function authenticated(request: Request, env: Env) {
  requireConfig(env);
  const token = await sessionToken(request, env);
  if (!token) throw new SafeError("Sign in with the owner X account.", 401);
  const row = await env.DB.prepare("SELECT owner_id, expires_at FROM sessions WHERE token_hash = ?").bind(await hash(token)).first<{ owner_id: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now() || row.owner_id !== env.OWNER_X_ID) throw new SafeError("Session expired. Sign in again.", 401);
}
export async function sessionToken(request: Request, env: Env) {
  try {
    const value = await open<{ token: string }>(env, cookie(request, "tb_session") || "", "session");
    return typeof value.token === "string" ? value.token : undefined;
  } catch { return undefined; }
}
