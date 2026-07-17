import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { type Opts, optBool, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import type { ObjectiveRecordType, ObjectiveStatus } from "../domain/types.js";

function parseStatus(value: string | undefined): ObjectiveStatus | "all" {
  const status = value ?? "active";
  if (status === "active" || status === "archived" || status === "all") {
    return status;
  }
  throw new CliError("USAGE", `Invalid --status "${status}". Use active|archived|all.`, {
    details: { status },
  });
}

function countsByType(links: Array<{ recordType: ObjectiveRecordType }>) {
  const counts: Record<ObjectiveRecordType | "total", number> = {
    post: 0,
    account: 0,
    bookmark: 0,
    track: 0,
    total: links.length,
  };
  for (const link of links) {
    counts[link.recordType] += 1;
  }
  return counts;
}

export function objectiveAddCommand(ctx: RunContext, opts: Opts): CommandResult {
  const objective = ctx.store().objectives.create({
    name: requireString(opts, "name", "<name>"),
    description: optString(opts, "description"),
    focus: optBool(opts, "focus"),
  });
  return {
    data: { objective },
    meta: {
      objectiveId: objective.id,
      slug: objective.slug,
      focused: objective.isFocus,
      persisted: true,
    },
    human: () =>
      `Created objective "${objective.name}" (${objective.slug})${objective.isFocus ? " — current focus" : ""}.`,
  };
}

export function objectiveListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const status = parseStatus(optString(opts, "status"));
  const objectives = ctx.store().objectives.list(status);
  return {
    data: { objectives, count: objectives.length },
    meta: { status },
    human: () =>
      objectives.length === 0
        ? `No ${status === "all" ? "" : `${status} `}objectives.`
        : objectives
            .map(
              (objective) =>
                `${objective.isFocus ? "* " : "  "}${objective.slug} — ${objective.name} (${objective.linkCount} tagged)`,
            )
            .join("\n"),
  };
}

export function objectiveShowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const slug = optString(opts, "slug");
  const objective = slug ? store.objectives.get(slug) : store.objectives.focus();
  if (!objective) {
    throw new CliError(
      "NOT_FOUND",
      slug
        ? `No objective with slug or id "${slug}".`
        : "No current objective focus. Set one with `tenbrains objective focus <slug>`.",
      { details: slug ? { objective: slug } : { focus: null } },
    );
  }
  const counts = countsByType(store.objectives.links(objective.id));
  return {
    data: { objective, counts },
    meta: { objectiveId: objective.id, slug: objective.slug },
    human: () =>
      [
        `${objective.name} (${objective.slug})${objective.isFocus ? " — current focus" : ""}`,
        objective.description ?? "(no description)",
        `${counts.total} tagged: ${counts.post} posts, ${counts.account} accounts, ${counts.bookmark} bookmarks, ${counts.track} tracks`,
      ].join("\n"),
  };
}

export function objectiveFocusCommand(ctx: RunContext, opts: Opts): CommandResult {
  const slug = optString(opts, "slug");
  const clear = optBool(opts, "clear");
  if ((slug && clear) || (!slug && !clear)) {
    throw new CliError("USAGE", "Provide either <slug> or --clear.");
  }
  const objective = ctx.store().objectives.setFocus(clear ? null : (slug as string));
  return {
    data: { objective, cleared: objective === null },
    meta: {
      ...(objective ? { objectiveId: objective.id, slug: objective.slug } : {}),
      focused: objective !== null,
      persisted: true,
    },
    human: () =>
      objective
        ? `Current objective focus: ${objective.slug}.`
        : "Cleared current objective focus.",
  };
}

export function objectiveArchiveCommand(ctx: RunContext, opts: Opts): CommandResult {
  const objective = ctx.store().objectives.archive(requireString(opts, "slug", "<slug>"));
  return {
    data: { objective },
    meta: { objectiveId: objective.id, slug: objective.slug, persisted: true },
    human: () => `Archived objective "${objective.slug}".`,
  };
}
