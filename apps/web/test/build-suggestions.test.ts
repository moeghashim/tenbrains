import assert from "node:assert/strict";
import test from "node:test";

import type { FollowSummary, SavedBookmark, Suggestion, TakeawayWorkspaceResponse } from "@tenbrains/contracts";
import type { TweetPayload } from "@tenbrains/x-client";

import type { ScoredEmbeddingRecord } from "../src/server/convex-admin.js";
import { buildSuggestionsForSession } from "../src/suggestions/build-suggestions.js";

interface SessionUser {
	id: string;
	email: string;
	name: string;
}

interface CapturedReport {
	scope: string;
	error: unknown;
	metadata?: Record<string, string | number | boolean | null>;
}

interface SessionUserLike {
	id: string;
	email?: string | null;
	name?: string | null;
}

type SuggestionDraft = Omit<Suggestion, "id" | "userId" | "createdAt" | "updatedAt">;

type SearchResult = Pick<ScoredEmbeddingRecord, "sourceType" | "_score">;

const sessionUser: SessionUser = {
	id: "user_1",
	email: "user@example.com",
	name: "User",
};

function createTweet({
	id,
	text,
	authorUsername = "candidate",
}: {
	id: string;
	text: string;
	authorUsername?: string;
}): TweetPayload {
	return {
		id,
		text,
		authorUsername,
		authorName: authorUsername,
		raw: {},
	};
}

function createBookmark({
	tweetText,
	tags = [],
}: {
	tweetText: string;
	tags?: string[];
}): SavedBookmark {
	return {
		id: "bookmark_1",
		userId: sessionUser.id,
		tweetId: "bookmark_tweet_1",
		tweetText,
		tweetUrlOrId: "https://x.com/bookmark/status/1",
		authorUsername: "bookmark",
		tags,
		source: "manual",
		createdAt: 100,
		updatedAt: 200,
	};
}

function createFollowSummary({
	subjectTags = ["agents"],
	creatorUsernames = [],
}: {
	subjectTags?: string[];
	creatorUsernames?: string[];
} = {}): FollowSummary {
	return {
		creatorFollows: creatorUsernames.map((creatorUsername, index) => ({
			id: `creator_follow_${index}`,
			userId: sessionUser.id,
			creatorUsername,
			scope: "all_feed",
			createdAt: 100,
			updatedAt: 200,
		})),
		subjectFollows: subjectTags.map((subjectTag, index) => ({
			id: `subject_follow_${index}`,
			userId: sessionUser.id,
			subjectTag,
			createdAt: 100,
			updatedAt: 200,
		})),
	};
}

function createXClient({
	searchTweets = [],
	latestByUsername = new Map<string, TweetPayload[]>(),
}: {
	searchTweets?: TweetPayload[];
	latestByUsername?: Map<string, TweetPayload[]>;
} = {}) {
	return {
		getLatestPostsByUsername: async (username: string) => latestByUsername.get(username) ?? [],
		searchRecentPosts: async () => ({ tweets: searchTweets }),
	};
}

function createSuggestionDependencies({
	bookmarks = [],
	followSummary = createFollowSummary(),
	takeawayWorkspace = { follows: [] },
	key = "sk-test",
	embedFailure,
	searchResults = [],
}: {
	bookmarks?: SavedBookmark[];
	followSummary?: FollowSummary;
	takeawayWorkspace?: TakeawayWorkspaceResponse;
	key?: string | null;
	embedFailure?: Error;
	searchResults?: SearchResult[];
} = {}) {
	const reports: CapturedReport[] = [];
	const embedCalls: string[][] = [];
	const searchCalls: number[][] = [];
	const upsertedSuggestions: Suggestion[] = [];

	return {
		dependencies: {
			listBookmarksForSession: async () => bookmarks,
			listFollowsForSession: async () => followSummary,
			listTakeawayWorkspaceForSession: async () => takeawayWorkspace,
			listDismissedSuggestionTweetIdsForSession: async () => [],
			getTakeawayHistoryForSession: async () => ({ history: [] }),
			upsertSuggestionsForSession: async ({
				sessionUser: upsertSessionUser,
				suggestions,
			}: {
				sessionUser: SessionUserLike;
				suggestions: SuggestionDraft[];
			}) => {
				const saved = suggestions.map((suggestion, index) => ({
					...suggestion,
					id: `suggestion_${index}`,
					userId: upsertSessionUser.id,
					createdAt: 100 + index,
					updatedAt: 200 + index,
				}));
				upsertedSuggestions.push(...saved);
				return { suggestions: saved };
			},
			resolveEmbeddingKey: async () => key,
			embedTexts: async ({ texts }: { texts: string[]; apiKey: string }) => {
				embedCalls.push(texts);
				if (embedFailure) {
					throw embedFailure;
				}
				return {
					model: "text-embedding-3-small",
					dimensions: 1536,
					vectors: texts.map((_, index) => [index + 1]),
				};
			},
			searchSimilarEmbeddingsForSession: async ({ vector }: { vector: number[] }) => {
				searchCalls.push(vector);
				const resultIndex = typeof vector[0] === "number" ? vector[0] - 1 : -1;
				const result = searchResults[resultIndex];
				return result
					? [
							{
								_id: `embedding_${resultIndex}`,
								userId: sessionUser.id,
								sourceType: result.sourceType,
								sourceId: `source_${resultIndex}`,
								text: "saved source text",
								contentHash: `hash_${resultIndex}`,
								model: "text-embedding-3-small",
								embedding: [0.1],
								createdAt: 100,
								updatedAt: 200,
								_score: result._score,
							},
						]
					: [];
			},
			reportServerError: (event: CapturedReport) => {
				reports.push(event);
			},
		},
		reports,
		embedCalls,
		searchCalls,
		upsertedSuggestions,
	};
}

async function buildWithFakes({
	tweets,
	bookmarks,
	followSummary,
	key,
	embedFailure,
	searchResults,
	latestByUsername,
}: {
	tweets?: TweetPayload[];
	bookmarks?: SavedBookmark[];
	followSummary?: FollowSummary;
	key?: string | null;
	embedFailure?: Error;
	searchResults?: SearchResult[];
	latestByUsername?: Map<string, TweetPayload[]>;
}) {
	const fake = createSuggestionDependencies({
		bookmarks,
		followSummary,
		key,
		embedFailure,
		searchResults,
	});
	const response = await buildSuggestionsForSession({
		sessionUser,
		xClient: createXClient({ searchTweets: tweets ?? [], latestByUsername }),
		...fake.dependencies,
	});
	return {
		...fake,
		response,
	};
}

test("semantic mode ranks a related non-verbatim candidate above an unrelated one", async () => {
	const related = createTweet({
		id: "tweet_related",
		text: "A practical note on agent evaluation loops and reflection.",
	});
	const unrelated = createTweet({
		id: "tweet_unrelated",
		text: "A short note about weekend bread recipes.",
	});

	const { response } = await buildWithFakes({
		tweets: [unrelated, related],
		searchResults: [
			{ sourceType: "bookmark", _score: 0.5 },
			{ sourceType: "bookmark", _score: 0.9 },
		],
	});

	assert.equal(response.suggestions[0]?.tweetId, "tweet_related");
	assert.equal(response.suggestions[0]?.score, 91);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["subject_search", "bookmark_affinity"],
	);
});

test("semantic mode without matches above threshold adds no semantic contribution", async () => {
	const tweet = createTweet({
		id: "tweet_1",
		text: "Agent notes with no close saved-source match.",
	});

	const { response } = await buildWithFakes({
		tweets: [tweet],
		searchResults: [{ sourceType: "bookmark", _score: 0.5 }],
	});

	assert.equal(response.suggestions[0]?.score, 30);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["subject_search"],
	);
});

test("semantic mode attaches takeaway_theme for a takeaway top match", async () => {
	const tweet = createTweet({
		id: "tweet_1",
		text: "A useful thread on durable product execution.",
	});

	const { response } = await buildWithFakes({
		tweets: [tweet],
		searchResults: [{ sourceType: "takeaway", _score: 0.85 }],
	});

	assert.equal(response.suggestions[0]?.score, 72);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["subject_search", "takeaway_theme"],
	);
	assert.equal(response.suggestions[0]?.reasons[1]?.label, "Similar to a recent takeaway theme");
});

test("no key skips semantic mode and preserves the substring scorer", async () => {
	const bookmarkText = "semantic agents build reliable tool loops by checking work";
	const tweet = createTweet({
		id: "tweet_1",
		text: `A candidate says ${bookmarkText.slice(0, 48)} before moving to another point.`,
	});

	const { response, embedCalls, searchCalls } = await buildWithFakes({
		tweets: [tweet],
		bookmarks: [createBookmark({ tweetText: bookmarkText, tags: [] })],
		key: null,
		searchResults: [{ sourceType: "bookmark", _score: 0.95 }],
	});

	assert.equal(response.suggestions[0]?.score, 36);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["subject_search"],
	);
	assert.equal(embedCalls.length, 0);
	assert.equal(searchCalls.length, 0);
});

test("embedding errors report and fall back to substring scoring in the same run", async () => {
	const bookmarkText = "semantic agents build reliable tool loops by checking work";
	const tweet = createTweet({
		id: "tweet_1",
		text: `A candidate says ${bookmarkText.slice(0, 48)} before moving to another point.`,
	});

	const { response, reports } = await buildWithFakes({
		tweets: [tweet],
		bookmarks: [createBookmark({ tweetText: bookmarkText, tags: [] })],
		embedFailure: new Error("embedding service down"),
		searchResults: [{ sourceType: "bookmark", _score: 0.95 }],
	});

	assert.equal(response.suggestions[0]?.score, 36);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["subject_search"],
	);
	assert.equal(reports[0]?.scope, "suggestions.semantic_affinity_failure");
});

test("semantic mode preserves followed-creator structural scoring", async () => {
	const tweet = createTweet({
		id: "tweet_1",
		text: "A creator post that has no close semantic match.",
		authorUsername: "ctatedev",
	});
	const latestByUsername = new Map([["ctatedev", [tweet]]]);

	const { response } = await buildWithFakes({
		tweets: [],
		followSummary: createFollowSummary({
			subjectTags: [],
			creatorUsernames: ["ctatedev"],
		}),
		latestByUsername,
		searchResults: [{ sourceType: "bookmark", _score: 0.5 }],
	});

	assert.equal(response.suggestions[0]?.score, 60);
	assert.deepEqual(
		response.suggestions[0]?.reasons.map((reason) => reason.code),
		["followed_creator"],
	);
});
