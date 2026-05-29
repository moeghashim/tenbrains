import {
	DismissSuggestionInputSchema,
	type Suggestion,
	SuggestionActionResponseSchema,
	SuggestionFeedbackSchema,
	SuggestionSchema,
	SuggestionsResponseSchema,
	SaveSuggestionInputSchema,
} from "@tenbrains/contracts";
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { requireUserBySession } from "./auth_helpers.js";

function pickLatestRecord<T extends { updatedAt: number }>(records: T[]): T | null {
	if (records.length === 0) {
		return null;
	}
	return records.reduce((latest, record) => (record.updatedAt > latest.updatedAt ? record : latest));
}

function toSuggestion(record: {
	_id: string;
	userId: string;
	tweetId: string;
	tweetText: string;
	tweetUrlOrId: string;
	authorUsername: string;
	authorName?: string;
	authorAvatarUrl?: string;
	score: number;
	reasons: Suggestion["reasons"];
	sourceSignals: string[];
	suggestedTags: string[];
	createdAt: number;
	updatedAt: number;
}) {
	return SuggestionSchema.parse({
		id: String(record._id),
		userId: String(record.userId),
		tweetId: record.tweetId,
		tweetText: record.tweetText,
		tweetUrlOrId: record.tweetUrlOrId,
		authorUsername: record.authorUsername,
		authorName: record.authorName,
		authorAvatarUrl: record.authorAvatarUrl,
		score: record.score,
		reasons: record.reasons,
		sourceSignals: record.sourceSignals,
		suggestedTags: record.suggestedTags,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

export const listForCurrentUser = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const suggestions = (
			await ctx.db
				.query("suggestions")
				.withIndex("by_user_id_updated_at", (query) => query.eq("userId", user._id))
				.collect()
		)
			.map((record) => toSuggestion(record))
			.sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);

		return SuggestionsResponseSchema.parse({ suggestions });
	},
});

export const upsertManyForCurrentUser = mutationGeneric({
	args: {
		suggestions: v.array(
			v.object({
				tweetId: v.string(),
				tweetText: v.string(),
				tweetUrlOrId: v.string(),
				authorUsername: v.string(),
				authorName: v.optional(v.string()),
				authorAvatarUrl: v.optional(v.string()),
				score: v.number(),
				reasons: v.array(
					v.object({
						code: v.union(
							v.literal("followed_creator"),
							v.literal("subject_search"),
							v.literal("bookmark_affinity"),
							v.literal("takeaway_theme"),
						),
						label: v.string(),
					}),
				),
				sourceSignals: v.array(v.string()),
				suggestedTags: v.array(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const now = Date.now();
		for (const item of args.suggestions) {
			const existing = pickLatestRecord(
				await ctx.db
					.query("suggestions")
					.withIndex("by_user_id_tweet_id", (query) => query.eq("userId", user._id))
					.filter((query) => query.eq(query.field("tweetId"), item.tweetId))
					.collect(),
			);
			if (existing) {
				await ctx.db.patch(existing._id, {
					tweetText: item.tweetText,
					tweetUrlOrId: item.tweetUrlOrId,
					authorUsername: item.authorUsername,
					authorName: item.authorName,
					authorAvatarUrl: item.authorAvatarUrl,
					score: item.score,
					reasons: item.reasons,
					sourceSignals: item.sourceSignals,
					suggestedTags: item.suggestedTags,
					updatedAt: now,
				});
				continue;
			}

			await ctx.db.insert("suggestions", {
				userId: user._id,
				tweetId: item.tweetId,
				tweetText: item.tweetText,
				tweetUrlOrId: item.tweetUrlOrId,
				authorUsername: item.authorUsername,
				authorName: item.authorName,
				authorAvatarUrl: item.authorAvatarUrl,
				score: item.score,
				reasons: item.reasons,
				sourceSignals: item.sourceSignals,
				suggestedTags: item.suggestedTags,
				createdAt: now,
				updatedAt: now,
			});
		}

		const records = (
			await ctx.db
				.query("suggestions")
				.withIndex("by_user_id_updated_at", (query) => query.eq("userId", user._id))
				.collect()
		)
			.map((record) => toSuggestion(record))
			.sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);
		return SuggestionsResponseSchema.parse({ suggestions: records });
	},
});

export const recordFeedbackForCurrentUser = mutationGeneric({
	args: {
		suggestionId: v.string(),
		status: v.union(v.literal("saved"), v.literal("dismissed")),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const suggestionId = ctx.db.normalizeId("suggestions", args.suggestionId);
		if (!suggestionId) {
			throw new Error("Suggestion not found");
		}
		const suggestion = await ctx.db.get(suggestionId);
		if (!suggestion || String(suggestion.userId) !== String(user._id)) {
			throw new Error("Suggestion not found");
		}

		const createdAt = Date.now();
		const existing = pickLatestRecord(
			await ctx.db
				.query("suggestionFeedback")
				.withIndex("by_user_id_suggestion_id", (query) => query.eq("userId", user._id))
				.filter((query) => query.eq(query.field("suggestionId"), suggestionId))
				.collect(),
		);
		if (existing) {
			await ctx.db.delete(existing._id);
		}
		const feedbackId = await ctx.db.insert("suggestionFeedback", {
			userId: user._id,
			suggestionId,
			status: args.status,
			createdAt,
		});
		return SuggestionFeedbackSchema.parse({
			id: String(feedbackId),
			userId: String(user._id),
			suggestionId: args.suggestionId,
			status: args.status,
			createdAt,
		});
	},
});

export const listDismissedTweetIdsForCurrentUser = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const feedback = await ctx.db
			.query("suggestionFeedback")
			.withIndex("by_user_id_created_at", (query) => query.eq("userId", user._id))
			.collect();

		const dismissed = new Set<string>();
		for (const entry of feedback) {
			if (entry.status !== "dismissed") {
				continue;
			}
			const suggestion = await ctx.db.get(entry.suggestionId);
			if (suggestion) {
				dismissed.add(suggestion.tweetId);
			}
		}
		return Array.from(dismissed);
	},
});

export const getSuggestionByIdForCurrentUser = queryGeneric({
	args: {
		suggestionId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const suggestionId = ctx.db.normalizeId("suggestions", args.suggestionId);
		if (!suggestionId) {
			return null;
		}
		const suggestion = await ctx.db.get(suggestionId);
		if (!suggestion || String(suggestion.userId) !== String(user._id)) {
			return null;
		}
		return toSuggestion(suggestion);
	},
});
