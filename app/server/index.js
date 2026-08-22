import express from 'express';
import { loadServerEnvironment } from './env.js';
import { applyCandidates, selectCandidates } from './candidates.js';
import { createProvider } from './providers/index.js';
import { createDiscovery, getDiscovery, initializeStore, listDiscoveries, saveDiscovery } from './store.js';

await loadServerEnvironment();

const port = Number(process.env.PORT ?? 5174);
const app = express();
const provider = createProvider();

app.use(express.json({ limit: '32kb' }));

function sendEvent(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function publicError(response, status, message) {
  response.status(status).json({ error: message });
}

app.post('/api/discoveries', async (request, response, next) => {
  try {
    const name = typeof request.body?.name === 'string' && request.body.name.trim()
      ? request.body.name.trim().slice(0, 80)
      : 'Untitled discovery';
    response.status(201).json(await createDiscovery({ name }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/discoveries', async (_request, response, next) => {
  try {
    response.json(await listDiscoveries());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/discoveries/:id', async (request, response, next) => {
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    let changed = false;
    if (request.body?.name !== undefined) {
      if (typeof request.body.name !== 'string' || !request.body.name.trim()) return publicError(response, 400, 'Discovery name is required');
      discovery.name = request.body.name.trim().slice(0, 80);
      changed = true;
    }
    if (request.body?.status !== undefined) {
      if (!['Active', 'Archived'].includes(request.body.status)) return publicError(response, 400, 'Discovery status is invalid');
      discovery.status = request.body.status;
      changed = true;
    }
    if (!changed) return publicError(response, 400, 'Name or status is required');
    await saveDiscovery(discovery);
    response.json(discovery);
  } catch (error) {
    next(error);
  }
});

app.get('/api/discoveries/:id', async (request, response, next) => {
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    response.json(discovery);
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/intake/messages', async (request, response, next) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!message) return publicError(response, 400, 'Message is required');

  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');

    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    try {
      const now = new Date().toISOString();
      const result = await provider.createIntakeTurn({
        message,
        transcript: discovery.transcripts.intake,
        map: discovery.map,
        staged: discovery.staged,
        onToken: (text) => sendEvent(response, 'token', { text }),
        onCandidate: (candidate) => sendEvent(response, 'candidate', candidate),
      });
      const userEntry = { id: crypto.randomUUID(), actor: 'You', text: message, createdAt: now };
      const wayfinderEntry = { id: crypto.randomUUID(), actor: 'Wayfinder', text: result.reply, createdAt: now };

      discovery.transcripts.intake.push(userEntry, wayfinderEntry);
      const existingIds = new Set(discovery.staged.map((candidate) => candidate.id));
      discovery.staged.push(...result.candidates.filter((candidate) => !existingIds.has(candidate.id)));
      await saveDiscovery(discovery);
      sendEvent(response, 'done', {
        discoveryId: discovery.id,
        message: wayfinderEntry,
        stagedCount: discovery.staged.length,
      });
      response.end();
    } catch (error) {
      sendEvent(response, 'error', {
        message: error.publicMessage ?? 'Wayfinder could not complete this turn. Try again.',
      });
      response.end();
      console.error('Wayfinder provider error', {
        name: error.name ?? 'Error',
        status: error.status,
      });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/intake/approve', async (request, response, next) => {
  const candidateIds = Array.isArray(request.body?.candidateIds)
    ? request.body.candidateIds.filter((id) => typeof id === 'string')
    : [];
  if (candidateIds.length === 0) return publicError(response, 400, 'Select at least one staged item');

  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');

    const selection = selectCandidates(discovery.staged, candidateIds);
    if (!selection) return publicError(response, 400, 'A selected staged item was not found');

    applyCandidates(discovery, selection.selected);
    discovery.staged = discovery.staged.filter((candidate) => !selection.selectedIds.has(candidate.id));
    await saveDiscovery(discovery);
    response.json(discovery);
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/sessions', async (request, response, next) => {
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    const ticketId = typeof request.body?.ticketId === 'string' ? request.body.ticketId : null;
    const ticket = ticketId ? discovery.map.openFrontier.find((item) => item.id === ticketId) : null;
    if (ticketId && (!ticket || ticket.type !== 'Grilling')) {
      return publicError(response, 400, 'Select an approved Grilling ticket');
    }
    const objective = (typeof request.body?.objective === 'string' && request.body.objective.trim()) || ticket?.title;
    const evidenceTarget = (typeof request.body?.evidenceTarget === 'string' && request.body.evidenceTarget.trim()) || ticket?.target;
    const mode = request.body?.mode ?? ticket?.mode ?? 'You + Wayfinder';
    if (!objective || !evidenceTarget) return publicError(response, 400, 'Objective and evidence target are required');
    if (!['You', 'Wayfinder', 'You + Wayfinder'].includes(mode)) return publicError(response, 400, 'Mode is invalid');
    const now = new Date().toISOString();
    const session = {
      id: crypto.randomUUID(),
      type: 'grilling',
      ticketId,
      title: objective,
      objective,
      evidenceTarget,
      mode,
      status: 'active',
      createdAt: now,
      transcript: [{
        id: crypto.randomUUID(),
        actor: 'Wayfinder',
        text: `What concrete example should this session examine first?`,
        createdAt: now,
      }],
      lineOfInquiry: [],
      evidence: [],
      staged: [],
    };
    discovery.sessions.push(session);
    await saveDiscovery(discovery);
    response.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/sessions/:sid/messages', async (request, response, next) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  if (!message) return publicError(response, 400, 'Message is required');
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    const session = discovery.sessions.find((item) => item.id === request.params.sid && item.type === 'grilling');
    if (!session) return publicError(response, 404, 'Session not found');
    response.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    try {
      const now = new Date().toISOString();
      const result = await provider.createSessionTurn({
        message,
        objective: session.objective,
        evidenceTarget: session.evidenceTarget,
        mode: session.mode,
        lineOfInquiry: session.lineOfInquiry,
        transcript: session.transcript,
        evidence: session.evidence,
        map: discovery.map,
        staged: session.staged,
        onToken: (text) => sendEvent(response, 'token', { text }),
        onCandidate: (candidate) => sendEvent(response, 'candidate', candidate),
        onInquiry: (inquiry) => sendEvent(response, 'inquiry', inquiry),
      });
      const userEntry = { id: crypto.randomUUID(), actor: 'You', text: message, createdAt: now };
      const wayfinderEntry = { id: crypto.randomUUID(), actor: 'Wayfinder', text: result.reply, createdAt: now };
      session.transcript.push(userEntry, wayfinderEntry);
      const existingIds = new Set(session.staged.map((candidate) => candidate.id));
      session.staged.push(...result.candidates.filter((candidate) => !existingIds.has(candidate.id)));
      const existingQuestions = new Set(session.lineOfInquiry.map((item) => item.question));
      for (const inquiry of result.inquiries ?? []) {
        if (!existingQuestions.has(inquiry.question)) {
          session.lineOfInquiry.push({ id: crypto.randomUUID(), question: inquiry.question, status: 'suggested' });
        }
      }
      await saveDiscovery(discovery);
      sendEvent(response, 'done', {
        discoveryId: discovery.id,
        sessionId: session.id,
        message: wayfinderEntry,
        stagedCount: session.staged.length,
      });
      response.end();
    } catch (error) {
      sendEvent(response, 'error', { message: error.publicMessage ?? 'Wayfinder could not complete this turn. Try again.' });
      response.end();
      console.error('Wayfinder provider error', { name: error.name ?? 'Error', status: error.status });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/sessions/:sid/evidence', async (request, response, next) => {
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  const sourceTurn = request.body?.sourceTurn;
  if (!text || !['string', 'number'].includes(typeof sourceTurn)) return publicError(response, 400, 'Evidence text and source turn are required');
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    const session = discovery.sessions.find((item) => item.id === request.params.sid && item.type === 'grilling');
    if (!session) return publicError(response, 404, 'Session not found');
    const sourceExists = typeof sourceTurn === 'number'
      ? Boolean(session.transcript[sourceTurn])
      : session.transcript.some((turn) => turn.id === sourceTurn);
    if (!sourceExists) return publicError(response, 400, 'Source turn was not found');
    const evidence = {
      id: `EVID-${crypto.randomUUID()}`,
      text,
      sourceTurn,
      sessionId: session.id,
      createdAt: new Date().toISOString(),
    };
    session.evidence.push(evidence);
    discovery.evidence.push({ ...evidence, source: `Grilling session: ${session.objective}` });
    await saveDiscovery(discovery);
    response.status(201).json(evidence);
  } catch (error) {
    next(error);
  }
});

app.post('/api/discoveries/:id/sessions/:sid/updates/approve', async (request, response, next) => {
  const candidateIds = Array.isArray(request.body?.candidateIds)
    ? request.body.candidateIds.filter((id) => typeof id === 'string')
    : [];
  if (candidateIds.length === 0) return publicError(response, 400, 'Select at least one staged item');
  try {
    const discovery = await getDiscovery(request.params.id);
    if (!discovery) return publicError(response, 404, 'Discovery not found');
    const session = discovery.sessions.find((item) => item.id === request.params.sid && item.type === 'grilling');
    if (!session) return publicError(response, 404, 'Session not found');
    const selection = selectCandidates(session.staged, candidateIds);
    if (!selection) return publicError(response, 400, 'A selected staged item was not found');
    applyCandidates(discovery, selection.selected, { evidenceIds: session.evidence.map((item) => item.id) });
    session.staged = session.staged.filter((candidate) => !selection.selectedIds.has(candidate.id));
    await saveDiscovery(discovery);
    response.json(discovery);
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  if (!response.headersSent) response.status(500).json({ error: 'Server error' });
});

await initializeStore();
app.listen(port, () => {
  console.log(`Ten Brains API listening on http://localhost:${port}`);
});
