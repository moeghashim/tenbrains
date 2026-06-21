import { analyzePost } from "../ai/analyzer.js";
import { resolveProvider } from "../ai/resolve.js";
import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveJsonInput, resolveTextInput } from "../core/input.js";
import { type Opts, optBool, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { buildFeynmanTrack } from "../domain/learn.js";
import { PostInputSchema, RatingsInputSchema } from "../domain/schemas.js";
import type { Analysis, LearningTrack, Post } from "../domain/types.js";
import { type FetchMode, fetchTweet, isFetchMode } from "../x/client.js";
import { resolveXBearer } from "./shared.js";

function parseFetchMode(value: string | undefined): FetchMode {
  const mode = value ?? "auto";
  if (!isFetchMode(mode)) {
    throw new CliError("USAGE", `Invalid --fetch "${mode}". Use auto|oembed|api.`);
  }
  return mode;
}

function postForAnalysis(post: Post) {
  return {
    text: post.text,
    authorUsername: post.authorUsername ?? undefined,
    authorName: post.authorName ?? undefined,
    url: post.url ?? undefined,
  };
}

export async function analyzeCommand(ctx: RunContext, opts: Opts): Promise<CommandResult> {
  const resolved = resolveProvider(ctx.config, {
    provider: optString(opts, "provider"),
    model: optString(opts, "model"),
    apiKey: optString(opts, "apiKey"),
  });
  const store = ctx.store();

  // Pick the content source: a stored post, inline text, or a fetched tweet.
  let post: Post;
  let deduped = false;
  let source = "text";
  const postId = optString(opts, "postId");
  const textOpt = optString(opts, "text");
  const refInput = optString(opts, "url") ?? optString(opts, "id");

  if (postId) {
    const existing = store.posts.findById(postId);
    if (!existing) {
      throw new CliError("NOT_FOUND", `No post with id ${postId}.`, { details: { postId } });
    }
    post = existing;
    source = "stored";
  } else if (textOpt !== undefined) {
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: resolveTextInput(textOpt),
        url: optString(opts, "url"),
        externalId: optString(opts, "id"),
        authorUsername: optString(opts, "author"),
        authorName: optString(opts, "authorName"),
        postedAt: optString(opts, "postedAt"),
      },
      "Invalid post input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
  } else if (refInput !== undefined) {
    const mode = parseFetchMode(optString(opts, "fetch"));
    ctx.logger.info(`Fetching tweet from X (${mode})…`);
    const fetched = await fetchTweet(refInput, mode, resolveXBearer(ctx, opts));
    source = fetched.source;
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: fetched.tweet.text,
        url: fetched.tweet.url ?? optString(opts, "url"),
        externalId: fetched.tweet.externalId ?? optString(opts, "id"),
        authorUsername: fetched.tweet.authorUsername ?? optString(opts, "author"),
        authorName: fetched.tweet.authorName ?? optString(opts, "authorName"),
        postedAt: fetched.tweet.postedAt ?? optString(opts, "postedAt"),
      },
      "Fetched tweet did not produce valid post input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
  } else {
    throw new CliError(
      "USAGE",
      "Provide --text, --post-id, or --url/--id (to fetch the tweet from X).",
    );
  }

  ctx.logger.info(`Analyzing post with ${resolved.provider}/${resolved.model}…`);
  const outcome = await analyzePost(resolved, postForAnalysis(post));

  const analysis = store.analyses.create({
    postId: post.id,
    provider: resolved.provider,
    model: resolved.model,
    topic: outcome.result.topic,
    summary: outcome.result.summary,
    intent: outcome.result.intent,
    concepts: outcome.result.novelConcepts,
    mock: outcome.mock,
  });

  let track: LearningTrack | undefined;
  if (optBool(opts, "learn")) {
    track = buildAndPersistTrack(ctx, analysis, opts);
  }

  return {
    data: { post, analysis, ...(track ? { track } : {}) },
    meta: {
      analysisId: analysis.id,
      postId: post.id,
      provider: resolved.provider,
      model: resolved.model,
      mock: outcome.mock,
      deduped,
      source,
      persisted: true,
    },
    human: (data) => renderAnalysis((data as { analysis: Analysis }).analysis),
  };
}

function buildAndPersistTrack(ctx: RunContext, analysis: Analysis, opts: Opts): LearningTrack {
  const ratingsOpt = optString(opts, "ratings");
  const ratings = ratingsOpt
    ? parseOrThrow(RatingsInputSchema, resolveJsonInput(ratingsOpt), "Invalid ratings input.")
    : [];
  const minutes = optNumber(opts, "minutes", 10);
  const days = buildFeynmanTrack(analysis.concepts, minutes, ratings);
  return ctx.store().tracks.create({
    analysisId: analysis.id,
    minutesPerDay: minutes,
    ratings,
    days,
  });
}

export function analyzeListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const limit = optNumber(opts, "limit", 20);
  const offset = optNumber(opts, "offset", 0);
  const author = optString(opts, "author");
  const analyses = ctx.store().analyses.list(limit, offset, author);
  return {
    data: { analyses, count: analyses.length },
    meta: { limit, offset, ...(author ? { author } : {}) },
  };
}

export function analyzeGetCommand(ctx: RunContext, opts: Opts): CommandResult {
  const id = requireString(opts, "id", "<id>");
  const store = ctx.store();
  const analysis = store.analyses.findById(id);
  if (!analysis) {
    throw new CliError("NOT_FOUND", `No analysis with id ${id}.`, { details: { id } });
  }
  const post = store.posts.findById(analysis.postId);
  return {
    data: { analysis, post },
    human: () => renderAnalysis(analysis),
  };
}

function renderAnalysis(analysis: Analysis): string {
  const lines = [
    `Topic:   ${analysis.topic}`,
    `Summary: ${analysis.summary}`,
    `Intent:  ${analysis.intent}`,
    "Concepts:",
    ...analysis.concepts.map((c, i) => `  ${i + 1}. ${c.name} — ${c.whyItMattersInTweet}`),
    `(${analysis.id}${analysis.mock ? ", mock" : ""})`,
  ];
  return lines.join("\n");
}
