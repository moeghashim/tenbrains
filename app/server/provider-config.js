import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subscriptionIds, subscriptionStatus } from './subscription-auth.js';

export const providerIds = ['mock', 'anthropic', 'openai', ...subscriptionIds];
export const defaultModels = { mock: 'mock', anthropic: 'claude-sonnet-5', openai: 'gpt-5.6-luna', 'claude-subscription': 'claude-sonnet-5', 'codex-subscription': 'gpt-5.4-mini', 'grok-subscription': 'grok-build' };
const configPath = (env) => env.WAYFINDER_CONFIG_PATH || fileURLToPath(new URL('./provider-config.local.json', import.meta.url));
const validModel = (x) => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(x) && !/^(sk-|eyJ|Bearer)/i.test(x);
export function validateSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new Error('Invalid provider selection');
  for (const [surface, selection] of Object.entries(value)) {
    if (!['intake', 'sessions'].includes(surface) || !selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(k => !['provider', 'model'].includes(k)) || !providerIds.includes(selection.provider) || (selection.model !== undefined && !validModel(selection.model))) throw new Error('Invalid provider selection');
  }
  return Object.fromEntries(Object.entries(value).map(([s, v]) => [s, { provider: v.provider, model: v.model ?? defaultModels[v.provider] }]));
}
export async function loadSelection(env = process.env) { try { return validateSelection(JSON.parse(await readFile(configPath(env), 'utf8'))); } catch { return {}; } }
export async function saveSelection(value, env = process.env) {
  const safe = validateSelection(value); const destination = configPath(env);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, destination);
}
export function routing(env = process.env, saved = {}) {
  return Object.fromEntries(['intake', 'sessions'].map(surface => {
    const prefix = surface === 'sessions' ? 'SESSION' : 'INTAKE';
    const provider = env[`WAYFINDER_${prefix}_PROVIDER`] || env.WAYFINDER_PROVIDER || saved[surface]?.provider || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : 'mock');
    const model = env[`WAYFINDER_${prefix}_MODEL`] || env.WAYFINDER_MODEL || saved[surface]?.model || defaultModels[provider];
    return [surface, { provider: providerIds.includes(provider) ? provider : 'mock', model: validModel(model) ? model : defaultModels[provider] || 'mock' }];
  }));
}
export async function providerStatus(env = process.env, saved = {}) {
  const providers = [{ id: 'mock', status: 'available', reason: 'Deterministic local provider; no login required.' }, ...['anthropic', 'openai'].map(id => ({ id, status: env[id === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'] ? 'available' : 'needs-login', reason: 'Uses the configured API key, not a subscription.' })), ...await Promise.all(subscriptionIds.map(id => subscriptionStatus(id, env)))];
  return { routing: routing(env, saved), providers };
}
