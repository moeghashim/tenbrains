import assert from "node:assert/strict";
import test from "node:test";

import { runBackfill } from "../../../scripts/backfill-embeddings.mjs";
import { computeEmbeddingContentHash } from "../src/embeddings/source-content.js";

type SourceType = "bookmark" | "analysis" | "takeaway";

interface FakeUser {
	_id: string;
	xUserId: string | null;
}

interface FakeBookmark {
	_id: string;
	userId: string;
	tweetId: string;
	tweetText: string;
}

interface FakeAnalysis {
	_id: string;
	userId: string;
	topic: string;
	summary: string;
	intent: string;
	novelConcepts: Array<{ name: string; whyItMattersInTweet: string }>;
}

interface FakeTakeawaySnapshot {
	_id: string;
	userId: string;
	summary: string;
	takeaways: string[];
}

interface CapturedUpsert {
	userId: string;
	sourceType: SourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
}

class FakeAiProviderError extends Error {
	readonly code = "RATE_LIMITED";
	readonly provider = "openai";
	readonly retryable = true;
	readonly status = 429;
}

const user: FakeUser = {
	_id: "user_1",
	xUserId: "x_user_1",
};

const bookmark: FakeBookmark = {
	_id: "bookmark_1",
	userId: user._id,
	tweetId: "tweet_1",
	tweetText: "Backfill this saved source.",
};

function sourceKey({
	userId,
	sourceType,
	sourceId,
}: {
	userId: string;
	sourceType: SourceType;
	sourceId: string;
}): string {
	return `${userId}:${sourceType}:${sourceId}`;
}

function paginateItems<T>(items: T[], cursor: string | null, limit: number) {
	const start = cursor ? Number(cursor) : 0;
	const page = items.slice(start, start + limit);
	const nextIndex = start + page.length;
	return {
		items: page,
		nextCursor: nextIndex < items.length ? String(nextIndex) : null,
	};
}

function createFakeDeps({
	users = [user],
	bookmarks = [bookmark],
	analyses = [],
	takeaways = [],
	encryptedKeys = new Map([[user._id, "sk-user"]]),
	existingHashes = new Map<string, string>(),
	failuresBeforeEmbedSuccess = 0,
}: {
	users?: FakeUser[];
	bookmarks?: FakeBookmark[];
	analyses?: FakeAnalysis[];
	takeaways?: FakeTakeawaySnapshot[];
	encryptedKeys?: Map<string, string>;
	existingHashes?: Map<string, string>;
	failuresBeforeEmbedSuccess?: number;
} = {}) {
	const embedCalls: string[][] = [];
	const upserts: CapturedUpsert[] = [];
	const logs: string[] = [];
	const sleeps: number[] = [];
	let embedAttempts = 0;

	return {
		deps: {
			listBackfillUsers: async ({ cursor, limit }: { cursor: string | null; limit: number }) =>
				paginateItems(users, cursor, limit),
			getEncryptedOpenAiCredentialForUser: async ({ userId }: { userId: string }) => {
				const encryptedApiKey = encryptedKeys.get(userId);
				return encryptedApiKey ? { encryptedApiKey, updatedAt: 100 } : null;
			},
			listBackfillBookmarksForUser: async ({
				userId,
				cursor,
				limit,
			}: {
				userId: string;
				cursor: string | null;
				limit: number;
			}) =>
				paginateItems(
					bookmarks
						.filter((item) => item.userId === userId)
						.map((item) => ({ _id: item._id, tweetId: item.tweetId, tweetText: item.tweetText })),
					cursor,
					limit,
				),
			listBackfillAnalysesForUser: async ({
				userId,
				cursor,
				limit,
			}: {
				userId: string;
				cursor: string | null;
				limit: number;
			}) =>
				paginateItems(
					analyses
						.filter((item) => item.userId === userId)
						.map((item) => ({
							_id: item._id,
							topic: item.topic,
							summary: item.summary,
							intent: item.intent,
							novelConcepts: item.novelConcepts,
						})),
					cursor,
					limit,
				),
			listBackfillTakeawaySnapshotsForUser: async ({
				userId,
				cursor,
				limit,
			}: {
				userId: string;
				cursor: string | null;
				limit: number;
			}) =>
				paginateItems(
					takeaways
						.filter((item) => item.userId === userId)
						.map((item) => ({ _id: item._id, summary: item.summary, takeaways: item.takeaways })),
					cursor,
					limit,
				),
			getExistingEmbeddingContentHash: async ({
				userId,
				sourceType,
				sourceId,
			}: {
				userId: string;
				sourceType: SourceType;
				sourceId: string;
			}) => existingHashes.get(sourceKey({ userId, sourceType, sourceId })) ?? null,
			upsertEmbedding: async (input: CapturedUpsert) => {
				upserts.push(input);
				existingHashes.set(
					sourceKey({
						userId: input.userId,
						sourceType: input.sourceType,
						sourceId: input.sourceId,
					}),
					input.contentHash,
				);
			},
			embedTexts: async ({ texts }: { texts: string[] }) => {
				embedAttempts += 1;
				if (embedAttempts <= failuresBeforeEmbedSuccess) {
					throw new FakeAiProviderError("rate limited");
				}
				embedCalls.push(texts);
				return {
					model: "text-embedding-3-small",
					dimensions: 1536,
					vectors: texts.map((_, index) => [index + 0.1, index + 0.2]),
				};
			},
			decryptSecret: (payload: string) => payload,
			sleep: async (delayMs: number) => {
				sleeps.push(delayMs);
			},
			log: (message: string) => {
				logs.push(message);
			},
			now: (() => {
				let timestamp = 0;
				return () => {
					timestamp += 1000;
					return timestamp;
				};
			})(),
		},
		embedCalls,
		upserts,
		logs,
		sleeps,
		getEmbedAttempts: () => embedAttempts,
	};
}

test("backfill dry-run plans work without embedding or upserting", async () => {
	const fake = createFakeDeps();

	const summary = await runBackfill({
		options: { dryRun: true, source: "bookmark" },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.bookmarksConsidered, 1);
	assert.equal(summary.bookmarksPlanned, 1);
	assert.equal(summary.bookmarksEmbedded, 0);
	assert.equal(fake.embedCalls.length, 0);
	assert.equal(fake.upserts.length, 0);
	assert.equal(summary.approxTokensUsed, 0);
});

test("backfill skips rows whose existing contentHash matches", async () => {
	const existingHashes = new Map<string, string>([
		[
			sourceKey({ userId: user._id, sourceType: "bookmark", sourceId: bookmark.tweetId }),
			computeEmbeddingContentHash(bookmark.tweetText),
		],
	]);
	const fake = createFakeDeps({ existingHashes });

	const summary = await runBackfill({
		options: { source: "bookmark" },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.bookmarksConsidered, 1);
	assert.equal(summary.bookmarksSkipped, 1);
	assert.equal(summary.bookmarksEmbedded, 0);
	assert.equal(fake.embedCalls.length, 0);
	assert.equal(fake.upserts.length, 0);
});

test("backfill embeds and upserts when an existing contentHash differs", async () => {
	const existingHashes = new Map<string, string>([
		[sourceKey({ userId: user._id, sourceType: "bookmark", sourceId: bookmark.tweetId }), "old_hash"],
	]);
	const fake = createFakeDeps({ existingHashes });

	const summary = await runBackfill({
		options: { source: "bookmark" },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.bookmarksEmbedded, 1);
	assert.equal(fake.embedCalls.length, 1);
	assert.equal(fake.upserts.length, 1);
	assert.equal(fake.upserts[0]?.contentHash, computeEmbeddingContentHash(bookmark.tweetText));
});

test("backfill retries 429 embedding failures before succeeding", async () => {
	const fake = createFakeDeps({ failuresBeforeEmbedSuccess: 2 });

	const summary = await runBackfill({
		options: { source: "bookmark" },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.bookmarksEmbedded, 1);
	assert.equal(summary.retryCount, 2);
	assert.equal(fake.getEmbedAttempts(), 3);
	assert.deepEqual(fake.sleeps, [1000, 2000]);
});

test("backfill skips a user with no stored key and no platform fallback", async () => {
	const fake = createFakeDeps({ encryptedKeys: new Map() });

	const summary = await runBackfill({
		options: { source: "bookmark" },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.usersProcessed, 0);
	assert.equal(summary.usersSkipped, 1);
	assert.equal(summary.bookmarksConsidered, 0);
	assert.equal(fake.embedCalls.length, 0);
	assert.equal(fake.upserts.length, 0);
	assert.match(fake.logs.join("\n"), /skipping user user_1: no embedding key/);
});

test("backfill uses shared analysis and takeaway text composition", async () => {
	const analysis: FakeAnalysis = {
		_id: "analysis_1",
		userId: user._id,
		topic: "Shipping discipline",
		summary: "Small releases reduce risk.",
		intent: "Teach a delivery heuristic.",
		novelConcepts: [{ name: "Small Batches", whyItMattersInTweet: "Keeps feedback quick." }],
	};
	const takeaway: FakeTakeawaySnapshot = {
		_id: "takeaway_1",
		userId: user._id,
		summary: "The account emphasizes practical execution.",
		takeaways: ["Ship in small batches.", "Prefer short feedback loops."],
	};
	const fake = createFakeDeps({
		bookmarks: [],
		analyses: [analysis],
		takeaways: [takeaway],
	});

	const summary = await runBackfill({
		options: { source: "all", batchSize: 2 },
		deps: fake.deps,
		env: {},
	});

	assert.equal(summary.analysesEmbedded, 1);
	assert.equal(summary.takeawaySnapshotsEmbedded, 1);
	assert.match(fake.upserts[0]?.text ?? "", /Small Batches/);
	assert.match(fake.upserts[1]?.text ?? "", /Prefer short feedback loops/);
});
