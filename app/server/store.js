import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

function fileFor(id) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid discovery id');
  return path.join(dataDirectory, `${id}.json`);
}

export async function initializeStore() {
  await mkdir(dataDirectory, { recursive: true });
}

export async function createDiscovery() {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const discovery = {
    id,
    name: 'Untitled discovery',
    status: 'Active',
    createdAt: now,
    updatedAt: now,
    map: {
      destination: null,
      openFrontier: [],
      fogOfWar: [],
      closedDecisions: [],
    },
    sessions: [{ id: crypto.randomUUID(), type: 'intake', status: 'active', createdAt: now }],
    transcripts: {
      intake: [{
        id: crypto.randomUUID(),
        actor: 'Wayfinder',
        text: 'State the idea in one sentence. What needs clarity first?',
        createdAt: now,
      }],
    },
    evidence: [],
    staged: [],
  };
  await saveDiscovery(discovery);
  return discovery;
}

export async function getDiscovery(id) {
  try {
    return JSON.parse(await readFile(fileFor(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveDiscovery(discovery) {
  await initializeStore();
  discovery.updatedAt = new Date().toISOString();
  const target = fileFor(discovery.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(discovery, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return discovery;
}

export async function listDiscoveryIds() {
  await initializeStore();
  return (await readdir(dataDirectory))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5));
}
