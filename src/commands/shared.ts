import type { RunContext } from "../core/context.js";
import { resolveTextInput } from "../core/input.js";
import { type Opts, optString } from "../core/opts.js";

/**
 * Resolve the X (Twitter) Bearer token for a run: the `--x-bearer` flag (which
 * may be `@file` or `-` for stdin) wins, then the stored `x.bearerToken` config,
 * else null. No environment variables are consulted.
 */
export function resolveXBearer(ctx: RunContext, opts: Opts): string | null {
  const flag = optString(opts, "xBearer");
  const fromFlag = flag ? resolveTextInput(flag).trim() : "";
  return fromFlag || ctx.config.getXBearer() || null;
}
