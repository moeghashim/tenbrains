import type { AppState, Account, Post, Explanation } from "../lib/types";
import { Env, SafeError } from "./env";

type Entity = { kind: string; entity_id: string; position: number; data: string };
const snapshots = new WeakMap<AppState, Map<string, Entity>>();
const entityKey = (e: Entity) => `${e.kind}:${e.entity_id}`;
function entities(state: AppState) {
  const rows: Entity[] = [];
  const add = (kind: string, entity_id: string, position: number, value: unknown) => rows.push({ kind, entity_id, position, data: JSON.stringify(value) });
  for (const kind of ["accounts", "posts", "captures"] as const) state[kind].forEach((value, i) => add(kind, value.id, i, value));
  state.paths.forEach(({ explanations, ...path }, i) => {
    add("paths", path.id, i, path);
    explanations.forEach((explanation, n) => add("explanations", `${path.id}:${explanation.id}`, n, { pathId: path.id, explanation }));
  });
  for (const kind of ["followedAccounts", "followedTags"] as const) state[kind].forEach((value, i) => add(kind, value, i, value));
  return new Map(rows.map(e => [entityKey(e), e]));
}
export async function load(env: Env) {
  // Read metadata and entity rows in one snapshot, not two independently racing requests.
  const result = await env.DB.batch([
    env.DB.prepare("SELECT data, version FROM owner_state WHERE owner_id = ?").bind(env.OWNER_X_ID),
    env.DB.prepare("SELECT kind, entity_id, position, data FROM state_entities WHERE owner_id = ? ORDER BY position, entity_id").bind(env.OWNER_X_ID)
  ]);
  const row = result[0].results?.[0] as { data: string; version: number } | undefined;
  if (!row) throw new SafeError("Connect your X account first.", 401);
  const meta = JSON.parse(row.data);
  if (meta.storage !== 2) throw new SafeError("Apply the database migrations first.", 503);
  const state: AppState = { user: meta.user, accounts: [], posts: [], paths: [], captures: [], followedAccounts: [], followedTags: [], ...(meta.lastRefreshed ? { lastRefreshed: meta.lastRefreshed } : {}) };
  const rows = (result[1].results || []) as Entity[];
  for (const entity of rows) {
    if (entity.kind === "explanations") continue;
    const value = JSON.parse(entity.data);
    if (entity.kind === "paths") state.paths.push({ ...value, explanations: [] });
    else if (["accounts", "posts", "captures", "followedAccounts", "followedTags"].includes(entity.kind)) (state[entity.kind as "accounts"] as unknown[]).push(value);
  }
  for (const entity of rows.filter(e => e.kind === "explanations")) {
    const value = JSON.parse(entity.data) as { pathId: string; explanation: Explanation };
    state.paths.find(p => p.id === value.pathId)?.explanations.push(value.explanation);
  }
  snapshots.set(state, new Map(rows.map(e => [entityKey(e), e])));
  return { state, version: row.version };
}
export async function save(env: Env, state: AppState, version: number) {
  const before = snapshots.get(state);
  if (!before) throw new SafeError("Reload the workspace before saving.", 409);
  const after = entities(state), writeId = crypto.randomUUID();
  const statements = [env.DB.prepare("UPDATE owner_state SET data = ?, version = version + 1, write_id = ? WHERE owner_id = ? AND version = ?").bind(JSON.stringify({ storage: 2, user: state.user, lastRefreshed: state.lastRefreshed }), writeId, env.OWNER_X_ID, version)];
  // Every entity write is conditional on this exact successful revision claim.
  // D1 batch is transactional: an error rolls back metadata and all entity changes.
  const guard = "EXISTS(SELECT 1 FROM owner_state WHERE owner_id = ? AND write_id = ?)";
  for (const [key, entity] of after) {
    const old = before.get(key);
    if (old?.data === entity.data && old.position === entity.position) continue;
    statements.push(env.DB.prepare(`INSERT INTO state_entities(owner_id, kind, entity_id, position, data) SELECT ?, ?, ?, ?, ? WHERE ${guard} ON CONFLICT(owner_id, kind, entity_id) DO UPDATE SET position = excluded.position, data = excluded.data`).bind(env.OWNER_X_ID, entity.kind, entity.entity_id, entity.position, entity.data, env.OWNER_X_ID, writeId));
  }
  for (const [key, entity] of before) if (!after.has(key)) statements.push(env.DB.prepare(`DELETE FROM state_entities WHERE owner_id = ? AND kind = ? AND entity_id = ? AND ${guard}`).bind(env.OWNER_X_ID, entity.kind, entity.entity_id, env.OWNER_X_ID, writeId));
  const result = await env.DB.batch(statements);
  if (!result[0].meta.changes) throw new SafeError("State changed in another request. Reload and retry.", 409);
  snapshots.set(state, after);
}
export function merge(state: AppState, data: { accounts: Account[]; posts: Post[] }) {
  for (const a of data.accounts) { const i = state.accounts.findIndex(x => x.id === a.id); if (i < 0) state.accounts.push(a); else state.accounts[i] = { ...a, tags: state.accounts[i].tags }; }
  for (const p of data.posts) { const i = state.posts.findIndex(x => x.id === p.id); if (i < 0) state.posts.push(p); else state.posts[i] = { ...p, tags: [...new Set([...p.tags, ...state.posts[i].tags])], analysis: state.posts[i].analysis }; }
}
