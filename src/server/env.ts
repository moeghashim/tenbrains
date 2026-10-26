export interface DBResult { meta: { changes?: number }; results?: Record<string, unknown>[] }
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<DBResult>;
}
export interface Env {
  DB: { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<DBResult[]> };
  ASSETS: { fetch(request: Request): Promise<Response> };
  APP_URL: string; OWNER_X_ID: string; X_CLIENT_ID: string; X_CLIENT_SECRET?: string;
  SESSION_SECRET: string; TOKEN_ENCRYPTION_KEY?: string; XAI_API_KEY?: string; XAI_MODEL?: string;
}
export class SafeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function configured(env: Env) {
  try {
    const url = new URL(env.APP_URL);
    const safeOrigin = !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
    return !!(safeOrigin && env.DB && /^\d+$/.test(env.OWNER_X_ID || "") && env.X_CLIENT_ID && env.SESSION_SECRET?.length >= 32);
  } catch { return false; }
}
export function requireConfig(env: Env) {
  if (!configured(env)) throw new SafeError("Server configuration is incomplete.", 503);
}
