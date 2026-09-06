import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const subscriptionIds = ['claude-subscription', 'codex-subscription', 'grok-subscription'];
export const loginCommands = { 'claude-subscription': 'claude auth login --claudeai', 'codex-subscription': 'codex login', 'grok-subscription': 'grok login' };
const files = { 'claude-subscription': '.claude/.credentials.json', 'codex-subscription': '.codex/auth.json', 'grok-subscription': '.grok/auth.json' };
const cache = new Map();
const pending = new Map();
const text = (x) => typeof x === 'string' && x.length > 0 ? x : null;
function jwt(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch { return {}; } }
function expiry(value) { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) && n > 0 && n < 8640000000000000 ? n : null; }
export function authError(id) { const error = new Error('Subscription authentication unavailable'); error.publicMessage = `${id} authentication unavailable. Run npm run auth -- login ${id}.`; return error; }
async function load(id, env) {
  const source = path.join(env.WAYFINDER_AUTH_HOME || os.homedir(), files[id]);
  let data;
  try { data = JSON.parse(await readFile(source, 'utf8')); } catch (e) { return { source, found: e.code !== 'ENOENT', reason: e.code === 'ENOENT' ? 'Credential file not found.' : 'Credential file unreadable or invalid.' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { source, found: true, reason: 'Credential file has an unsupported format.' };
  let token, refresh, expires, account, client;
  if (id === 'claude-subscription') { const v = data.claudeAiOauth ?? {}; token = text(v.accessToken); refresh = text(v.refreshToken); expires = expiry(v.expiresAt); if (expiry(v.refreshTokenExpiresAt) < Date.now() && expiry(v.refreshTokenExpiresAt)) refresh = null; }
  if (id === 'codex-subscription') { const v = data.tokens ?? {}; token = text(v.access_token); refresh = text(v.refresh_token); account = text(v.account_id) || jwt(token)['https://api.openai.com/auth']?.chatgpt_account_id; expires = expiry(jwt(token).exp * 1000); }
  if (id === 'grok-subscription') { const entries = Object.entries(data).filter(([k]) => k === 'https://accounts.x.ai/sign-in' || k.startsWith('https://auth.x.ai::')); if (entries.length !== 1) return { source, found: true, reason: 'No unambiguous supported Grok account. Run grok login.' }; const v = entries[0][1] ?? {}; token = text(v.key); expires = expiry(v.expires_at); if (v.oidc_issuer === 'https://auth.x.ai') { refresh = text(v.refresh_token); client = text(v.oidc_client_id); } }
  const cached = cache.get(source);
  if (cached?.original === token) return { ...cached, source, found: true };
  return { source, found: true, token, refresh, expires, account, client, original: token };
}
function usableCredential(id, v, leeway = 0) {
  return Boolean(v.token && (id !== 'codex-subscription' || v.account) && (!v.expires || v.expires > Date.now() + leeway));
}
export async function subscriptionStatus(id, env = process.env) {
  const v = await load(id, env);
  const usable = usableCredential(id, v);
  return { id, status: usable ? 'available' : 'needs-login', reason: usable ? 'Local credential present; remote acceptance not verified.' : v.reason || (v.refresh ? 'Access token expired; refresh will be attempted on the next turn.' : 'Missing or expired subscription token. Sign in with the provider CLI.'), source: files[id], found: v.found, expiresAt: v.expires ? new Date(v.expires).toISOString() : null, loginCommand: loginCommands[id] };
}
export async function subscriptionCredential(id, env = process.env, fetcher = fetch) {
  const v = await load(id, env);
  // A still-valid token without refresh material is usable, even inside the
  // proactive refresh window. Status and turns use the same validity rules.
  if (usableCredential(id, v, v.refresh ? 30000 : 0)) return v;
  if (!v.refresh) throw authError(id);
  if (pending.has(v.source)) return pending.get(v.source);
  const work = (async () => {
    try {
      let url, client;
      if (id === 'claude-subscription') { url = 'https://platform.claude.com/v1/oauth/token'; client = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'; }
      if (id === 'codex-subscription') { url = 'https://auth.openai.com/oauth/token'; client = 'app_EMoamEEZ73f0CkXaXp7hrann'; }
      if (id === 'grok-subscription') {
        if (!v.client) throw authError(id);
        const discovery = await fetcher('https://auth.x.ai/.well-known/openid-configuration', { signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!discovery.ok) throw authError(id);
        url = (await discovery.json()).token_endpoint;
        if (new URL(url).origin !== 'https://auth.x.ai') throw authError(id);
        client = v.client;
      }
      const response = await fetcher(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': id === 'claude-subscription' ? 'application/json' : 'application/x-www-form-urlencoded' }, body: id === 'claude-subscription' ? JSON.stringify({ grant_type: 'refresh_token', refresh_token: v.refresh, client_id: client }) : new URLSearchParams({ grant_type: 'refresh_token', refresh_token: v.refresh, client_id: client }) });
      if (!response.ok) throw authError(id);
      const result = await response.json();
      if (!text(result.access_token) || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw authError(id);
      const expires = expiry(Date.now() + result.expires_in * 1000);
      if (!expires) throw authError(id);
      const fresh = { ...v, token: result.access_token, refresh: text(result.refresh_token) || v.refresh, expires,
        account: text(jwt(result.access_token)['https://api.openai.com/auth']?.chatgpt_account_id) || v.account };
      if (!usableCredential(id, fresh)) throw authError(id);
      cache.set(v.source, fresh);
      return fresh;
    } catch { throw authError(id); }
  })();
  pending.set(v.source, work);
  try { return await work; } finally { pending.delete(v.source); }
}
