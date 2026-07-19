import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { type Opts, optList, optNumber, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { type SearchType, searchCorpus } from "../domain/search.js";
import { resolveObjectiveContentScope } from "./objective-tags.js";

const ALL_TYPES: SearchType[] = ["analysis", "takeaway", "bookmark"];

export function searchCommand(ctx: RunContext, opts: Opts): CommandResult {
  const query = requireString(opts, "query", "<query>");
  const requested = optList(opts, "type");
  let types: SearchType[] = ALL_TYPES;
  if (requested.length > 0 && !requested.includes("all")) {
    for (const t of requested) {
      if (!ALL_TYPES.includes(t as SearchType)) {
        throw new CliError("USAGE", `Invalid --type "${t}". Use analysis|takeaway|bookmark|all.`);
      }
    }
    types = requested as SearchType[];
  }
  const limit = optNumber(opts, "limit", 10);
  const scope = resolveObjectiveContentScope(ctx.store(), opts);
  const result = searchCorpus(ctx.store(), query, {
    types,
    limit,
    ...(scope
      ? {
          allowedIds: {
            analysis: scope.analysisIds,
            takeaway: scope.takeawayIds,
            bookmark: scope.bookmarkIds,
          },
        }
      : {}),
  });

  return {
    data: result,
    meta: { total: result.total, ...(scope ? { objective: scope.objective.slug } : {}) },
    human: () => {
      const lines: string[] = [`Results for "${query}" (${result.total}):`];
      for (const type of ALL_TYPES) {
        for (const hit of result.groups[type]) {
          lines.push(`  [${type} ${hit.score.toFixed(2)}] ${hit.title} — ${hit.snippet}`);
        }
      }
      return result.total === 0 ? `No matches for "${query}".` : lines.join("\n");
    },
  };
}
