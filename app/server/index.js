import express from 'express';
import { loadServerEnvironment } from './env.js';
import { createProvider } from './providers/index.js';
import { createDiscovery, getDiscovery, initializeStore, saveDiscovery } from './store.js';

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

app.post('/api/discoveries', async (_request, response, next) => {
  try {
    response.status(201).json(await createDiscovery());
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

    const selectedIds = new Set(candidateIds);
    const selected = discovery.staged.filter((candidate) => selectedIds.has(candidate.id));
    if (selected.length !== selectedIds.size) return publicError(response, 400, 'A selected staged item was not found');

    for (const candidate of selected) {
      if (candidate.type === 'destination-draft') {
        discovery.map.destination = candidate.title;
      } else if (candidate.type === 'ticket') {
        discovery.map.openFrontier.push({
          id: candidate.id,
          title: candidate.title,
          type: candidate.ticketType,
          mode: candidate.mode,
          target: candidate.target,
        });
      } else if (candidate.type === 'fog-question') {
        discovery.map.fogOfWar.push({ id: candidate.id, question: candidate.question });
      } else if (candidate.type === 'closed-decision') {
        discovery.map.closedDecisions.push({
          id: candidate.id,
          title: candidate.title,
          confidence: candidate.confidence ?? 'Medium',
          evidence: candidate.evidence ?? [],
        });
      }
    }
    discovery.staged = discovery.staged.filter((candidate) => !selectedIds.has(candidate.id));
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
