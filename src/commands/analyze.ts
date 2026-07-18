import { analyzePost, summarizeContent } from "../ai/analyzer.js";
import { resolveProvider } from "../ai/resolve.js";
import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveJsonInput, resolveTextInput } from "../core/input.js";
import { type Opts, optBool, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { buildFeynmanTrack } from "../domain/learn.js";
import { PostInputSchema, RatingsInputSchema, ThreadInputSchema } from "../domain/schemas.js";
import type { Analysis, LearningTrack, Post } from "../domain/types.js";
import { type FetchMode, fetchThread, fetchTweet, isFetchMode } from "../x/client.js";
import { fetchTranscript, isYouTubeUrl, parseVideoRef } from "../youtube/client.js";
import {
  linkObjectives,
  objectiveLensDescriptions,
  resolveObjectiveOptions,
} from "./objective-tags.js";
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

function isTranscriptPost(post: Post): boolean {
  return (
    typeof post.raw === "object" &&
    post.raw !== null &&
    !Array.isArray(post.raw) &&
    (post.raw as Record<string, unknown>).source === "youtube"
  );
}

export async function analyzeCommand(ctx: RunContext, opts: Opts): Promise<CommandResult> {
  const store = ctx.store();
  const explicitObjectives = resolveObjectiveOptions(store, opts);
  const resolved = resolveProvider(ctx.config, {
    provider: optString(opts, "provider"),
    model: optString(opts, "model"),
    apiKey: optString(opts, "apiKey"),
  });

  // Pick the content source: a stored post, inline text, thread parts, or a fetched tweet/thread.
  let post: Post;
  let deduped = false;
  let source = "text";
  let contentKind: "tweet" | "transcript" = "tweet";
  let threadParts: number | undefined;
  const postId = optString(opts, "postId");
  const textOpt = optString(opts, "text");
  const transcriptOpt = optString(opts, "transcript");
  const refInput = optString(opts, "url") ?? optString(opts, "id");
  // --thread [json]: a string is supplied parts; `true` means fetch via the API.
  const threadOpt = opts.thread === true ? true : optString(opts, "thread");

  const explicitSources = [
    textOpt !== undefined,
    transcriptOpt !== undefined,
    typeof threadOpt === "string",
  ].filter(Boolean).length;
  if (explicitSources > 1) {
    throw new CliError("USAGE", "Use only one of --text, --transcript, or --thread <json>.");
  }

  if (postId) {
    const existing = store.posts.findById(postId);
    if (!existing) {
      throw new CliError("NOT_FOUND", `No post with id ${postId}.`, { details: { postId } });
    }
    post = existing;
    source = "stored";
    contentKind = isTranscriptPost(post) ? "transcript" : "tweet";
  } else if (typeof threadOpt === "string") {
    const parts = parseOrThrow(
      ThreadInputSchema,
      resolveJsonInput(threadOpt),
      "Invalid thread input.",
    ).map((part) => (typeof part === "string" ? { text: part } : part));
    const first = parts[0] as { text: string; externalId?: string; url?: string };
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: parts.map((p) => p.text).join("\n\n"),
        url: first.url ?? optString(opts, "url"),
        externalId: first.externalId ?? optString(opts, "id"),
        authorUsername: optString(opts, "author"),
        authorName: optString(opts, "authorName"),
        postedAt: optString(opts, "postedAt"),
      },
      "Invalid post input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
    source = "thread";
    threadParts = parts.length;
  } else if (threadOpt === true) {
    if (!refInput) {
      throw new CliError("USAGE", "Bare --thread needs --url or --id to fetch the thread from X.");
    }
    const bearer = resolveXBearer(ctx, opts);
    if (!bearer) {
      throw new CliError(
        "MISSING_CREDENTIALS",
        "Fetching a thread uses the X API and needs a Bearer token. Configure one with `tenbrains setup --x-bearer <token>`, or supply the parts yourself via --thread <json>.",
      );
    }
    ctx.logger.info("Fetching thread from X (api)…");
    const thread = await fetchThread(refInput, bearer);
    if (!thread.complete) {
      ctx.logger.warn(
        "Could not search for thread replies (tier limits or thread older than ~7 days); analyzing the root tweet only.",
      );
    }
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: thread.parts.map((p) => p.text).join("\n\n"),
        url: thread.root.url ?? optString(opts, "url"),
        externalId: thread.root.externalId ?? optString(opts, "id"),
        authorUsername: thread.root.authorUsername ?? optString(opts, "author"),
        authorName: thread.root.authorName ?? optString(opts, "authorName"),
        postedAt: thread.root.postedAt ?? optString(opts, "postedAt"),
      },
      "Fetched thread did not produce valid post input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
    source = "x:thread";
    threadParts = thread.parts.length;
  } else if (transcriptOpt !== undefined) {
    const suppliedUrl = optString(opts, "url");
    const videoRef = suppliedUrl && isYouTubeUrl(suppliedUrl) ? parseVideoRef(suppliedUrl) : null;
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: resolveTextInput(transcriptOpt),
        url: videoRef?.url ?? suppliedUrl,
        externalId: videoRef ? `yt:${videoRef.id}` : optString(opts, "id"),
        authorUsername: optString(opts, "author"),
        authorName: optString(opts, "authorName"),
        postedAt: optString(opts, "postedAt"),
        raw: {
          source: "youtube",
          ...(videoRef ? { videoId: videoRef.id } : {}),
          transcript: {
            supplied: true,
            ...(optString(opts, "lang") ? { lang: optString(opts, "lang") } : {}),
          },
        },
      },
      "Invalid transcript input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
    source = "youtube";
    contentKind = "transcript";
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
  } else if (refInput !== undefined && isYouTubeUrl(refInput)) {
    ctx.logger.info("Fetching transcript from YouTube…");
    const fetched = await fetchTranscript(refInput, { lang: optString(opts, "lang") });
    const input = parseOrThrow(
      PostInputSchema,
      {
        text: fetched.text,
        url: fetched.url,
        externalId: `yt:${fetched.videoId}`,
        authorUsername: fetched.author,
        authorName: fetched.author,
        postedAt: fetched.uploadDate,
        raw: {
          source: "youtube",
          videoId: fetched.videoId,
          title: fetched.title,
          channel: fetched.author,
          durationSeconds: fetched.durationSeconds,
          caption: { lang: fetched.captionLang, kind: fetched.captionKind },
        },
      },
      "Fetched YouTube transcript did not produce valid post input.",
    );
    ({ post, deduped } = store.posts.ingest(input));
    source = "youtube";
    contentKind = "transcript";
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
      "Provide --text, --transcript, --thread, --post-id, or --url/--id to fetch content.",
    );
  }

  if (contentKind === "transcript" && post.text.length > 40_000) {
    ctx.logger.warn(
      "Long transcript: provider token usage may be substantial; --summarize condenses it before concept extraction.",
    );
  }

  let narrativeSummary: { summary: string; keyPoints: string[] } | undefined;
  if (optBool(opts, "summarize")) {
    ctx.logger.info(`Summarizing content with ${resolved.provider}/${resolved.model}…`);
    narrativeSummary = (await summarizeContent(resolved, post.text)).result;
    post = store.posts.mergeRaw(post.id, { summary: narrativeSummary });
  }

  ctx.logger.info(`Analyzing content with ${resolved.provider}/${resolved.model}…`);
  const analysisInput = narrativeSummary
    ? { ...postForAnalysis(post), text: narrativeSummary.summary }
    : postForAnalysis(post);
  const outcome = await analyzePost(resolved, analysisInput, contentKind);

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
  linkObjectives(store, explicitObjectives, "post", post.id);

  let track: LearningTrack | undefined;
  let trackObjectives = explicitObjectives;
  if (optBool(opts, "learn")) {
    if (trackObjectives.length === 0) {
      trackObjectives = store.objectives.forRecord("post", post.id);
    }
    track = buildAndPersistTrack(ctx, analysis, opts, objectiveLensDescriptions(trackObjectives));
    linkObjectives(store, trackObjectives, "track", track.id);
  }
  const objectiveSlugs = (track ? trackObjectives : explicitObjectives).map(
    (objective) => objective.slug,
  );

  return {
    data: {
      post,
      analysis,
      ...(narrativeSummary ? { summary: narrativeSummary } : {}),
      ...(track ? { track } : {}),
    },
    meta: {
      analysisId: analysis.id,
      postId: post.id,
      provider: resolved.provider,
      model: resolved.model,
      mock: outcome.mock,
      deduped,
      source,
      persisted: true,
      objectives: objectiveSlugs,
      ...(narrativeSummary ? { summarized: true } : {}),
      ...(threadParts !== undefined ? { threadParts } : {}),
      ...(track ? { trackId: track.id } : {}),
    },
    human: (data) => renderAnalysis((data as { analysis: Analysis }).analysis),
  };
}

function buildAndPersistTrack(
  ctx: RunContext,
  analysis: Analysis,
  opts: Opts,
  objectiveDescriptions: string[] = [],
): LearningTrack {
  const ratingsOpt = optString(opts, "ratings");
  const ratings = ratingsOpt
    ? parseOrThrow(RatingsInputSchema, resolveJsonInput(ratingsOpt), "Invalid ratings input.")
    : [];
  const minutes = optNumber(opts, "minutes", 10);
  const days = buildFeynmanTrack(analysis.concepts, minutes, ratings, objectiveDescriptions);
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
