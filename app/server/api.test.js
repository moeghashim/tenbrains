import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer(dataDirectory, overrides = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: appDirectory,
    env: {
      ...process.env,
      PORT: '0',
      TEN_BRAINS_DATA_DIR: dataDirectory,
      WAYFINDER_PROVIDER: 'mock',
      WAYFINDER_INTAKE_PROVIDER: 'mock',
      WAYFINDER_SESSION_PROVIDER: 'mock',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      WAYFINDER_AUTH_HOME: path.join(dataDirectory, 'home'),
      WAYFINDER_CONFIG_PATH: path.join(dataDirectory, 'settings', 'providers.json'),
      WAYFINDER_MODEL: '',
      WAYFINDER_INTAKE_MODEL: '',
      WAYFINDER_SESSION_MODEL: '',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out starting API server${stderr ? `:\n${stderr}` : ''}`));
    }, 10_000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onOutput);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function onOutput(chunk) {
      stdout += chunk;
      const match = stdout.match(/Ten Brains API listening on http:\/\/localhost:(\d+)/);
      if (!match) return;
      cleanup();
      resolve({ child, baseUrl: `http://127.0.0.1:${match[1]}` });
    }

    function onExit(code, signal) {
      cleanup();
      reject(new Error(`API server exited before listening (code ${code}, signal ${signal})${stderr ? `:\n${stderr}` : ''}`));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    child.stdout.on('data', onOutput);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

async function jsonRequest(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

function parseEvents(source) {
  return source.trim().split(/\n\n+/).filter(Boolean).map((block) => {
    const lines = block.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
    const data = lines.filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
    return { event, data: JSON.parse(data) };
  });
}

async function eventRequest(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const source = await response.text();
  return { response, events: parseEvents(source) };
}

const emptyMap = {
  destination: null,
  openFrontier: [],
  fogOfWar: [],
  closedDecisions: [],
};

test('Ten Brains discovery API workflow', async (t) => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'ten-brains-api-'));
  let runningServer;
  t.after(async () => {
    await stopServer(runningServer?.child);
    await rm(dataDirectory, { recursive: true, force: true });
  });
  runningServer = await startServer(dataDirectory);
  const { baseUrl } = runningServer;

  const createdResult = await jsonRequest(baseUrl, '/api/discoveries', {
    method: 'POST',
    body: { name: 'Initial discovery' },
  });
  assert.equal(createdResult.response.status, 201);
  const original = createdResult.body;
  assert.match(original.id, /^[a-f0-9-]{36}$/);
  assert.equal(original.name, 'Initial discovery');
  assert.equal(original.status, 'Active');
  assert.deepEqual(original.map, emptyMap);

  const listResult = await jsonRequest(baseUrl, '/api/discoveries');
  assert.equal(listResult.response.status, 200);
  assert.equal(listResult.body.length, 1);
  assert.deepEqual(listResult.body[0].counts, { open: 0, fog: 0, closed: 0 });
  assert.equal(listResult.body[0].id, original.id);

  const readResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`);
  assert.equal(readResult.response.status, 200);
  assert.deepEqual(readResult.body, original);

  const emptyNameResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`, {
    method: 'PATCH',
    body: { name: '   ' },
  });
  assert.equal(emptyNameResult.response.status, 400);
  assert.deepEqual(emptyNameResult.body, { error: 'Discovery name is required' });

  const renamedResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`, {
    method: 'PATCH',
    body: { name: 'Renamed discovery' },
  });
  assert.equal(renamedResult.response.status, 200);
  assert.equal(renamedResult.body.name, 'Renamed discovery');

  const badStatusResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`, {
    method: 'PATCH',
    body: { status: 'Deleted' },
  });
  assert.equal(badStatusResult.response.status, 400);
  assert.deepEqual(badStatusResult.body, { error: 'Discovery status is invalid' });

  const archivedResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`, {
    method: 'PATCH',
    body: { status: 'Archived' },
  });
  assert.equal(archivedResult.response.status, 200);
  assert.equal(archivedResult.body.status, 'Archived');

  const missingDuplicateResult = await jsonRequest(baseUrl, '/api/discoveries/missing/duplicate', {
    method: 'POST',
  });
  assert.equal(missingDuplicateResult.response.status, 404);
  assert.deepEqual(missingDuplicateResult.body, { error: 'Discovery not found' });

  await delay(5);
  const duplicateResult = await jsonRequest(baseUrl, `/api/discoveries/${original.id}/duplicate`, {
    method: 'POST',
  });
  assert.equal(duplicateResult.response.status, 201);
  const copy = duplicateResult.body;
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, 'Renamed discovery copy');
  assert.equal(copy.status, 'Active');
  assert.notEqual(copy.createdAt, original.createdAt);
  assert.deepEqual(copy.map, archivedResult.body.map);
  assert.deepEqual(copy.sessions, archivedResult.body.sessions);
  assert.deepEqual(copy.transcripts, archivedResult.body.transcripts);
  assert.deepEqual(copy.evidence, archivedResult.body.evidence);
  assert.deepEqual(copy.staged, archivedResult.body.staged);

  const renamedCopyResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}`, {
    method: 'PATCH',
    body: { name: 'Working copy' },
  });
  assert.equal(renamedCopyResult.response.status, 200);
  assert.equal(renamedCopyResult.body.name, 'Working copy');
  const originalAfterCopyRename = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`);
  assert.equal(originalAfterCopyRename.body.name, 'Renamed discovery');
  assert.equal(originalAfterCopyRename.body.status, 'Archived');

  const intakeResult = await eventRequest(baseUrl, `/api/discoveries/${copy.id}/intake/messages`, {
    message: 'A shared briefing tool for support teams',
  });
  assert.equal(intakeResult.response.status, 200);
  assert.match(intakeResult.response.headers.get('content-type') ?? '', /^text\/event-stream/);
  assert.ok(intakeResult.events.some(({ event }) => event === 'token'));
  const intakeCandidates = intakeResult.events.filter(({ event }) => event === 'candidate').map(({ data }) => data);
  assert.equal(intakeCandidates.length, 2);
  assert.equal(intakeResult.events.at(-1).event, 'done');

  const stagedIntakeResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}`);
  assert.equal(stagedIntakeResult.body.staged.length, 2);
  assert.equal(stagedIntakeResult.body.transcripts.intake.length, 3);
  assert.deepEqual(stagedIntakeResult.body.map, emptyMap, 'provider turns must not mutate the map');

  const originalAfterCopyIntake = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`);
  assert.deepEqual(originalAfterCopyIntake.body.map, emptyMap);
  assert.equal(originalAfterCopyIntake.body.staged.length, 0);
  assert.equal(originalAfterCopyIntake.body.transcripts.intake.length, 1);

  const intakeApprovalResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}/intake/approve`, {
    method: 'POST',
    body: { candidateIds: intakeCandidates.map(({ id }) => id) },
  });
  assert.equal(intakeApprovalResult.response.status, 200);
  assert.equal(intakeApprovalResult.body.staged.length, 0);
  assert.equal(intakeApprovalResult.body.map.openFrontier.length, 1);
  assert.equal(intakeApprovalResult.body.map.fogOfWar.length, 1);
  const approvedMap = structuredClone(intakeApprovalResult.body.map);

  const ticket = intakeApprovalResult.body.map.openFrontier[0];
  assert.equal(ticket.type, 'Grilling');
  const sessionCreateResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}/sessions`, {
    method: 'POST',
    body: { ticketId: ticket.id },
  });
  assert.equal(sessionCreateResult.response.status, 201);
  const session = sessionCreateResult.body;
  assert.equal(session.ticketId, ticket.id);
  assert.equal(session.type, 'grilling');
  assert.equal(session.transcript.length, 1);

  const sessionMessageResult = await eventRequest(baseUrl, `/api/discoveries/${copy.id}/sessions/${session.id}/messages`, {
    message: 'Three support leads missed the handoff note',
  });
  assert.equal(sessionMessageResult.response.status, 200);
  assert.ok(sessionMessageResult.events.some(({ event }) => event === 'token'));
  assert.ok(sessionMessageResult.events.some(({ event }) => event === 'inquiry'));
  const sessionCandidates = sessionMessageResult.events.filter(({ event }) => event === 'candidate').map(({ data }) => data);
  assert.equal(sessionCandidates.length, 3);
  assert.equal(sessionMessageResult.events.at(-1).event, 'done');

  const stagedSessionResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}`);
  const stagedSession = stagedSessionResult.body.sessions.find(({ id }) => id === session.id);
  assert.equal(stagedSession.transcript.length, 3);
  assert.equal(stagedSession.staged.length, 3);
  assert.equal(stagedSession.lineOfInquiry.length, 1);
  assert.deepEqual(stagedSessionResult.body.map, approvedMap, 'session turns must not mutate the map');

  const evidenceResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}/sessions/${session.id}/evidence`, {
    method: 'POST',
    body: {
      text: 'Three support leads missed the handoff note',
      sourceTurn: stagedSession.transcript[1].id,
    },
  });
  assert.equal(evidenceResult.response.status, 201);
  assert.match(evidenceResult.body.id, /^EVID-/);
  assert.equal(evidenceResult.body.sessionId, session.id);

  const evidenceStoredResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}`);
  const evidenceSession = evidenceStoredResult.body.sessions.find(({ id }) => id === session.id);
  assert.equal(evidenceSession.evidence.length, 1);
  assert.equal(evidenceStoredResult.body.evidence.length, 1);
  assert.deepEqual(evidenceStoredResult.body.map, approvedMap, 'capturing evidence must not mutate the map');

  const updatesApprovalResult = await jsonRequest(baseUrl, `/api/discoveries/${copy.id}/sessions/${session.id}/updates/approve`, {
    method: 'POST',
    body: { candidateIds: sessionCandidates.map(({ id }) => id) },
  });
  assert.equal(updatesApprovalResult.response.status, 200);
  const updatedSession = updatesApprovalResult.body.sessions.find(({ id }) => id === session.id);
  assert.equal(updatedSession.staged.length, 0);
  assert.equal(updatesApprovalResult.body.map.openFrontier.length, 2);
  assert.equal(updatesApprovalResult.body.map.fogOfWar.length, 2);
  assert.equal(updatesApprovalResult.body.map.closedDecisions.length, 1);
  const addedTicket = updatesApprovalResult.body.map.openFrontier.find(({ id }) => id === sessionCandidates.find(({ type }) => type === 'ticket').id);
  const addedQuestion = updatesApprovalResult.body.map.fogOfWar.find(({ id }) => id === sessionCandidates.find(({ type }) => type === 'fog-question').id);
  assert.deepEqual(addedTicket.evidence, [evidenceResult.body.id]);
  assert.deepEqual(addedQuestion.evidence, [evidenceResult.body.id]);
  assert.deepEqual(updatesApprovalResult.body.map.closedDecisions[0].evidence, [evidenceResult.body.id]);

  const originalAtEnd = await jsonRequest(baseUrl, `/api/discoveries/${original.id}`);
  assert.deepEqual(originalAtEnd.body.map, emptyMap, 'mutating a duplicate must not change its source');
  assert.equal(originalAtEnd.body.sessions.length, 1);
  assert.equal(originalAtEnd.body.evidence.length, 0);

  const persistedFiles = (await readdir(dataDirectory)).filter((name) => name.endsWith('.json'));
  assert.equal(persistedFiles.length, 2);
});

test('provider status, redaction, selection persistence and subscription SSE errors', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ten-brains-providers-'));
  let server;
  t.after(async () => { await stopServer(server?.child); await rm(directory, { recursive: true, force: true }); });
  const home = path.join(directory, 'home');
  const secrets = ['sk-ant-secret-test-access', 'refresh-secret-test', 'grok-secret-test', 'codex-secret-test'];
  for (const name of ['.claude', '.codex', '.grok']) await mkdir(path.join(home, name), { recursive: true });
  await writeFile(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: secrets[0], refreshToken: secrets[1], expiresAt: Date.now() + 3600000 } }));
  await writeFile(path.join(home, '.codex/auth.json'), JSON.stringify({ tokens: { access_token: secrets[3], refresh_token: secrets[1], account_id: 'private-account' } }));
  await writeFile(path.join(home, '.grok/auth.json'), JSON.stringify({ 'https://auth.x.ai::fixture': { key: secrets[2], expires_at: new Date(Date.now() + 3600000).toISOString() } }));
  const overrides = { WAYFINDER_PROVIDER: '', WAYFINDER_INTAKE_PROVIDER: '', WAYFINDER_SESSION_PROVIDER: '' };
  server = await startServer(directory, overrides);
  const status = await jsonRequest(server.baseUrl, '/api/providers');
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.body.routing, { intake: { provider: 'mock', model: 'mock' }, sessions: { provider: 'mock', model: 'mock' } });
  for (const id of ['claude-subscription', 'codex-subscription', 'grok-subscription']) {
    const auth = status.body.providers.find(p => p.id === id);
    assert.equal(auth.status, 'available'); assert.equal(auth.found, true);
  }
  for (const secret of [...secrets, 'private-account', 'accessToken', 'refresh_token']) assert.ok(!JSON.stringify(status.body).includes(secret));
  const changed = await jsonRequest(server.baseUrl, '/api/providers', { method: 'PATCH', body: { intake: { provider: 'claude-subscription', model: 'claude-sonnet-5' }, sessions: { provider: 'grok-subscription' } } });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.routing.sessions.provider, 'grok-subscription');
  const persisted = await readFile(path.join(directory, 'settings/providers.json'), 'utf8');
  for (const secret of secrets) assert.ok(!persisted.includes(secret));
  for (const body of [{ intake: { provider: 'invalid' } }, { intake: { provider: 'mock', token: secrets[0] } }, { intake: { provider: 'mock', model: secrets[0] } }, { session: { provider: 'mock' } }]) {
    const invalid = await jsonRequest(server.baseUrl, '/api/providers', { method: 'PATCH', body });
    assert.equal(invalid.response.status, 400);
    assert.ok(!JSON.stringify(invalid.body).includes(secrets[0]));
  }
  await stopServer(server.child); server = await startServer(directory, overrides);
  assert.equal((await jsonRequest(server.baseUrl, '/api/providers')).body.routing.intake.provider, 'claude-subscription');
  await stopServer(server.child); server = await startServer(directory, { ...overrides, WAYFINDER_PROVIDER: 'mock', WAYFINDER_SESSION_PROVIDER: 'codex-subscription', WAYFINDER_MODEL: 'env-model' });
  const envStatus = (await jsonRequest(server.baseUrl, '/api/providers')).body;
  assert.deepEqual(envStatus.routing.intake, { provider: 'mock', model: 'env-model' });
  assert.deepEqual(envStatus.routing.sessions, { provider: 'codex-subscription', model: 'env-model' });
  await stopServer(server.child); server = await startServer(directory, overrides);
  await rm(home, { recursive: true, force: true });
  const discovery = (await jsonRequest(server.baseUrl, '/api/discoveries', { method: 'POST', body: {} })).body;
  for (const id of ['claude-subscription', 'codex-subscription', 'grok-subscription']) {
    await jsonRequest(server.baseUrl, '/api/providers', { method: 'PATCH', body: { intake: { provider: id } } });
    const result = await eventRequest(server.baseUrl, `/api/discoveries/${discovery.id}/intake/messages`, { message: 'Test missing login' });
    assert.deepEqual(result.events.map(e => e.event), ['error']);
    assert.match(result.events[0].data.message, /login/);
  }
  const session = (await jsonRequest(server.baseUrl, `/api/discoveries/${discovery.id}/sessions`, { method: 'POST', body: { objective: 'Test evidence', evidenceTarget: 'One example' } })).body;
  const sessionFailure = await eventRequest(server.baseUrl, `/api/discoveries/${discovery.id}/sessions/${session.id}/messages`, { message: 'An example' });
  assert.deepEqual(sessionFailure.events.map(e => e.event), ['error']);
  const after = (await jsonRequest(server.baseUrl, `/api/discoveries/${discovery.id}`)).body;
  assert.deepEqual(after.map, emptyMap); assert.equal(after.transcripts.intake.length, 1);
  const missing = (await jsonRequest(server.baseUrl, '/api/providers')).body;
  assert.equal(missing.providers.find(p => p.id === 'claude-subscription').status, 'needs-login');
});
