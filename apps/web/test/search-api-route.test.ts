import assert from "node:assert/strict";
import test from "node:test";

import {
	SearchRequestSchema,
	SearchResultSchema,
	type SearchResponse,
	type SearchSourceType,
} from "@tenbrains/contracts";

import { handleSearchPost } from "../app/api/me/search/route.js";
import type { ScoredEmbeddingRecord } from "../src/server/convex-admin.js";

type SearchRouteDependencies = NonNullable<Parameters<typeof handleSearchPost>[1]>;
type SearchCall = Parameters<SearchRouteDependencies["searchSimilarEmbeddingsForSession"]>[0];
type CapturedReport = Parameters<SearchRouteDependencies["reportServerError"]>[0];

interface TestSessionUser {
	id: string;
	email: string;
	name: string;
}

interface TestSession {
	user: TestSessionUser;
}

interface TestDependencyOptions {
	session?: TestSession | null;
	key?: string | null;
	embedFailure?: Error;
	searchRows?: ScoredEmbeddingRecord[];
}

const authedUser: TestSessionUser = {
	id: "user_1",
	email: "user@example.com",
	name: "User",
};

function createRequest(body: unknown): Request {
	return new Request("http://localhost/api/me/search", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function createEmptyRequest(): Request {
	return new Request("http://localhost/api/me/search", {
		method: "POST",
		headers: { "content-type": "application/json" },
	});
}

function createScoredEmbeddingRecord({
	sourceType,
	sourceId,
	score,
	text,
}: {
	sourceType: SearchSourceType;
	sourceId: string;
	score: number;
	text: string;
}): ScoredEmbeddingRecord {
	return {
		_id: `embedding_${sourceId}`,
		userId: authedUser.id,
		sourceType,
		sourceId,
		text,
		contentHash: `hash_${sourceId}`,
		model: "text-embedding-3-small",
		embedding: [0.1, 0.2, 0.3],
		createdAt: 100,
		updatedAt: 200,
		_score: score,
	};
}

function createDependencies({
	session = { user: authedUser },
	key = "sk-test",
	embedFailure,
	searchRows = [],
}: TestDependencyOptions = {}) {
	const embedCalls: string[][] = [];
	const searchCalls: SearchCall[] = [];
	const reports: CapturedReport[] = [];

	const dependencies: SearchRouteDependencies = {
		validateStartupEnvIfNeeded: () => {},
		getServerAuthSession: async () => session,
		resolveEmbeddingKey: async () => key,
		embedTexts: async ({ texts }) => {
			embedCalls.push(texts);
			if (embedFailure) {
				throw embedFailure;
			}
			return {
				model: "text-embedding-3-small",
				dimensions: 1536,
				vectors: [[0.42, 0.24, 0.12]],
			};
		},
		searchSimilarEmbeddingsForSession: async (input) => {
			searchCalls.push({
				...input,
				vector: [...input.vector],
				sourceTypes: input.sourceTypes ? [...input.sourceTypes] : undefined,
			});
			return searchRows;
		},
		reportServerError: (event) => {
			reports.push(event);
		},
	};

	return {
		dependencies,
		embedCalls,
		searchCalls,
		reports,
	};
}

test("POST /api/me/search returns 401 when unauthenticated", async () => {
	const { dependencies, embedCalls, searchCalls } = createDependencies({
		session: null,
	});

	const response = await handleSearchPost(createRequest({ query: "agent memory" }), dependencies);

	assert.equal(response.status, 401);
	assert.equal(embedCalls.length, 0);
	assert.equal(searchCalls.length, 0);
});

test("POST /api/me/search returns 400 for invalid bodies", async () => {
	const invalidRequests = [
		{ name: "empty body", request: createEmptyRequest() },
		{ name: "missing query", request: createRequest({}) },
		{ name: "empty query", request: createRequest({ query: "   " }) },
		{ name: "over max query", request: createRequest({ query: "x".repeat(257) }) },
		{ name: "wrong types", request: createRequest({ query: 12, sourceTypes: ["bookmark"], limit: "10" }) },
	];

	for (const invalidRequest of invalidRequests) {
		const { dependencies, embedCalls, searchCalls } = createDependencies();
		const response = await handleSearchPost(invalidRequest.request, dependencies);

		assert.equal(response.status, 400, invalidRequest.name);
		assert.equal(embedCalls.length, 0, invalidRequest.name);
		assert.equal(searchCalls.length, 0, invalidRequest.name);
	}
});

test("POST /api/me/search returns needsKey when no embedding key resolves", async () => {
	const { dependencies, embedCalls, searchCalls } = createDependencies({
		key: null,
	});

	const response = await handleSearchPost(createRequest({ query: "agent memory" }), dependencies);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as SearchResponse;
	assert.deepEqual(payload, {
		query: "agent memory",
		needsKey: true,
		results: [],
	});
	assert.equal(embedCalls.length, 0);
	assert.equal(searchCalls.length, 0);
});

test("POST /api/me/search embeds the query and returns ranked flat results", async () => {
	const searchRows = [
		createScoredEmbeddingRecord({
			sourceType: "takeaway",
			sourceId: "takeaway_1",
			score: 0.7,
			text: "Takeaway about long-term memory.",
		}),
		createScoredEmbeddingRecord({
			sourceType: "bookmark",
			sourceId: "bookmark_1",
			score: 0.95,
			text: "Bookmark about semantic agent memory.",
		}),
		createScoredEmbeddingRecord({
			sourceType: "analysis",
			sourceId: "analysis_1",
			score: 0.85,
			text: "Analysis of retrieval workflows.",
		}),
	];
	const { dependencies, embedCalls, searchCalls } = createDependencies({
		searchRows,
	});

	const response = await handleSearchPost(
		createRequest({
			query: "  agent memory  ",
			sourceTypes: ["bookmark", "analysis", "takeaway"],
			limit: 3,
		}),
		dependencies,
	);

	assert.equal(response.status, 200);
	assert.deepEqual(embedCalls, [["agent memory"]]);
	assert.equal(searchCalls.length, 1);
	assert.deepEqual(searchCalls[0]?.vector, [0.42, 0.24, 0.12]);
	assert.equal(searchCalls[0]?.limit, 3);
	assert.deepEqual(searchCalls[0]?.sourceTypes, ["bookmark", "analysis", "takeaway"]);

	const payload = (await response.json()) as SearchResponse;
	assert.equal(payload.query, "agent memory");
	assert.equal(payload.results.length, 3);
	assert.deepEqual(
		payload.results.map((result) => result.score),
		[0.95, 0.85, 0.7],
	);
	for (const result of payload.results) {
		SearchResultSchema.parse(result);
	}
	assert.deepEqual(payload.results[0], {
		sourceType: "bookmark",
		sourceId: "bookmark_1",
		text: "Bookmark about semantic agent memory.",
		score: 0.95,
		createdAt: 100,
		updatedAt: 200,
	});
});

test("POST /api/me/search passes only the authed session user to the search wrapper", async () => {
	const { dependencies, searchCalls } = createDependencies({
		searchRows: [
			createScoredEmbeddingRecord({
				sourceType: "bookmark",
				sourceId: "bookmark_1",
				score: 0.9,
				text: "Private saved source.",
			}),
		],
	});

	const response = await handleSearchPost(
		createRequest({
			query: "private saved source",
			userId: "attacker_user",
			user: { id: "attacker_user" },
		}),
		dependencies,
	);

	assert.equal(response.status, 200);
	assert.equal(searchCalls.length, 1);
	assert.equal(searchCalls[0]?.sessionUser.id, authedUser.id);
	assert.notEqual(searchCalls[0]?.sessionUser.id, "attacker_user");

	const requestShapeKeys = Object.keys(SearchRequestSchema.shape);
	assert.equal(requestShapeKeys.includes("userId"), false);
	assert.equal(requestShapeKeys.includes("user"), false);
	assert.equal(requestShapeKeys.includes("sessionUser"), false);
});

test("POST /api/me/search reports embedding errors and returns 500", async () => {
	const { dependencies, reports, searchCalls } = createDependencies({
		embedFailure: new Error("embedding failed"),
	});

	const response = await handleSearchPost(createRequest({ query: "agent memory" }), dependencies);

	assert.equal(response.status, 500);
	assert.equal(searchCalls.length, 0);
	assert.equal(reports.length, 1);
	assert.equal(reports[0]?.scope, "api.search.failure");
});
