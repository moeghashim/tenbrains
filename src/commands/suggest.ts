import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveTextInput } from "../core/input.js";
import { type Opts, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { PostInputSchema } from "../domain/schemas.js";
import { generateSuggestions } from "../domain/suggest.js";
import { suggestTags } from "../domain/tags.js";
import type { SuggestionStatus } from "../domain/types.js";

const VALID_STATUSES: SuggestionStatus[] = ["pending", "saved", "dismissed"];

export function suggestGenerateCommand(ctx: RunContext, opts: Opts): CommandResult {
  const limit = optNumber(opts, "limit", 10);
  const result = generateSuggestions(ctx.store(), { limit });
  return {
    data: result,
    meta: { created: result.created, updated: result.updated, persisted: true },
    human: () =>
      result.suggestions.length === 0
        ? "No suggestions. Analyze and bookmark some posts first."
        : result.suggestions.map((s) => `[${s.score.toFixed(1)}] ${s.reason} (${s.id})`).join("\n"),
  };
}

export function suggestListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const limit = optNumber(opts, "limit", 10);
  const statusOpt = optString(opts, "status") ?? "pending";
  if (statusOpt !== "all" && !VALID_STATUSES.includes(statusOpt as SuggestionStatus)) {
    throw new CliError(
      "USAGE",
      `Invalid --status "${statusOpt}". Use pending|saved|dismissed|all.`,
    );
  }
  const suggestions = store.suggestions
    .list(statusOpt as SuggestionStatus | "all", limit)
    .map((suggestion) => ({ ...suggestion, post: store.posts.findById(suggestion.postId) }));
  return {
    data: { suggestions, count: suggestions.length },
    meta: { status: statusOpt, limit },
  };
}

export function suggestSaveCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  const suggestion = store.suggestions.findById(id);
  if (!suggestion) {
    throw new CliError("NOT_FOUND", `No suggestion with id ${id}.`, { details: { id } });
  }
  const updated = store.suggestions.setStatus(id, "saved");

  // Saving a suggestion materializes it as a bookmark (the feedback loop).
  let bookmark = store.bookmarks.findByPostId(suggestion.postId);
  if (!bookmark) {
    const post = store.posts.findById(suggestion.postId);
    const tags = post ? suggestTags(post, store.analyses.latestForPost(post.id)) : [];
    bookmark = store.bookmarks.create({
      postId: suggestion.postId,
      tags,
      source: "suggestion",
    });
  }

  return {
    data: { suggestion: updated, bookmark },
    meta: { bookmarkId: bookmark.id, persisted: true },
    human: () => `Saved suggestion ${id} → bookmark ${bookmark?.id}.`,
  };
}

export function suggestDismissCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  if (!store.suggestions.findById(id)) {
    throw new CliError("NOT_FOUND", `No suggestion with id ${id}.`, { details: { id } });
  }
  const updated = store.suggestions.setStatus(id, "dismissed");
  return {
    data: { suggestion: updated },
    meta: { persisted: true },
    human: () => `Dismissed suggestion ${id}.`,
  };
}

export function suggestAddCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const postId = optString(opts, "postId");
  let resolvedPostId: string;
  if (postId) {
    if (!store.posts.findById(postId)) {
      throw new CliError("NOT_FOUND", `No post with id ${postId}.`, { details: { postId } });
    }
    resolvedPostId = postId;
  } else {
    const text = resolveTextInput(requireString(opts, "text", "--text or --post-id"));
    const input = parseOrThrow(
      PostInputSchema,
      {
        text,
        url: optString(opts, "url"),
        externalId: optString(opts, "id"),
        authorUsername: optString(opts, "author"),
      },
      "Invalid post input.",
    );
    resolvedPostId = store.posts.ingest(input).post.id;
  }

  const reason = optString(opts, "reason") ?? "Manually added candidate.";
  const score = optNumber(opts, "score", 1);
  const suggestion = store.suggestions.upsert({ postId: resolvedPostId, reason, score });
  return {
    data: { suggestion },
    meta: { suggestionId: suggestion.id, persisted: true },
    human: () => `Added suggestion ${suggestion.id} for post ${resolvedPostId}.`,
  };
}
