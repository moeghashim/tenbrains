import { resolveProviderCatalogModel } from "@tenbrains/ai";
import { ProviderIdSchema, UserPreferencesInputSchema, UserPreferencesResultSchema } from "@tenbrains/contracts";
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

export function normalizeStoredProvider(provider: string | undefined): "openai" | "google" | "xai" | "anthropic" {
	const parsed = ProviderIdSchema.safeParse(provider);
	return parsed.success ? parsed.data : "openai";
}

export function normalizeStoredModel(
	model: string | undefined,
	provider: "openai" | "google" | "xai" | "anthropic",
): string {
	return resolveProviderCatalogModel(provider, model);
}

export const getPreferences = queryGeneric({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		const existing = pickLatestRecord(await ctx.db
			.query("userPreferences")
			.withIndex("by_user_id", (query) => query.eq("userId", user._id))
			.collect());
		if (existing) {
			const defaultProvider = normalizeStoredProvider(existing.defaultProvider);
			return UserPreferencesResultSchema.parse({
				userId: String(existing.userId),
				defaultProvider,
				defaultModel: normalizeStoredModel(existing.defaultModel, defaultProvider),
				learningMinutes: existing.learningMinutes,
				updatedAt: existing.updatedAt,
			});
		}

		return UserPreferencesResultSchema.parse({
			userId: String(user._id),
			defaultProvider: "openai",
			defaultModel: resolveProviderCatalogModel("openai"),
			learningMinutes: 10,
			updatedAt: Date.now(),
		});
	},
});

export const updatePreferences = mutationGeneric({
	args: {
		defaultProvider: v.string(),
		defaultModel: v.string(),
		learningMinutes: v.number(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const validated = UserPreferencesInputSchema.parse(args);
		const now = Date.now();
		const existing = pickLatestRecord(await ctx.db
			.query("userPreferences")
			.withIndex("by_user_id", (query) => query.eq("userId", user._id))
			.collect());
		if (existing) {
			await ctx.db.patch(existing._id, {
				defaultProvider: validated.defaultProvider,
				defaultModel: validated.defaultModel,
				learningMinutes: validated.learningMinutes,
				updatedAt: now,
			});
			return UserPreferencesResultSchema.parse({
				userId: String(user._id),
				defaultProvider: validated.defaultProvider,
				defaultModel: validated.defaultModel,
				learningMinutes: validated.learningMinutes,
				updatedAt: now,
			});
		}

		await ctx.db.insert("userPreferences", {
			userId: user._id,
			defaultProvider: validated.defaultProvider,
			defaultModel: validated.defaultModel,
			learningMinutes: validated.learningMinutes,
			updatedAt: now,
		});
		return UserPreferencesResultSchema.parse({
			userId: String(user._id),
			defaultProvider: validated.defaultProvider,
			defaultModel: validated.defaultModel,
			learningMinutes: validated.learningMinutes,
			updatedAt: now,
		});
	},
});
