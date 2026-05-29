import {
	DeleteBookmarkInputSchema,
	DeleteBookmarkResultSchema,
	SaveBookmarkInputSchema,
	type SavedBookmark,
	SavedBookmarkSchema,
	UpdateBookmarkTagsInputSchema,
} from "@tenbrains/contracts";
import {
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { ConvexError } from "convex/values";
import { v } from "convex/values";

import { requireUserBySession } from "./auth_helpers.js";
import { createBookmarkAlreadyExistsErrorData } from "../src/bookmarks/errors.js";

interface BookmarkRecord {
	_id: string;
	userId: string;
	tweetId: string;
	tweetText: string;
	tweetUrlOrId: string;
	authorUsername: string;
	authorName?: string;
	authorAvatarUrl?: string;
	thread?: SavedBookmark["thread"];
	tags: string[];
	source?: SavedBookmark["source"];
	importedAt?: number;
	systemSuggestedTags?: string[];
	createdAt: number;
	updatedAt: number;
}

function normalizeBookmarkSource(source: SavedBookmark["source"] | undefined): NonNullable<SavedBookmark["source"]> {
	return source ?? "manual";
}

function toSavedBookmark(
	record: BookmarkRecord,
) {
	return SavedBookmarkSchema.parse({
		id: record._id,
		userId: record.userId,
		tweetId: record.tweetId,
		tweetText: record.tweetText,
		tweetUrlOrId: record.tweetUrlOrId,
		authorUsername: record.authorUsername,
		authorName: record.authorName,
		authorAvatarUrl: record.authorAvatarUrl,
		thread: record.thread,
		tags: record.tags,
		source: normalizeBookmarkSource(record.source),
		importedAt: record.importedAt,
		systemSuggestedTags: record.systemSuggestedTags,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

function compareBookmarksByRecency(left: Pick<BookmarkRecord, "updatedAt" | "createdAt">, right: Pick<BookmarkRecord, "updatedAt" | "createdAt">): number {
	if (right.updatedAt !== left.updatedAt) {
		return right.updatedAt - left.updatedAt;
	}
	return right.createdAt - left.createdAt;
}

function toBookmarkRecord(record: {
	_id: string;
	userId: string;
	tweetId: string;
	tweetText: string;
	tweetUrlOrId: string;
	authorUsername: string;
	authorName?: string;
	authorAvatarUrl?: string;
	thread?: SavedBookmark["thread"];
	tags: string[];
	source?: SavedBookmark["source"];
	importedAt?: number;
	systemSuggestedTags?: string[];
	createdAt: number;
	updatedAt: number;
}): BookmarkRecord {
	return {
		_id: String(record._id),
		userId: String(record.userId),
		tweetId: record.tweetId,
		tweetText: record.tweetText,
		tweetUrlOrId: record.tweetUrlOrId,
		authorUsername: record.authorUsername,
		authorName: record.authorName,
		authorAvatarUrl: record.authorAvatarUrl,
		thread: record.thread,
		tags: record.tags,
		source: normalizeBookmarkSource(record.source),
		importedAt: record.importedAt,
		systemSuggestedTags: record.systemSuggestedTags,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export const save = mutationGeneric({
	args: {
		tweetId: v.string(),
		tweetText: v.string(),
		tweetUrlOrId: v.string(),
		authorUsername: v.string(),
		authorName: v.optional(v.string()),
		authorAvatarUrl: v.optional(v.string()),
		thread: v.optional(
			v.object({
				rootTweetId: v.string(),
				tweets: v.array(
					v.object({
						id: v.string(),
						text: v.string(),
						authorId: v.optional(v.string()),
						authorUsername: v.optional(v.string()),
						authorName: v.optional(v.string()),
						authorAvatarUrl: v.optional(v.string()),
						createdAt: v.optional(v.string()),
						conversationId: v.optional(v.string()),
						inReplyToTweetId: v.optional(v.string()),
						media: v.optional(
							v.array(
								v.object({
									mediaKey: v.string(),
									type: v.union(v.literal("photo"), v.literal("video"), v.literal("animated_gif")),
									url: v.optional(v.string()),
									previewImageUrl: v.optional(v.string()),
									altText: v.optional(v.string()),
									width: v.optional(v.number()),
									height: v.optional(v.number()),
								}),
							),
						),
						publicMetrics: v.optional(
							v.object({
								replyCount: v.optional(v.number()),
								repostCount: v.optional(v.number()),
								likeCount: v.optional(v.number()),
								quoteCount: v.optional(v.number()),
								bookmarkCount: v.optional(v.number()),
								impressionCount: v.optional(v.number()),
							}),
						),
					}),
				),
			}),
		),
		tags: v.array(v.string()),
		source: v.optional(v.union(v.literal("manual"), v.literal("x_sync"), v.literal("suggestion"))),
		importedAt: v.optional(v.number()),
		systemSuggestedTags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = SaveBookmarkInputSchema.parse(args);
		const existing = (
			await ctx.db
				.query("bookmarks")
				.withIndex("by_user_id_tweet_id", (query) => query.eq("userId", user._id))
				.filter((query) => query.eq(query.field("tweetId"), validated.tweetId))
				.collect()
		).map((record) => toBookmarkRecord(record));

		if (existing.length > 0) {
			const canonical = [...existing].sort(compareBookmarksByRecency);
			for (const duplicate of canonical.slice(1)) {
				const duplicateId = ctx.db.normalizeId("bookmarks", duplicate._id);
				if (duplicateId) {
					await ctx.db.delete(duplicateId);
				}
			}
			throw new ConvexError(createBookmarkAlreadyExistsErrorData());
		}

		const now = Date.now();
		const bookmarkId = await ctx.db.insert("bookmarks", {
			userId: user._id,
			tweetId: validated.tweetId,
			tweetText: validated.tweetText,
			tweetUrlOrId: validated.tweetUrlOrId,
			authorUsername: validated.authorUsername,
			authorName: validated.authorName,
			authorAvatarUrl: validated.authorAvatarUrl,
			thread: validated.thread,
			tags: validated.tags,
			source: validated.source ?? "manual",
			importedAt: validated.importedAt,
			systemSuggestedTags: validated.systemSuggestedTags,
			createdAt: now,
			updatedAt: now,
		});

		return SavedBookmarkSchema.parse({
			id: String(bookmarkId),
			userId: String(user._id),
			...validated,
			source: validated.source ?? "manual",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateTags = mutationGeneric({
	args: {
		bookmarkId: v.string(),
		tags: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = UpdateBookmarkTagsInputSchema.parse(args);
		const bookmarkId = ctx.db.normalizeId("bookmarks", validated.bookmarkId);
		if (!bookmarkId) {
			throw new Error("Bookmark not found");
		}

		const existing = await ctx.db.get(bookmarkId);
		if (!existing || String(existing.userId) !== String(user._id)) {
			throw new Error("Bookmark not found");
		}

		const now = Date.now();
		const related = (
			await ctx.db
				.query("bookmarks")
				.withIndex("by_user_id_tweet_id", (query) => query.eq("userId", user._id))
				.filter((query) => query.eq(query.field("tweetId"), existing.tweetId))
				.collect()
		).map((record) => toBookmarkRecord(record));
		for (const bookmark of related) {
			const relatedBookmarkId = ctx.db.normalizeId("bookmarks", bookmark._id);
			if (!relatedBookmarkId) {
				continue;
			}
			await ctx.db.patch(relatedBookmarkId, {
				tags: validated.tags,
				updatedAt: now,
			});
		}

		return toSavedBookmark({
			_id: String(existing._id),
			userId: String(existing.userId),
			tweetId: existing.tweetId,
			tweetText: existing.tweetText,
			tweetUrlOrId: existing.tweetUrlOrId,
			authorUsername: existing.authorUsername,
			authorName: existing.authorName,
			authorAvatarUrl: existing.authorAvatarUrl,
			thread: existing.thread,
			tags: validated.tags,
			source: normalizeBookmarkSource(existing.source),
			importedAt: existing.importedAt,
			systemSuggestedTags: existing.systemSuggestedTags,
			createdAt: existing.createdAt,
			updatedAt: now,
		});
	},
});

export const remove = mutationGeneric({
	args: {
		bookmarkId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = DeleteBookmarkInputSchema.parse(args);
		const bookmarkId = ctx.db.normalizeId("bookmarks", validated.bookmarkId);
		if (!bookmarkId) {
			throw new Error("Bookmark not found");
		}

		const existing = await ctx.db.get(bookmarkId);
		if (!existing || String(existing.userId) !== String(user._id)) {
			throw new Error("Bookmark not found");
		}

		const related = (
			await ctx.db
				.query("bookmarks")
				.withIndex("by_user_id_tweet_id", (query) => query.eq("userId", user._id))
				.filter((query) => query.eq(query.field("tweetId"), existing.tweetId))
				.collect()
		).map((record) => toBookmarkRecord(record));
		for (const bookmark of related) {
			const relatedBookmarkId = ctx.db.normalizeId("bookmarks", bookmark._id);
			if (!relatedBookmarkId) {
				continue;
			}
			await ctx.db.delete(relatedBookmarkId);
		}

		return DeleteBookmarkResultSchema.parse({
			bookmarkId: validated.bookmarkId,
		});
	},
});

export const listByUser = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const records = await ctx.db
			.query("bookmarks")
			.withIndex("by_user_id_updated_at", (query) => query.eq("userId", user._id))
			.collect();

		const dedupedByTweetId = new Map<string, BookmarkRecord>();
		for (const item of records) {
			const candidate = toBookmarkRecord(item);
			const existing = dedupedByTweetId.get(candidate.tweetId);
			if (!existing || compareBookmarksByRecency(existing, candidate) > 0) {
				dedupedByTweetId.set(candidate.tweetId, candidate);
			}
		}

		return Array.from(dedupedByTweetId.values())
			.sort(compareBookmarksByRecency)
			.map((item) => toSavedBookmark(item));
	},
});
