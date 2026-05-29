import { SavedAnalysisSchema } from "@tenbrains/contracts";
import { XApiV2Client } from "@tenbrains/x-client";
import {
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { v } from "convex/values";

import { buildAnalysisFromTweetPayload } from "../src/analysis/build-analysis.js";
import { reportServerError } from "../src/telemetry/report-error.js";
import { requireUserBySession } from "./auth_helpers.js";

export const createFromTweetUrl = mutationGeneric({
	args: {
		tweetUrlOrId: v.string(),
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		try {
			const user = await requireUserBySession(ctx);
			const client = new XApiV2Client();
			const tweet = await client.getTweetByUrlOrId(args.tweetUrlOrId);
			const analysis = buildAnalysisFromTweetPayload(tweet);
			const createdAt = Date.now();

			const id = await ctx.db.insert("analyses", {
				userId: user._id,
				tweetUrlOrId: args.tweetUrlOrId,
				provider: args.provider ?? "openai",
				model: args.model ?? "gpt-4.1",
				topic: analysis.topic,
				summary: analysis.summary,
				intent: analysis.intent,
				novelConcepts: analysis.novelConcepts,
				createdAt,
			});

			return SavedAnalysisSchema.parse({
				id: String(id),
				userId: String(user._id),
				tweetUrlOrId: args.tweetUrlOrId,
				provider: args.provider ?? "openai",
				model: args.model ?? "gpt-4.1",
				topic: analysis.topic,
				summary: analysis.summary,
				intent: analysis.intent,
				novelConcepts: analysis.novelConcepts,
				createdAt,
			});
		} catch (error) {
			reportServerError({
				scope: "analysis.createFromTweetUrl",
				error,
				metadata: {
					hasModelOverride: Boolean(args.model),
					provider: args.provider ?? "openai",
				},
			});
			throw error;
		}
	},
});

export const createFromComputed = mutationGeneric({
	args: {
		tweetUrlOrId: v.string(),
		provider: v.optional(v.string()),
		model: v.optional(v.string()),
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
		topic: v.string(),
		summary: v.string(),
		intent: v.string(),
		novelConcepts: v.array(
			v.object({
				name: v.string(),
				whyItMattersInTweet: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const createdAt = Date.now();
		const id = await ctx.db.insert("analyses", {
			userId: user._id,
			tweetUrlOrId: args.tweetUrlOrId,
			provider: args.provider ?? "openai",
			model: args.model ?? "gpt-4.1",
			thread: args.thread,
			topic: args.topic,
			summary: args.summary,
			intent: args.intent,
			novelConcepts: args.novelConcepts,
			createdAt,
		});

		return SavedAnalysisSchema.parse({
			id: String(id),
			userId: String(user._id),
			tweetUrlOrId: args.tweetUrlOrId,
			provider: args.provider ?? "openai",
			model: args.model ?? "gpt-4.1",
			thread: args.thread,
			topic: args.topic,
			summary: args.summary,
			intent: args.intent,
			novelConcepts: args.novelConcepts,
			createdAt,
		});
	},
});

export const createFromTweetPayload = mutationGeneric({
	args: {
		tweetUrlOrId: v.string(),
		provider: v.string(),
		model: v.optional(v.string()),
		tweet: v.object({
			id: v.string(),
			text: v.string(),
			authorId: v.optional(v.string()),
			authorUsername: v.optional(v.string()),
			authorName: v.optional(v.string()),
			authorAvatarUrl: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const analysis = buildAnalysisFromTweetPayload({
			id: args.tweet.id,
			text: args.tweet.text,
			authorId: args.tweet.authorId,
			authorUsername: args.tweet.authorUsername,
			authorName: args.tweet.authorName,
			authorAvatarUrl: args.tweet.authorAvatarUrl,
			raw: args.tweet,
		});
		const createdAt = Date.now();
		const id = await ctx.db.insert("analyses", {
			userId: user._id,
			tweetUrlOrId: args.tweetUrlOrId,
			provider: args.provider,
			model: args.model ?? "gpt-4.1",
			topic: analysis.topic,
			summary: analysis.summary,
			intent: analysis.intent,
			novelConcepts: analysis.novelConcepts,
			createdAt,
		});

		return SavedAnalysisSchema.parse({
			id: String(id),
			userId: String(user._id),
			tweetUrlOrId: args.tweetUrlOrId,
			provider: args.provider,
			model: args.model ?? "gpt-4.1",
			topic: analysis.topic,
			summary: analysis.summary,
			intent: analysis.intent,
			novelConcepts: analysis.novelConcepts,
			createdAt,
		});
	},
});

export const listByUser = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const records = await ctx.db
			.query("analyses")
			.withIndex("by_user_id_created_at", (query) => query.eq("userId", user._id))
			.collect();

		return records
			.sort((left, right) => right.createdAt - left.createdAt)
			.map((item) =>
				SavedAnalysisSchema.parse({
					id: String(item._id),
					userId: String(item.userId),
					tweetUrlOrId: item.tweetUrlOrId,
					provider: item.provider ?? "openai",
					model: item.model,
					thread: item.thread,
					topic: item.topic,
					summary: item.summary,
					intent: item.intent,
					novelConcepts: item.novelConcepts,
					createdAt: item.createdAt,
				}),
			);
	},
});
