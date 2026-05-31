import assert from "node:assert/strict";
import test from "node:test";

import type { AccountTakeawaySnapshot, AnalyzeTweetResult, SavedAnalysis, SavedBookmark } from "@tenbrains/contracts";

import { handleBookmarksDelete } from "../app/api/bookmarks/route.js";
import {
	type EmbedAndStoreSourceDependencies,
	type EmbeddingSourceType,
	computeEmbeddingContentHash,
	embedAnalysisSource,
	embedBookmarkSource,
	embedTakeawaySnapshotSource,
} from "../src/embeddings/embed-source.js";

interface SessionUser {
	id: string;
	email: string;
	name: string;
}

interface CapturedUpsert {
	sessionUser: SessionUser;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
}

interface CapturedReport {
	scope: string;
	error: unknown;
	metadata?: Record<string, string | number | boolean | null>;
}

const sessionUser: SessionUser = {
	id: "user_1",
	email: "user@example.com",
	name: "User",
};

function createBookmark(): SavedBookmark {
	return {
		id: "bookmark_1",
		userId: "user_1",
		tweetId: "tweet_1",
		tweetText: "Ship the smaller change first.",
		tweetUrlOrId: "https://x.com/ctatedev/status/tweet_1",
		authorUsername: "ctatedev",
		tags: ["shipping"],
		source: "manual",
		createdAt: 100,
		updatedAt: 200,
	};
}

function createAnalysis(): SavedAnalysis {
	const novelConcepts: AnalyzeTweetResult["novelConcepts"] = [
		{ name: "Small Batches", whyItMattersInTweet: "A" },
		{ name: "Feedback Loops", whyItMattersInTweet: "B" },
		{ name: "Risk", whyItMattersInTweet: "C" },
		{ name: "Cadence", whyItMattersInTweet: "D" },
		{ name: "Scope", whyItMattersInTweet: "E" },
	];
	return {
		id: "analysis_1",
		userId: "user_1",
		tweetUrlOrId: "https://x.com/ctatedev/status/tweet_1",
		provider: "openai",
		model: "gpt-4.1",
		topic: "Shipping discipline",
		summary: "The tweet argues for small, frequent releases.",
		intent: "Teach a practical delivery heuristic.",
		novelConcepts,
		createdAt: 100,
	};
}

function createTakeawaySnapshot(): AccountTakeawaySnapshot {
	return {
		id: "snapshot_1",
		userId: "user_1",
		followId: "follow_1",
		accountUsername: "ctatedev",
		provider: "openai",
		model: "gpt-4.1",
		summary: "The account posts practical shipping lessons.",
		takeaways: ["Shipping cadence is a recurring theme.", "Examples stay concrete."],
		sampleSize: 2,
		snapshotDateKey: "2026-05-30",
		posts: [],
		createdAt: 100,
	};
}

function createEmbeddingDependencies({
	key = "sk-test",
	embedFailure,
}: {
	key?: string | null;
	embedFailure?: Error;
} = {}) {
	const upserts: CapturedUpsert[] = [];
	const reports: CapturedReport[] = [];
	let embedCallCount = 0;
	const dependencies: EmbedAndStoreSourceDependencies = {
		resolveEmbeddingKey: async () => key,
		embedTexts: async ({ texts }) => {
			embedCallCount += 1;
			if (embedFailure) {
				throw embedFailure;
			}
			return {
				model: "text-embedding-3-small",
				dimensions: 1536,
				vectors: [[0.1, 0.2, 0.3]],
			};
		},
		upsertEmbeddingForSession: async (input) => {
			upserts.push(input as CapturedUpsert);
		},
		reportServerError: (event) => {
			reports.push(event);
		},
	};
	return {
		dependencies,
		upserts,
		reports,
		getEmbedCallCount: () => embedCallCount,
	};
}

test("new bookmark with resolved key stores an embedding row", async () => {
	const bookmark = createBookmark();
	const { dependencies, upserts } = createEmbeddingDependencies();

	await embedBookmarkSource({
		sessionUser,
		bookmark,
		dependencies,
	});

	assert.equal(upserts.length, 1);
	assert.equal(upserts[0]?.sourceType, "bookmark");
	assert.equal(upserts[0]?.sourceId, bookmark.tweetId);
	assert.equal(upserts[0]?.text, bookmark.tweetText);
	assert.equal(upserts[0]?.contentHash, computeEmbeddingContentHash(bookmark.tweetText));
	assert.equal(upserts[0]?.model, "text-embedding-3-small");
	assert.deepEqual(upserts[0]?.embedding, [0.1, 0.2, 0.3]);
});

test("embedding failure after bookmark save reports telemetry without throwing", async () => {
	const bookmark = createBookmark();
	const { dependencies, reports } = createEmbeddingDependencies({
		embedFailure: new Error("provider down"),
	});

	await assert.doesNotReject(async () => {
		const saved = bookmark;
		await embedBookmarkSource({
			sessionUser,
			bookmark: saved,
			dependencies,
		});
		assert.equal(saved.tweetId, bookmark.tweetId);
	});

	assert.equal(reports[0]?.scope, "embeddings.embed_on_write_failure");
});

test("missing embedding key skips embedding and logs without throwing", async () => {
	const bookmark = createBookmark();
	const { dependencies, upserts, reports, getEmbedCallCount } = createEmbeddingDependencies({
		key: null,
	});

	await embedBookmarkSource({
		sessionUser,
		bookmark,
		dependencies,
	});

	assert.equal(getEmbedCallCount(), 0);
	assert.equal(upserts.length, 0);
	assert.equal(reports[0]?.scope, "embeddings.skipped_no_key");
	assert.equal(reports[0]?.metadata?.level, "info");
});

test("bookmark delete invokes embedding cleanup with the bookmark tweet id", async () => {
	const bookmark = createBookmark();
	let deletedSource: { sourceType: EmbeddingSourceType; sourceId: string } | null = null;

	const response = await handleBookmarksDelete(
		new Request("http://localhost/api/bookmarks", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				bookmarkId: bookmark.id,
			}),
		}),
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => ({ user: sessionUser }),
			saveBookmarkForSession: async () => bookmark,
			listBookmarksForSession: async () => [bookmark],
			updateBookmarkTagsForSession: async () => bookmark,
			deleteBookmarkForSession: async ({ bookmarkId }) => ({ bookmarkId }),
			deleteEmbeddingsForSourceForSession: async ({ sourceType, sourceId }) => {
				deletedSource = { sourceType, sourceId };
				return { deletedCount: 1 };
			},
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	assert.deepEqual(deletedSource, {
		sourceType: "bookmark",
		sourceId: bookmark.tweetId,
	});
});

test("analysis persist stores composed semantic analysis text", async () => {
	const analysis = createAnalysis();
	const { dependencies, upserts } = createEmbeddingDependencies();

	await embedAnalysisSource({
		sessionUser,
		analysis,
		dependencies,
	});

	assert.equal(upserts[0]?.sourceType, "analysis");
	assert.equal(upserts[0]?.sourceId, analysis.id);
	assert.match(upserts[0]?.text ?? "", /Shipping discipline/);
	assert.match(upserts[0]?.text ?? "", /The tweet argues/);
	assert.match(upserts[0]?.text ?? "", /Teach a practical/);
	assert.match(upserts[0]?.text ?? "", /Small Batches/);
	assert.match(upserts[0]?.text ?? "", /Feedback Loops/);
});

test("analysis embedding failure is reported without throwing", async () => {
	const { dependencies, reports } = createEmbeddingDependencies({
		embedFailure: new Error("embedding failed"),
	});

	await assert.doesNotReject(() =>
		embedAnalysisSource({
			sessionUser,
			analysis: createAnalysis(),
			dependencies,
		}),
	);

	assert.equal(reports[0]?.scope, "embeddings.embed_on_write_failure");
	assert.equal(reports[0]?.metadata?.sourceType, "analysis");
});

test("takeaway snapshot persist stores summary and takeaway text", async () => {
	const snapshot = createTakeawaySnapshot();
	const { dependencies, upserts } = createEmbeddingDependencies();

	await embedTakeawaySnapshotSource({
		sessionUser,
		snapshot,
		dependencies,
	});

	assert.equal(upserts[0]?.sourceType, "takeaway");
	assert.equal(upserts[0]?.sourceId, snapshot.id);
	assert.match(upserts[0]?.text ?? "", /practical shipping lessons/);
	assert.match(upserts[0]?.text ?? "", /Shipping cadence/);
	assert.match(upserts[0]?.text ?? "", /Examples stay concrete/);
});

test("takeaway snapshot embedding failure is reported without throwing", async () => {
	const { dependencies, reports } = createEmbeddingDependencies({
		embedFailure: new Error("embedding failed"),
	});

	await assert.doesNotReject(() =>
		embedTakeawaySnapshotSource({
			sessionUser,
			snapshot: createTakeawaySnapshot(),
			dependencies,
		}),
	);

	assert.equal(reports[0]?.scope, "embeddings.embed_on_write_failure");
	assert.equal(reports[0]?.metadata?.sourceType, "takeaway");
});
