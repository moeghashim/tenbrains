import assert from "node:assert/strict";
import test from "node:test";

import type { Suggestion } from "@tenbrains/contracts";

import { handleSuggestionsDismissPost } from "../app/api/me/suggestions/dismiss/route.js";
import { handleSuggestionsGet } from "../app/api/me/suggestions/route.js";
import { handleSuggestionsSavePost } from "../app/api/me/suggestions/save/route.js";

function createSuggestion(): Suggestion {
	return {
		id: "suggestion_1",
		userId: "user_1",
		tweetId: "tweet_1",
		tweetText: "Interesting thread about evals and agent loops.",
		tweetUrlOrId: "https://x.com/agent/status/1",
		authorUsername: "agent",
		authorName: "Agent",
		score: 72,
		reasons: [{ code: "subject_search", label: "Matches evals" }],
		sourceSignals: ["subject:evals"],
		suggestedTags: ["Evals"],
		createdAt: 100,
		updatedAt: 200,
	};
}

function createDependencies() {
	return {
		validateStartupEnvIfNeeded: () => {},
		getServerAuthSession: async () => ({
			user: {
				id: "user_1",
				email: "user@example.com",
				name: "User",
			},
		}),
		buildSuggestionsForSession: async () => ({
			suggestions: [createSuggestion()],
		}),
		listRenderableSuggestionsForSession: async () => ({
			suggestions: [createSuggestion()],
		}),
		recordSuggestionFeedbackForSession: async () => ({
			id: "feedback_1",
			userId: "user_1",
			suggestionId: "suggestion_1",
			status: "dismissed" as const,
			createdAt: 300,
		}),
		getSuggestionByIdForSession: async () => createSuggestion(),
		saveBookmarkForSession: async () => ({
			id: "bookmark_1",
			userId: "user_1",
			tweetId: "tweet_1",
			tweetText: "Interesting thread about evals and agent loops.",
			tweetUrlOrId: "https://x.com/agent/status/1",
			authorUsername: "agent",
			authorName: "Agent",
			tags: ["Evals"],
			createdAt: 100,
			updatedAt: 200,
		}),
		reportServerError: () => {},
	};
}

test("GET /api/me/suggestions falls back to renderable suggestions when refresh fails", async () => {
	const response = await handleSuggestionsGet(new Request("http://localhost/api/me/suggestions"), undefined, {
		...createDependencies(),
		buildSuggestionsForSession: async () => {
			throw new Error("x search is temporarily unavailable");
		},
	});

	assert.equal(response.status, 200);
	const payload = (await response.json()) as { suggestions: Suggestion[] };
	assert.equal(payload.suggestions.length, 1);
	assert.equal(payload.suggestions[0]?.id, "suggestion_1");
});

test("POST /api/me/suggestions/save falls back to renderable suggestions when refresh fails", async () => {
	const response = await handleSuggestionsSavePost(
		new Request("http://localhost/api/me/suggestions/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ suggestionId: "suggestion_1" }),
		}),
		undefined,
		{
			...createDependencies(),
			buildSuggestionsForSession: async () => {
				throw new Error("x search is temporarily unavailable");
			},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as { suggestion: Suggestion; suggestions: Suggestion[] };
	assert.equal(payload.suggestion.id, "suggestion_1");
	assert.equal(payload.suggestions.length, 1);
});

test("POST /api/me/suggestions/dismiss falls back to renderable suggestions when refresh fails", async () => {
	const response = await handleSuggestionsDismissPost(
		new Request("http://localhost/api/me/suggestions/dismiss", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ suggestionId: "suggestion_1" }),
		}),
		undefined,
		{
			...createDependencies(),
			buildSuggestionsForSession: async () => {
				throw new Error("x search is temporarily unavailable");
			},
			listRenderableSuggestionsForSession: async () => ({
				suggestions: [],
			}),
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as { suggestions: Suggestion[] };
	assert.deepEqual(payload.suggestions, []);
});
