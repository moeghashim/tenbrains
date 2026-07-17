import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { type Opts, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import type { ObjectiveRecordType } from "../domain/types.js";

/**
 * Resolve any prefixed id (post_, ana_, acc_, snap_, bm_, sug_, trk_, obj_) to its
 * stored record. Lets an agent follow an id from one command's output straight
 * to the underlying entity without knowing which table it belongs to.
 */
export function recordGetCommand(ctx: RunContext, opts: Opts): CommandResult {
  const id = requireString(opts, "id", "<id>");
  const store = ctx.store();
  const prefix = id.split("_", 1)[0];
  let objectiveRecordType: ObjectiveRecordType | null = null;

  const record = (() => {
    switch (prefix) {
      case "post":
        objectiveRecordType = "post";
        return { type: "post", value: store.posts.findById(id) };
      case "ana":
        return { type: "analysis", value: store.analyses.findById(id) };
      case "acc":
        objectiveRecordType = "account";
        return { type: "account", value: store.accounts.findById(id) };
      case "snap":
        return { type: "takeaway_snapshot", value: store.snapshots.findById(id) };
      case "bm":
        objectiveRecordType = "bookmark";
        return { type: "bookmark", value: store.bookmarks.findById(id) };
      case "sug":
        return { type: "suggestion", value: store.suggestions.findById(id) };
      case "trk":
        objectiveRecordType = "track";
        return { type: "learning_track", value: store.tracks.findById(id) };
      case "obj":
        return { type: "objective", value: store.objectives.get(id) };
      default:
        throw new CliError("USAGE", `Unrecognized id prefix "${prefix}".`, { details: { id } });
    }
  })();

  if (!record.value) {
    throw new CliError("NOT_FOUND", `No ${record.type} with id ${id}.`, { details: { id } });
  }
  const objectives = objectiveRecordType ? store.objectives.forRecord(objectiveRecordType, id) : [];
  return { data: { type: record.type, record: record.value, objectives } };
}
