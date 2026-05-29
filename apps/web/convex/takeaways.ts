import {
	AccountTakeawaySnapshotSchema,
	DeleteTakeawayFollowResultSchema,
	TakeawayFollowSchema,
	TakeawayHistoryResponseSchema,
	TakeawayWorkspaceResponseSchema,
	type AccountTakeawayPost,
	type AccountTakeawaySnapshot,
	type TakeawayFollow,
} from "@tenbrains/contracts";
import {
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { requireUserBySession } from "./auth_helpers.js";

type DbCtx = QueryCtx | MutationCtx;

function pickLatestRecord<T extends { updatedAt: number }>(records: T[]): T | null {
	if (records.length === 0) {
		return null;
	}
	return records.reduce((latest, record) => (record.updatedAt > latest.updatedAt ? record : latest));
}

const tweetPreviewValue = v.object({
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
});

function sanitizeAccountUsername(input: string): string {
	const sanitized = input.trim().replace(/^@+/, "");
	if (!sanitized) {
		throw new Error("accountUsername is required");
	}
	return sanitized;
}

function normalizeAccountUsername(input: string): string {
	return sanitizeAccountUsername(input).toLowerCase();
}

function toTakeawayFollow(record: {
	_id: string;
	userId: string;
	accountId?: string;
	accountUsername: string;
	accountName?: string;
	accountAvatarUrl?: string;
	lastRefreshDateKey?: string;
	lastRefreshedAt?: number;
	lastRefreshStatus: "idle" | "success" | "error";
	lastRefreshError?: string;
	createdAt: number;
	updatedAt: number;
}): TakeawayFollow {
	return TakeawayFollowSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		accountId: record.accountId,
		accountUsername: record.accountUsername,
		accountName: record.accountName,
		accountAvatarUrl: record.accountAvatarUrl,
		lastRefreshDateKey: record.lastRefreshDateKey,
		lastRefreshedAt: record.lastRefreshedAt,
		lastRefreshStatus: record.lastRefreshStatus,
		lastRefreshError: record.lastRefreshError,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

function toTakeawaySnapshot(record: {
	_id: string;
	userId: string;
	followId: string;
	accountId?: string;
	accountUsername: string;
	accountName?: string;
	accountAvatarUrl?: string;
	provider: string;
	model: string;
	summary: string;
	takeaways: string[];
	sampleSize: number;
	snapshotDateKey: string;
	posts: AccountTakeawayPost[];
	createdAt: number;
}): AccountTakeawaySnapshot {
	return AccountTakeawaySnapshotSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		followId: String(record.followId),
		accountId: record.accountId,
		accountUsername: record.accountUsername,
		accountName: record.accountName,
		accountAvatarUrl: record.accountAvatarUrl,
		provider: record.provider,
		model: record.model,
		summary: record.summary,
		takeaways: record.takeaways,
		sampleSize: record.sampleSize,
		snapshotDateKey: record.snapshotDateKey,
		posts: record.posts,
		createdAt: record.createdAt,
	});
}

async function listTakeawayFollowsForUser(ctx: DbCtx, userId: Id<"users">) {
	const records = await ctx.db
		.query("takeawayFollows")
		.withIndex("by_user_id_updated_at", (query) => query.eq("userId", userId))
		.collect();

	return records
		.map((record) => toTakeawayFollow(record))
		.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function listTakeawaySnapshotsForFollow(ctx: DbCtx, followId: Id<"takeawayFollows">) {
	const records = await ctx.db
		.query("takeawaySnapshots")
		.withIndex("by_follow_id_created_at", (query) => query.eq("followId", followId))
		.collect();

	return records
		.map((record) => toTakeawaySnapshot(record))
		.sort((left, right) => right.createdAt - left.createdAt);
}

export const listWorkspace = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const follows = await listTakeawayFollowsForUser(ctx, user._id);
		return TakeawayWorkspaceResponseSchema.parse({
			follows,
		});
	},
});

export const getFollowById = queryGeneric({
	args: {
		followId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("takeawayFollows", args.followId);
		if (!followId) {
			throw new Error("Takeaway follow not found");
		}

		const record = await ctx.db.get(followId);
		if (!record || String(record.userId) !== String(user._id)) {
			throw new Error("Takeaway follow not found");
		}

		return toTakeawayFollow(record);
	},
});

export const upsertFollow = mutationGeneric({
	args: {
		accountUsername: v.string(),
		accountId: v.optional(v.string()),
		accountName: v.optional(v.string()),
		accountAvatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const accountUsername = sanitizeAccountUsername(args.accountUsername);
		const accountUsernameLower = normalizeAccountUsername(args.accountUsername);
		const now = Date.now();
		const existing = pickLatestRecord(await ctx.db
			.query("takeawayFollows")
			.withIndex("by_user_id_account_username", (query) => query.eq("userId", user._id))
			.filter((query) => query.eq(query.field("accountUsernameLower"), accountUsernameLower))
			.collect());

		if (existing) {
			await ctx.db.patch(existing._id, {
				accountId: args.accountId,
				accountUsername,
				accountName: args.accountName,
				accountAvatarUrl: args.accountAvatarUrl,
				updatedAt: now,
			});
			return toTakeawayFollow({
				...existing,
				accountId: args.accountId,
				accountUsername,
				accountName: args.accountName,
				accountAvatarUrl: args.accountAvatarUrl,
				updatedAt: now,
			});
		}

		const followId = await ctx.db.insert("takeawayFollows", {
			userId: user._id,
			accountId: args.accountId,
			accountUsername,
			accountUsernameLower,
			accountName: args.accountName,
			accountAvatarUrl: args.accountAvatarUrl,
			lastRefreshStatus: "idle",
			createdAt: now,
			updatedAt: now,
		});

		return TakeawayFollowSchema.parse({
			id: String(followId),
			userId: String(user._id),
			accountId: args.accountId,
			accountUsername,
			accountName: args.accountName,
			accountAvatarUrl: args.accountAvatarUrl,
			lastRefreshStatus: "idle",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const removeFollow = mutationGeneric({
	args: {
		followId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("takeawayFollows", args.followId);
		if (!followId) {
			throw new Error("Takeaway follow not found");
		}

		const existing = await ctx.db.get(followId);
		if (!existing || String(existing.userId) !== String(user._id)) {
			throw new Error("Takeaway follow not found");
		}

		const snapshots = await ctx.db
			.query("takeawaySnapshots")
			.withIndex("by_follow_id_created_at", (query) => query.eq("followId", followId))
			.collect();

		await Promise.all(snapshots.map((snapshot) => ctx.db.delete(snapshot._id)));
		await ctx.db.delete(followId);

		return DeleteTakeawayFollowResultSchema.parse({
			followId: args.followId,
		});
	},
});

export const getHistoryForFollow = queryGeneric({
	args: {
		followId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("takeawayFollows", args.followId);
		if (!followId) {
			throw new Error("Takeaway follow not found");
		}

		const follow = await ctx.db.get(followId);
		if (!follow || String(follow.userId) !== String(user._id)) {
			throw new Error("Takeaway follow not found");
		}

		const history = await listTakeawaySnapshotsForFollow(ctx, followId);
		return TakeawayHistoryResponseSchema.parse({
			latest: history[0],
			history,
		});
	},
});

export const markRefreshError = mutationGeneric({
	args: {
		followId: v.string(),
		dateKey: v.string(),
		refreshedAt: v.number(),
		errorMessage: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("takeawayFollows", args.followId);
		if (!followId) {
			throw new Error("Takeaway follow not found");
		}

		const follow = await ctx.db.get(followId);
		if (!follow || String(follow.userId) !== String(user._id)) {
			throw new Error("Takeaway follow not found");
		}

		await ctx.db.patch(followId, {
			lastRefreshDateKey: args.dateKey,
			lastRefreshedAt: args.refreshedAt,
			lastRefreshStatus: "error",
			lastRefreshError: args.errorMessage.trim(),
			updatedAt: args.refreshedAt,
		});

		return toTakeawayFollow({
			...follow,
			lastRefreshDateKey: args.dateKey,
			lastRefreshedAt: args.refreshedAt,
			lastRefreshStatus: "error",
			lastRefreshError: args.errorMessage.trim(),
			updatedAt: args.refreshedAt,
		});
	},
});

export const saveSnapshotForFollow = mutationGeneric({
	args: {
		followId: v.string(),
		accountId: v.optional(v.string()),
		accountUsername: v.string(),
		accountName: v.optional(v.string()),
		accountAvatarUrl: v.optional(v.string()),
		provider: v.string(),
		model: v.string(),
		summary: v.string(),
		takeaways: v.array(v.string()),
		sampleSize: v.number(),
		snapshotDateKey: v.string(),
		posts: v.array(tweetPreviewValue),
		createdAt: v.number(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const followId = ctx.db.normalizeId("takeawayFollows", args.followId);
		if (!followId) {
			throw new Error("Takeaway follow not found");
		}

		const follow = await ctx.db.get(followId);
		if (!follow || String(follow.userId) !== String(user._id)) {
			throw new Error("Takeaway follow not found");
		}

		const existingSnapshot = await ctx.db
			.query("takeawaySnapshots")
			.withIndex("by_follow_id_snapshot_date_key", (query) => query.eq("followId", followId))
			.filter((query) => query.eq(query.field("snapshotDateKey"), args.snapshotDateKey))
			.unique();

		await ctx.db.patch(followId, {
			accountId: args.accountId,
			accountUsername: sanitizeAccountUsername(args.accountUsername),
			accountUsernameLower: normalizeAccountUsername(args.accountUsername),
			accountName: args.accountName,
			accountAvatarUrl: args.accountAvatarUrl,
			lastRefreshDateKey: args.snapshotDateKey,
			lastRefreshedAt: args.createdAt,
			lastRefreshStatus: "success",
			lastRefreshError: undefined,
			updatedAt: args.createdAt,
		});

		if (existingSnapshot) {
			return toTakeawaySnapshot(existingSnapshot);
		}

		const snapshotId = await ctx.db.insert("takeawaySnapshots", {
			userId: user._id,
			followId,
			accountId: args.accountId,
			accountUsername: sanitizeAccountUsername(args.accountUsername),
			accountName: args.accountName,
			accountAvatarUrl: args.accountAvatarUrl,
			provider: args.provider,
			model: args.model,
			summary: args.summary,
			takeaways: args.takeaways,
			sampleSize: args.sampleSize,
			snapshotDateKey: args.snapshotDateKey,
			posts: args.posts,
			createdAt: args.createdAt,
		});

		return AccountTakeawaySnapshotSchema.parse({
			id: String(snapshotId),
			userId: String(user._id),
			followId: String(followId),
			accountId: args.accountId,
			accountUsername: sanitizeAccountUsername(args.accountUsername),
			accountName: args.accountName,
			accountAvatarUrl: args.accountAvatarUrl,
			provider: args.provider,
			model: args.model,
			summary: args.summary,
			takeaways: args.takeaways,
			sampleSize: args.sampleSize,
			snapshotDateKey: args.snapshotDateKey,
			posts: args.posts,
			createdAt: args.createdAt,
		});
	},
});

export const listDueRefreshJobs = queryGeneric({
	args: {
		dateKey: v.string(),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		const records = await ctx.db.query("takeawayFollows").collect();
		return records
			.filter((record) => record.lastRefreshDateKey !== args.dateKey)
			.sort((left, right) => left.updatedAt - right.updatedAt)
			.slice(0, Math.max(1, args.limit))
			.map((record) => ({
				userId: String(record.userId),
				followId: String(record._id),
				accountUsername: record.accountUsername,
			}));
	},
});
