import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveJsonInput } from "../core/input.js";
import { type Opts, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { buildFeynmanTrack } from "../domain/learn.js";
import { RatingsInputSchema } from "../domain/schemas.js";
import type { LearningTrack } from "../domain/types.js";

export function learnGenerateCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
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

  const days = buildFeynmanTrack(analysis.concepts, minutes, ratings);
  const track = store.tracks.create({ analysisId, minutesPerDay: minutes, ratings, days });

  return {
    data: { track, analysis },
    meta: { trackId: track.id, minutesPerDay: minutes, persisted: true },
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

function renderTrack(track: LearningTrack): string {
  return [
    `7-day Feynman track (${track.minutesPerDay} min/day) — ${track.id}`,
    ...track.days.map(
      (d) => `Day ${d.day} [${d.concept}]\n  ${d.learn}\n  ${d.explain}\n  ${d.check}`,
    ),
  ].join("\n");
}
