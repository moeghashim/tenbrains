import {
	type ProviderId,
	ProviderCredentialSummaryListSchema,
	ProviderIdSchema,
} from "@tenbrains/contracts";
import {
	mutationGeneric,
	queryGeneric,
} from "convex/server";
import { v } from "convex/values";

import { requireUserBySession } from "./auth_helpers.js";

function pickLatestRecord<T extends { updatedAt: number }>(records: T[]): T | null {
	if (records.length === 0) {
		return null;
	}
	return records.reduce((latest, record) => (record.updatedAt > latest.updatedAt ? record : latest));
}

export const listByUser = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const records = await ctx.db
			.query("userProviderCredentials")
			.withIndex("by_user_id_provider", (query) => query.eq("userId", user._id))
			.collect();

		return ProviderCredentialSummaryListSchema.parse(
			records.map((record) => ({
				provider: ProviderIdSchema.parse(record.provider),
				configured: true,
				keyHint: record.keyHint,
				updatedAt: record.updatedAt,
			})),
		);
	},
});

export const getByProvider = queryGeneric({
	args: {
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const provider = ProviderIdSchema.parse(args.provider);
		const record = pickLatestRecord(await ctx.db
			.query("userProviderCredentials")
			.withIndex("by_user_id_provider", (query) => query.eq("userId", user._id))
			.filter((query) => query.eq(query.field("provider"), provider))
			.collect());
		if (!record) {
			return null;
		}

		return {
			provider,
			encryptedApiKey: record.encryptedApiKey,
			keyHint: record.keyHint,
			updatedAt: record.updatedAt,
		};
	},
});

export const upsert = mutationGeneric({
	args: {
		provider: v.string(),
		encryptedApiKey: v.string(),
		keyHint: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const provider = ProviderIdSchema.parse(args.provider) as ProviderId;
		const existing = pickLatestRecord(await ctx.db
			.query("userProviderCredentials")
			.withIndex("by_user_id_provider", (query) => query.eq("userId", user._id))
			.filter((query) => query.eq(query.field("provider"), provider))
			.collect());
		const updatedAt = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				encryptedApiKey: args.encryptedApiKey,
				keyHint: args.keyHint,
				updatedAt,
			});
		} else {
			await ctx.db.insert("userProviderCredentials", {
				userId: user._id,
				provider,
				encryptedApiKey: args.encryptedApiKey,
				keyHint: args.keyHint,
				updatedAt,
			});
		}

		return { provider, configured: true, keyHint: args.keyHint, updatedAt };
	},
});

export const remove = mutationGeneric({
	args: {
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const provider = ProviderIdSchema.parse(args.provider) as ProviderId;
		const existing = pickLatestRecord(await ctx.db
			.query("userProviderCredentials")
			.withIndex("by_user_id_provider", (query) => query.eq("userId", user._id))
			.filter((query) => query.eq(query.field("provider"), provider))
			.collect());

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		return { provider };
	},
});
