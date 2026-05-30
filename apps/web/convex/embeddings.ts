import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel.js";
import { action, internalQuery, mutation, query } from "./_generated/server.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { requireUserBySession } from "./auth_helpers.js";

type EmbeddingSourceType = "bookmark" | "analysis" | "takeaway";
type DbCtx = QueryCtx | MutationCtx;

interface EmbeddingRecord {
	_id: Id<"embeddings">;
	userId: Id<"users">;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
	createdAt: number;
	updatedAt: number;
}

interface ScoredEmbeddingRecord extends EmbeddingRecord {
	_score: number;
}

const SOURCE_TYPE_VALUES = ["bookmark", "analysis", "takeaway"] as const;
const VECTOR_SEARCH_MAX_LIMIT = 256;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_RETURN_LIMIT = 100;
const SOURCE_TYPE_OVERFETCH_FACTOR = 4;

const embeddingSourceType = v.union(v.literal("bookmark"), v.literal("analysis"), v.literal("takeaway"));
const scoredEmbeddingId = v.object({
	_id: v.id("embeddings"),
	_score: v.number(),
});

const getCurrentUserIdRef = makeFunctionReference<"query", Record<string, never>, Id<"users">>(
	"embeddings:getCurrentUserId",
);
const getEmbeddingDocsByIdsRef = makeFunctionReference<
	"query",
	{ results: Array<{ _id: Id<"embeddings">; _score: number }> },
	ScoredEmbeddingRecord[]
>("embeddings:getEmbeddingDocsByIds");

function normalizeLimit(limit?: number): number {
	if (limit === undefined) {
		return DEFAULT_SEARCH_LIMIT;
	}
	if (!Number.isFinite(limit)) {
		return DEFAULT_SEARCH_LIMIT;
	}
	return Math.min(Math.max(Math.trunc(limit), 1), MAX_RETURN_LIMIT);
}

function toSearchLimit(limit: number, sourceTypes?: EmbeddingSourceType[]): number {
	if (!sourceTypes || sourceTypes.length === 0) {
		return limit;
	}
	return Math.min(limit * SOURCE_TYPE_OVERFETCH_FACTOR, VECTOR_SEARCH_MAX_LIMIT);
}

function normalizeSourceTypes(sourceTypes?: EmbeddingSourceType[]): Set<EmbeddingSourceType> | null {
	if (!sourceTypes || sourceTypes.length === 0) {
		return null;
	}
	return new Set(sourceTypes.filter((sourceType) => SOURCE_TYPE_VALUES.includes(sourceType)));
}

function toEmbeddingRecord(record: Doc<"embeddings">): EmbeddingRecord {
	return {
		_id: record._id,
		userId: record.userId,
		sourceType: record.sourceType,
		sourceId: record.sourceId,
		text: record.text,
		contentHash: record.contentHash,
		model: record.model,
		embedding: record.embedding,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

function toScoredEmbeddingRecord(record: Doc<"embeddings">, score: number): ScoredEmbeddingRecord {
	return {
		...toEmbeddingRecord(record),
		_score: score,
	};
}

async function listEmbeddingsForSource({
	ctx,
	userId,
	sourceType,
	sourceId,
}: {
	ctx: DbCtx;
	userId: Id<"users">;
	sourceType: EmbeddingSourceType;
	sourceId: string;
}) {
	const records = await ctx.db
		.query("embeddings")
		.withIndex("by_source", (index) => index.eq("sourceType", sourceType).eq("sourceId", sourceId))
		.collect();

	return records.filter((record) => record.userId === userId);
}

function pickLatestRecord(records: Doc<"embeddings">[]): Doc<"embeddings"> | null {
	if (records.length === 0) {
		return null;
	}
	return records.reduce((latest, record) => (record.updatedAt > latest.updatedAt ? record : latest));
}

export const upsertEmbedding = mutation({
	args: {
		sourceType: embeddingSourceType,
		sourceId: v.string(),
		text: v.string(),
		contentHash: v.string(),
		model: v.string(),
		embedding: v.array(v.float64()),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const existingRecords = await listEmbeddingsForSource({
			ctx,
			userId: user._id,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
		});
		const existing = pickLatestRecord(existingRecords);
		for (const duplicate of existingRecords) {
			if (existing && duplicate._id !== existing._id) {
				await ctx.db.delete(duplicate._id);
			}
		}

		if (existing && existing.contentHash === args.contentHash) {
			return toEmbeddingRecord(existing);
		}

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				text: args.text,
				contentHash: args.contentHash,
				model: args.model,
				embedding: args.embedding,
				updatedAt: now,
			});
			return toEmbeddingRecord({
				...existing,
				text: args.text,
				contentHash: args.contentHash,
				model: args.model,
				embedding: args.embedding,
				updatedAt: now,
			});
		}

		const embeddingId = await ctx.db.insert("embeddings", {
			userId: user._id,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			text: args.text,
			contentHash: args.contentHash,
			model: args.model,
			embedding: args.embedding,
			createdAt: now,
			updatedAt: now,
		});

		return {
			_id: embeddingId,
			userId: user._id,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			text: args.text,
			contentHash: args.contentHash,
			model: args.model,
			embedding: args.embedding,
			createdAt: now,
			updatedAt: now,
		};
	},
});

export const deleteEmbeddingsForSource = mutation({
	args: {
		sourceType: embeddingSourceType,
		sourceId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const records = await listEmbeddingsForSource({
			ctx,
			userId: user._id,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
		});
		await Promise.all(records.map((record) => ctx.db.delete(record._id)));
		return { deletedCount: records.length };
	},
});

export const getEmbeddingDocsByIds = query({
	args: {
		results: v.array(scoredEmbeddingId),
	},
	handler: async (ctx, args) => {
		const user = await requireUserBySession(ctx);
		const records = [];
		for (const result of args.results) {
			const record = await ctx.db.get(result._id);
			if (!record || record.userId !== user._id) {
				continue;
			}
			records.push(toScoredEmbeddingRecord(record, result._score));
		}
		return records;
	},
});

export const getCurrentUserId = internalQuery({
	args: {},
	handler: async (ctx) => {
		const user = await requireUserBySession(ctx);
		return user._id;
	},
});

export const searchSimilar = action({
	args: {
		vector: v.array(v.float64()),
		limit: v.optional(v.number()),
		sourceTypes: v.optional(v.array(embeddingSourceType)),
	},
	handler: async (ctx, args) => {
		const userId = await ctx.runQuery(getCurrentUserIdRef, {});
		const limit = normalizeLimit(args.limit);
		const sourceTypes = normalizeSourceTypes(args.sourceTypes);
		const vectorResults = await ctx.vectorSearch("embeddings", "by_embedding", {
			vector: args.vector,
			limit: toSearchLimit(limit, args.sourceTypes),
			filter: (vectorQuery) => vectorQuery.eq("userId", userId),
		});
		const records = await ctx.runQuery(getEmbeddingDocsByIdsRef, {
			results: vectorResults,
		});
		const filtered = sourceTypes
			? records.filter((record) => sourceTypes.has(record.sourceType))
			: records;
		return filtered.slice(0, limit);
	},
});
