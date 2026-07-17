import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveJsonInput } from "../core/input.js";
import { type Opts, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import type { Store } from "../db/repositories.js";
import { buildFeynmanTrack, nextPendingDay, scheduledDay } from "../domain/learn.js";
import { RatingsInputSchema } from "../domain/schemas.js";
import type { LearningTrack } from "../domain/types.js";
import {
  linkObjectives,
  objectiveLensDescription,
  objectiveRefs,
  resolveObjectiveRefs,
} from "./objective-tags.js";

export function learnGenerateCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const requestedRefs = objectiveRefs(opts);
  const explicitObjectives = resolveObjectiveRefs(store, requestedRefs);
  const analysisId = requireString(opts, "analysis", "--analysis");
  const analysis = store.analyses.findById(analysisId);
  if (!analysis) {
    throw new CliError("NOT_FOUND", `No analysis with id ${analysisId}.`, {
      details: { analysisId },
    });
  }

  const ratingsOpt = optString(opts, "ratings");
  const ratings = ratingsOpt
    ? parseOrThrow(RatingsInputSchema, resolveJsonInput(ratingsOpt), "Invalid ratings input.")
    : [];
  const minutes = optNumber(opts, "minutes", 10);
  const objectives =
    requestedRefs.length > 0
      ? explicitObjectives
      : store.objectives.forRecord("post", analysis.postId);

  const days = buildFeynmanTrack(
    analysis.concepts,
    minutes,
    ratings,
    objectiveLensDescription(objectives),
  );
  const track = store.tracks.create({ analysisId, minutesPerDay: minutes, ratings, days });
  const objectiveSlugs = linkObjectives(store, objectives, "track", track.id);

  return {
    data: { track, analysis },
    meta: {
      trackId: track.id,
      minutesPerDay: minutes,
      objectives: objectiveSlugs,
      persisted: true,
    },
    human: () => renderTrack(track),
  };
}

export function learnShowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  const track = store.tracks.findById(id);
  if (!track) {
    throw new CliError("NOT_FOUND", `No learning track with id ${id}.`, { details: { id } });
  }
  return {
    data: { track, analysis: store.analyses.findById(track.analysisId) },
    human: () => renderTrack(track),
  };
}

export function learnListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const limit = optNumber(opts, "limit", 20);
  const analysisId = optString(opts, "analysis");
  const tracks = ctx.store().tracks.list(limit, analysisId);
  return {
    data: { tracks, count: tracks.length },
    meta: { limit, ...(analysisId ? { analysisId } : {}) },
  };
}

/** Most recently created track that still has pending days. */
function findActiveTrack(store: Store): LearningTrack | null {
  for (const track of store.tracks.list(100)) {
    if (nextPendingDay(track.days, track.progress) !== null) {
      return track;
    }
  }
  return null;
}

export function learnTodayCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = optString(opts, "id");
  let track: LearningTrack | null;
  if (id) {
    track = store.tracks.findById(id);
    if (!track) {
      throw new CliError("NOT_FOUND", `No learning track with id ${id}.`, { details: { id } });
    }
  } else {
    track = findActiveTrack(store);
    if (!track) {
      throw new CliError(
        "NOT_FOUND",
        "No learning track with pending days. Create one with `learn generate --analysis <id>` or `analyze --learn`.",
      );
    }
  }

  const day = nextPendingDay(track.days, track.progress);
  const analysis = store.analyses.findById(track.analysisId);
  if (day === null) {
    return {
      data: { trackId: track.id, completed: true, task: null, progress: track.progress },
      meta: { trackId: track.id, completed: true },
      human: () => `Track ${track.id} is complete — all ${track.days.length} days done.`,
    };
  }

  const task = track.days.find((d) => d.day === day) ?? null;
  const onSchedule = scheduledDay(track.createdAt, new Date(), track.days.length);
  return {
    data: {
      trackId: track.id,
      day,
      totalDays: track.days.length,
      task,
      scheduledDay: onSchedule,
      behindBy: Math.max(0, onSchedule - day),
      doneDays: track.progress.length,
      topic: analysis?.topic ?? null,
    },
    meta: { trackId: track.id, day, completed: false },
    human: () => {
      const topic = analysis ? ` — ${analysis.topic}` : "";
      const behind =
        onSchedule > day ? ` (calendar says day ${onSchedule}; ${onSchedule - day} behind)` : "";
      return [
        `Day ${day}/${track.days.length} of ${track.id}${topic}${behind}`,
        ...(task ? [`  ${task.learn}`, `  ${task.explain}`, `  ${task.check}`] : []),
        `Mark it finished with: learn done ${track.id}`,
      ].join("\n");
    },
  };
}

export function learnDoneCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  let track = store.tracks.findById(id);
  if (!track) {
    throw new CliError("NOT_FOUND", `No learning track with id ${id}.`, { details: { id } });
  }

  const pending = nextPendingDay(track.days, track.progress);
  const day = optNumber(opts, "day", pending ?? 0);
  if (pending === null && opts.day === undefined) {
    throw new CliError("CONFLICT", `Track ${id} is already complete.`, { details: { id } });
  }
  if (!Number.isInteger(day) || day < 1 || day > track.days.length) {
    throw new CliError("USAGE", `--day must be between 1 and ${track.days.length}.`, {
      details: { day },
    });
  }
  if (track.progress.some((p) => p.day === day)) {
    throw new CliError("CONFLICT", `Day ${day} of track ${id} is already marked done.`, {
      details: { id, day },
    });
  }

  track = store.tracks.markDone(id, day, optString(opts, "notes"));
  const remaining = nextPendingDay(track.days, track.progress);
  return {
    data: { track, day, completed: remaining === null },
    meta: { trackId: track.id, day, completed: remaining === null, persisted: true },
    human: () =>
      remaining === null
        ? `Day ${day} done — track ${id} complete! 🎉`
        : `Day ${day} done (${track.progress.length}/${track.days.length}). Next up: day ${remaining}.`,
  };
}

function renderTrack(track: LearningTrack): string {
  const done = new Set(track.progress.map((p) => p.day));
  const stats =
    track.progress.length > 0 ? ` — ${track.progress.length}/${track.days.length} done` : "";
  return [
    `7-day Feynman track (${track.minutesPerDay} min/day) — ${track.id}${stats}`,
    ...track.days.map(
      (d) =>
        `Day ${d.day}${done.has(d.day) ? " ✓" : ""} [${d.concept}]\n  ${d.learn}\n  ${d.explain}\n  ${d.check}`,
    ),
  ].join("\n");
}
