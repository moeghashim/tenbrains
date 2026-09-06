import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { subscriptionCredential, subscriptionStatus } from './subscription-auth.js';
import { createProvider, createProviders } from './providers/index.js';

test('existing routes and subscription provider ids', () => {
  assert.equal(createProvider({}).constructor.name, 'MockProvider');
  assert.equal(createProvider({ ANTHROPIC_API_KEY: 'fake' }).constructor.name, 'AnthropicProvider');
  assert.equal(createProvider({ OPENAI_API_KEY: 'fake' }).constructor.name, 'OpenAIProvider');
  for (const id of ['claude-subscription', 'codex-subscription', 'grok-subscription']) {
    assert.equal(createProvider({ WAYFINDER_PROVIDER: id }).id, id);
    const p = createProviders({ WAYFINDER_PROVIDER: 'mock', WAYFINDER_INTAKE_PROVIDER: id, WAYFINDER_SESSION_PROVIDER: id });
    assert.equal(p.intake.id, id); assert.equal(p.session.id, id);
  }
});

test('refresh is deduplicated, cached only in memory, and errors are redacted', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'ten-brains-auth-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, '.claude'));
  const file = path.join(home, '.claude/.credentials.json');
  await writeFile(file, JSON.stringify({ claudeAiOauth: { accessToken: 'expired-fixture', refreshToken: 'refresh-fixture', expiresAt: 1 } }));
  const env = { WAYFINDER_AUTH_HOME: home }; let calls = 0;
  const fetcher = async (url, request) => { calls++; assert.equal(new URL(url).origin, 'https://platform.claude.com'); assert.equal(request.redirect, 'error'); assert.equal(JSON.parse(request.body).refresh_token, 'refresh-fixture'); return { ok: true, json: async () => ({ access_token: 'fresh-fixture', refresh_token: 'rotated-fixture', expires_in: 3600 }) }; };
  assert.equal((await subscriptionStatus('claude-subscription', env)).status, 'needs-login');
  const results = await Promise.all([subscriptionCredential('claude-subscription', env, fetcher), subscriptionCredential('claude-subscription', env, fetcher)]);
  assert.equal(calls, 1); assert.equal(results[0].token, 'fresh-fixture');
  assert.equal((await subscriptionStatus('claude-subscription', env)).status, 'available');
  await writeFile(file, JSON.stringify({ claudeAiOauth: { accessToken: 'changed-fixture', refreshToken: 'bad-secret', expiresAt: 1 } }));
  await assert.rejects(subscriptionCredential('claude-subscription', env, async () => { throw new Error('bad-secret'); }), e => !e.message.includes('bad-secret') && !e.publicMessage.includes('bad-secret'));
  await writeFile(file, '{invalid secret material');
  assert.equal((await subscriptionStatus('claude-subscription', env)).status, 'needs-login');
  await writeFile(file, 'null');
  assert.equal((await subscriptionStatus('claude-subscription', env)).status, 'needs-login');
});

test('Codex and Grok refresh use trusted endpoints and reject discovery redirects', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'ten-brains-refresh-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, '.codex')); await mkdir(path.join(home, '.grok'));
  const expired = `fixture.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.fixture`;
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: expired, refresh_token: 'fake-refresh', account_id: 'fake-account' } }));
  const grokFile = path.join(home, '.grok/auth.json');
  const grok = { 'https://auth.x.ai::fixture': { key: 'expired-grok', refresh_token: 'fake-refresh', expires_at: '2000-01-01', oidc_issuer: 'https://auth.x.ai', oidc_client_id: 'fixture-client' } };
  await writeFile(grokFile, JSON.stringify(grok));
  const env = { WAYFINDER_AUTH_HOME: home }; const requested = [];
  const fetcher = async (url, request) => {
    requested.push(url); assert.equal(request.redirect, 'error');
    if (url.endsWith('openid-configuration')) return { ok: true, json: async () => ({ token_endpoint: 'https://auth.x.ai/token' }) };
    assert.equal(request.body.get('grant_type'), 'refresh_token');
    return { ok: true, json: async () => ({ access_token: 'fresh-test', expires_in: 3600 }) };
  };
  await subscriptionCredential('codex-subscription', env, fetcher);
  await subscriptionCredential('grok-subscription', env, fetcher);
  assert.deepEqual(requested, ['https://auth.openai.com/oauth/token', 'https://auth.x.ai/.well-known/openid-configuration', 'https://auth.x.ai/token']);
  grok['https://auth.x.ai::fixture'].key = 'new-expired-grok'; await writeFile(grokFile, JSON.stringify(grok));
  let count = 0;
  await assert.rejects(subscriptionCredential('grok-subscription', env, async () => { count++; return { ok: true, json: async () => ({ token_endpoint: 'https://untrusted.example/token' }) }; }), /authentication unavailable/);
  assert.equal(count, 1);
});
