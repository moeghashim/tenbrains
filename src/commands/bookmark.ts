import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveTextInput } from "../core/input.js";
import { type Opts, optBool, optList, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { PostInputSchema } from "../domain/schemas.js";
import { suggestTags } from "../domain/tags.js";
import type { Post } from "../domain/types.js";
import { linkObjectives, resolveObjectiveOptions } from "./objective-tags.js";

function resolvePost(ctx: RunContext, opts: Opts): { post: Post; deduped: boolean } {
  const store = ctx.store();
  const postId = optString(opts, "postId");
  if (postId) {
    const post = store.posts.findById(postId);
    if (!post) {
      throw new CliError("NOT_FOUND", `No post with id ${postId}.`, { details: { postId } });
    }
    return { post, deduped: true };
  }
  const text = resolveTextInput(requireString(opts, "text", "--text or --post-id"));
  const input = parseOrThrow(
    PostInputSchema,
    {
      text,
      url: optString(opts, "url"),
      externalId: optString(opts, "id"),
      authorUsername: optString(opts, "author"),
      authorName: optString(opts, "authorName"),
      postedAt: optString(opts, "postedAt"),
    },
    "Invalid post input.",
  );
  return store.posts.ingest(input);
}

export function bookmarkAddCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const objectives = resolveObjectiveOptions(store, opts);
  const { post } = resolvePost(ctx, opts);

  if (store.bookmarks.findByPostId(post.id)) {
    throw new CliError("CONFLICT", `Post ${post.id} is already bookmarked.`, {
      details: { postId: post.id },
    });
  }

  let tags = optList(opts, "tags");
  const autoTags = optString(opts, "tags") === undefined && optBool(opts, "autoTags");
  if (tags.length === 0 && autoTags) {
    tags = suggestTags(post, store.analyses.latestForPost(post.id));
  }

  const bookmark = store.bookmarks.create({
    postId: post.id,
    tags,
    note: optString(opts, "note"),
    source: optString(opts, "source") ?? "cli",
  });
  const objectiveSlugs = linkObjectives(store, objectives, "post", post.id);

  return {
    data: { bookmark, post },
    meta: {
      bookmarkId: bookmark.id,
      postId: post.id,
      autoTagged: autoTags,
      objectives: objectiveSlugs,
      persisted: true,
    },
    human: () =>
      `Bookmarked ${post.id} [${bookmark.tags.join(", ") || "no tags"}] (${bookmark.id}).`,
  };
}

export function bookmarkListCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const limit = optNumber(opts, "limit", 20);
  const offset = optNumber(opts, "offset", 0);
  const tagFilter = optString(opts, "tag");

  let bookmarks = store.bookmarks.list(limit + offset, 0);
  if (tagFilter) {
    bookmarks = bookmarks.filter((b) => b.tags.includes(tagFilter));
  }
  const page = bookmarks.slice(offset, offset + limit).map((bookmark) => ({
    ...bookmark,
    post: store.posts.findById(bookmark.postId),
  }));

  return {
    data: { bookmarks: page, count: page.length },
    meta: { limit, offset, ...(tagFilter ? { tag: tagFilter } : {}) },
  };
}

export function bookmarkShowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  const bookmark = store.bookmarks.findById(id);
  if (!bookmark) {
    throw new CliError("NOT_FOUND", `No bookmark with id ${id}.`, { details: { id } });
  }
  return {
    data: {
      bookmark,
      post: store.posts.findById(bookmark.postId),
      analysis: store.analyses.latestForPost(bookmark.postId),
    },
  };
}

export function bookmarkTagCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  const bookmark = store.bookmarks.findById(id);
  if (!bookmark) {
    throw new CliError("NOT_FOUND", `No bookmark with id ${id}.`, { details: { id } });
  }
  const add = optList(opts, "add");
  const remove = new Set(optList(opts, "remove"));
  if (add.length === 0 && remove.size === 0) {
    throw new CliError("USAGE", "Provide --add and/or --remove with a comma-separated tag list.");
  }
  const next = [...new Set([...bookmark.tags, ...add])].filter((tag) => !remove.has(tag));
  const updated = store.bookmarks.updateTags(id, next);
  return {
    data: { bookmark: updated },
    meta: { persisted: true },
    human: () => `Tags for ${id}: ${updated.tags.join(", ") || "(none)"}`,
  };
}

export function bookmarkRemoveCommand(ctx: RunContext, opts: Opts): CommandResult {
  const store = ctx.store();
  const id = requireString(opts, "id", "<id>");
  const bookmark = store.bookmarks.findById(id);
  if (!bookmark) {
    throw new CliError("NOT_FOUND", `No bookmark with id ${id}.`, { details: { id } });
  }
  store.bookmarks.delete(id);
  return {
    data: { removed: id, postId: bookmark.postId },
    meta: { persisted: true },
    human: () => `Removed bookmark ${id}.`,
  };
}
