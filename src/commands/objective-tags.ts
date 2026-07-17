import { CliError } from "../core/errors.js";
import type { Opts } from "../core/opts.js";
import type { Store } from "../db/repositories.js";
import type { Objective, ObjectiveRecordType } from "../domain/types.js";

export function objectiveRefs(opts: Opts): string[] {
  const value = opts.objective;
  if (value === undefined) {
    return [];
  }
  const raw = Array.isArray(value) ? value : [value];
  const refs = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (refs.length !== raw.length) {
    throw new CliError("USAGE", "Each --objective value must be a non-empty slug or obj_ id.");
  }
  return [...new Set(refs)];
}

export function resolveObjectiveRefs(store: Store, refs: string[]): Objective[] {
  const resolved: Objective[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const objective = store.objectives.get(ref);
    if (!objective) {
      throw new CliError(
        "NOT_FOUND",
        `No objective with slug or id "${ref}". Create it first with \`tenbrains objective add <name>\`.`,
        { details: { objective: ref } },
      );
    }
    if (!seen.has(objective.id)) {
      resolved.push(objective);
      seen.add(objective.id);
    }
  }
  return resolved;
}

export function resolveObjectiveOptions(store: Store, opts: Opts): Objective[] {
  return resolveObjectiveRefs(store, objectiveRefs(opts));
}

export function resolveObjectiveRef(store: Store, ref: string): Objective {
  return resolveObjectiveRefs(store, [ref])[0] as Objective;
}

export function linkObjectives(
  store: Store,
  objectives: Objective[],
  recordType: ObjectiveRecordType,
  recordId: string,
): string[] {
  for (const objective of objectives) {
    store.objectives.link(objective.id, recordType, recordId);
  }
  return objectives.map((objective) => objective.slug);
}

export interface ObjectiveRecordTarget {
  type: ObjectiveRecordType;
  id: string;
  value: unknown;
}

export function resolveObjectiveRecord(store: Store, id: string): ObjectiveRecordTarget {
  const prefix = id.split("_", 1)[0];
  const target = (() => {
    switch (prefix) {
      case "post":
        return { type: "post" as const, value: store.posts.findById(id) };
      case "acc":
        return { type: "account" as const, value: store.accounts.findById(id) };
      case "bm":
        return { type: "bookmark" as const, value: store.bookmarks.findById(id) };
      case "trk":
        return { type: "track" as const, value: store.tracks.findById(id) };
      default:
        throw new CliError(
          "USAGE",
          `Objective links support post_, acc_, bm_, and trk_ ids; received "${id}".`,
          { details: { recordId: id } },
        );
    }
  })();
  if (!target.value) {
    throw new CliError("NOT_FOUND", `No ${target.type} with id ${id}.`, {
      details: { recordId: id, recordType: target.type },
    });
  }
  return { ...target, id };
}
