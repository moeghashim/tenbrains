import {
	CreateCreatorFollowInputSchema,
	CreateSubjectFollowInputSchema,
	CreatorFollowSchema,
	DeleteFollowResultSchema,
	FollowSuggestionsResponseSchema,
	FollowSummarySchema,
	FollowingFeedResponseSchema,
	SavedBookmarkSchema,
	SubjectFollowSchema,
} from "@tenbrains/contracts";
import {
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import {
	ALL_FEED_SUBJECT_KEY,
	buildCreatorSuggestions,
	buildFollowingFeed,
	dedupeSavedBookmarks,
	normalizeCreatorUsername,
	normalizeSubjectTag,
	sanitizeCreatorUsername,
} from "../src/follows/follow-utils.js";
import { requireUserBySession } from "./auth_helpers.js";

type DbCtx = QueryCtx | MutationCtx;

function toSavedBookmark(record: {
	_id: string;
	userId: string;
	tweetId: string;
	tweetText: string;
	tweetUrlOrId: string;
	authorUsername: string;
	authorName?: string;
	authorAvatarUrl?: string;
	tags: string[];
	createdAt: number;
	updatedAt: number;
}) {
	return SavedBookmarkSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		tweetId: record.tweetId,
		tweetText: record.tweetText,
		tweetUrlOrId: record.tweetUrlOrId,
		authorUsername: record.authorUsername,
		authorName: record.authorName,
		authorAvatarUrl: record.authorAvatarUrl,
		tags: record.tags,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

function toCreatorFollow(record: {
	_id: string;
	userId: string;
	creatorUsername: string;
	creatorName?: string;
	creatorAvatarUrl?: string;
	scope: "subject" | "all_feed";
	subjectTag?: string;
	createdAt: number;
	updatedAt: number;
}) {
	return CreatorFollowSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		creatorUsername: record.creatorUsername,
		creatorName: record.creatorName,
		creatorAvatarUrl: record.creatorAvatarUrl,
		scope: record.scope,
		subjectTag: record.subjectTag,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

function toSubjectFollow(record: {
	_id: string;
	userId: string;
	subjectTag: string;
	createdAt: number;
	updatedAt: number;
}) {
	return SubjectFollowSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		subjectTag: record.subjectTag,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

async function listBookmarksForUser(ctx: DbCtx, userId: Id<"users">) {
	const records = await ctx.db
		.query("bookmarks")
		.withIndex("by_user_id_updated_at", (query) => query.eq("userId", userId))
		.collect();

	return dedupeSavedBookmarks(records.map((record) => toSavedBookmark(record)));
}

async function listCreatorFollowsForUser(ctx: DbCtx, userId: Id<"users">) {
	const records = await ctx.db
		.query("creatorFollows")
		.withIndex("by_user_id_updated_at", (query) => query.eq("userId", userId))
		.collect();

	return records
		.map((record) => toCreatorFollow(record))
		.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function listSubjectFollowsForUser(ctx: DbCtx, userId: Id<"users">) {
	const records = await ctx.db
		.query("subjectFollows")
		.withIndex("by_user_id_updated_at", (query) => query.eq("userId", userId))
		.collect();

	return records
		.map((record) => toSubjectFollow(record))
		.sort((left, right) => right.updatedAt - left.updatedAt);
}

export const listSummary = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const [creatorFollows, subjectFollows] = await Promise.all([
			listCreatorFollowsForUser(ctx, user._id),
			listSubjectFollowsForUser(ctx, user._id),
		]);

		return FollowSummarySchema.parse({
			creatorFollows,
			subjectFollows,
		});
	},
});

export const upsertCreatorFollow = mutationGeneric({
	args: {
		creatorUsername: v.string(),
		creatorName: v.optional(v.string()),
		creatorAvatarUrl: v.optional(v.string()),
		scope: v.union(v.literal("subject"), v.literal("all_feed")),
		subjectTag: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = CreateCreatorFollowInputSchema.parse({
			kind: "creator",
			...args,
		});
		const creatorUsername = sanitizeCreatorUsername(validated.creatorUsername);
		const creatorUsernameLower = normalizeCreatorUsername(validated.creatorUsername);
		if (!creatorUsernameLower) {
			throw new Error("creatorUsername is required");
		}

		const subjectTag = validated.scope === "subject" ? validated.subjectTag?.trim() : undefined;
		const subjectKey = validated.scope === "all_feed" ? ALL_FEED_SUBJECT_KEY : normalizeSubjectTag(subjectTag ?? "");
		const now = Date.now();
		const existing = (
			await ctx.db
				.query("creatorFollows")
				.withIndex("by_user_id_creator_scope_subject", (query) =>
					query.eq("userId", user._id),
				)
				.filter((query) =>
					query.and(
						query.eq(query.field("creatorUsernameLower"), creatorUsernameLower),
						query.eq(query.field("scope"), validated.scope),
						query.eq(query.field("subjectKey"), subjectKey),
					),
				)
				.collect()
		)[0];

		if (existing) {
			await ctx.db.patch(existing._id, {
				creatorUsername,
				creatorName: validated.creatorName,
				creatorAvatarUrl: validated.creatorAvatarUrl,
				subjectTag,
				updatedAt: now,
			});
			return toCreatorFollow({
				...existing,
				creatorUsername,
				creatorName: validated.creatorName,
				creatorAvatarUrl: validated.creatorAvatarUrl,
				subjectTag,
				updatedAt: now,
			});
		}

		const followId = await ctx.db.insert("creatorFollows", {
			userId: user._id,
			creatorUsername,
			creatorUsernameLower,
			creatorName: validated.creatorName,
			creatorAvatarUrl: validated.creatorAvatarUrl,
			scope: validated.scope,
			subjectTag,
			subjectKey,
			createdAt: now,
			updatedAt: now,
		});

		return CreatorFollowSchema.parse({
			id: String(followId),
			userId: String(user._id),
			creatorUsername,
			creatorName: validated.creatorName,
			creatorAvatarUrl: validated.creatorAvatarUrl,
			scope: validated.scope,
			subjectTag,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const removeCreatorFollow = mutationGeneric({
	args: {
		followId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("creatorFollows", args.followId);
		if (!followId) {
			throw new Error("Follow not found");
		}

		const existing = await ctx.db.get(followId);
		if (!existing || String(existing.userId) !== String(user._id)) {
			throw new Error("Follow not found");
		}

		await ctx.db.delete(followId);
		return DeleteFollowResultSchema.parse({
			followId: args.followId,
		});
	},
});

export const upsertSubjectFollow = mutationGeneric({
	args: {
		subjectTag: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = CreateSubjectFollowInputSchema.parse({
			kind: "subject",
			...args,
		});
		const subjectTag = validated.subjectTag.trim();
		const subjectTagLower = normalizeSubjectTag(validated.subjectTag);
		const now = Date.now();
		const existing = (
			await ctx.db
				.query("subjectFollows")
				.withIndex("by_user_id_subject_tag", (query) =>
					query.eq("userId", user._id),
				)
				.filter((query) =>
					query.eq(query.field("subjectTagLower"), subjectTagLower),
				)
				.collect()
		)[0];

		if (existing) {
			await ctx.db.patch(existing._id, {
				subjectTag,
				updatedAt: now,
			});
			return toSubjectFollow({
				...existing,
				subjectTag,
				updatedAt: now,
			});
		}

		const followId = await ctx.db.insert("subjectFollows", {
			userId: user._id,
			subjectTag,
			subjectTagLower,
			createdAt: now,
			updatedAt: now,
		});

		return SubjectFollowSchema.parse({
			id: String(followId),
			userId: String(user._id),
			subjectTag,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const removeSubjectFollow = mutationGeneric({
	args: {
		followId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("subjectFollows", args.followId);
		if (!followId) {
			throw new Error("Follow not found");
		}

		const existing = await ctx.db.get(followId);
		if (!existing || String(existing.userId) !== String(user._id)) {
			throw new Error("Follow not found");
		}

		await ctx.db.delete(followId);
		return DeleteFollowResultSchema.parse({
			followId: args.followId,
		});
	},
});

export const listSuggestionsForSubject = queryGeneric({
	args: {
		subjectTag: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const subjectTag = args.subjectTag.trim();
		const [bookmarks, creatorFollows] = await Promise.all([
			listBookmarksForUser(ctx, user._id),
			listCreatorFollowsForUser(ctx, user._id),
		]);

		return FollowSuggestionsResponseSchema.parse({
			subjectTag,
			suggestions: buildCreatorSuggestions({
				bookmarks,
				creatorFollows,
				subjectTag,
			}),
		});
	},
});

export const listFollowingFeed = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const [bookmarks, creatorFollows, subjectFollows] = await Promise.all([
			listBookmarksForUser(ctx, user._id),
			listCreatorFollowsForUser(ctx, user._id),
			listSubjectFollowsForUser(ctx, user._id),
		]);

		return FollowingFeedResponseSchema.parse({
			bookmarks: buildFollowingFeed({
				bookmarks,
				creatorFollows,
				subjectFollows,
			}),
		});
	},
});
