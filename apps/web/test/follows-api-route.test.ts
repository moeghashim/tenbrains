import assert from "node:assert/strict";
import test from "node:test";

import type {
	CreatorFollow,
	DeleteFollowResult,
	FollowSuggestionsResponse,
	FollowSummary,
	FollowingFeedResponse,
	SubjectFollow,
	TakeawayFollow,
	TakeawayWorkspaceResponse,
} from "@tenbrains/contracts";

import {
	handleFollowSuggestionsGet,
} from "../app/api/me/follows/suggestions/route.js";
import {
	handleFollowsDelete,
	handleFollowsGet,
	handleFollowsPost,
} from "../app/api/me/follows/route.js";
import {
	handleFollowingFeedGet,
} from "../app/api/me/following-feed/route.js";

function createCreatorFollow(): CreatorFollow {
	return {
		id: "creator_follow_1",
		userId: "user_1",
		creatorUsername: "ctatedev",
		creatorName: "Chris Tate",
		scope: "all_feed",
		createdAt: 100,
		updatedAt: 200,
	};
}

function createSubjectFollow(): SubjectFollow {
	return {
		id: "subject_follow_1",
		userId: "user_1",
		subjectTag: "Shipping",
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
		listFollowsForSession: async () =>
			({
				creatorFollows: [createCreatorFollow()],
				subjectFollows: [createSubjectFollow()],
			}) as FollowSummary,
		createCreatorFollowForSession: async () => createCreatorFollow(),
		createTakeawayFollowForSession: async () => createTakeawayFollow(),
		createSubjectFollowForSession: async () => createSubjectFollow(),
		deleteCreatorFollowForSession: async () =>
			({
				followId: "creator_follow_1",
			}) as DeleteFollowResult,
		deleteTakeawayFollowForSession: async () =>
			({
				followId: "takeaway_follow_1",
			}) as DeleteFollowResult,
		deleteSubjectFollowForSession: async () =>
			({
				followId: "subject_follow_1",
			}) as DeleteFollowResult,
		listTakeawayWorkspaceForSession: async () =>
			({
				follows: [createTakeawayFollow()],
			}) as TakeawayWorkspaceResponse,
		listFollowSuggestionsForSession: async () =>
			({
				subjectTag: "Shipping",
				suggestions: [
					{
						creatorUsername: "opslead",
						creatorName: "Morgan Lee",
						subjectTag: "Shipping",
						bookmarkCount: 2,
						latestBookmarkAt: 300,
					},
				],
			}) as FollowSuggestionsResponse,
		listFollowingFeedForSession: async () =>
			({
				bookmarks: [
					{
						id: "bookmark_1",
						userId: "user_1",
						tweetId: "tweet_1",
						tweetText: "Ship often.",
						tweetUrlOrId: "https://x.com/ctatedev/status/1",
						authorUsername: "ctatedev",
						tags: ["Shipping"],
						createdAt: 100,
						updatedAt: 200,
						matches: [{ type: "creator_all_feed", creatorUsername: "ctatedev" }],
					},
				],
			}) as FollowingFeedResponse,
		reportServerError: () => {},
	};
}

function createTakeawayFollow(): TakeawayFollow {
	return {
		id: "takeaway_follow_1",
		userId: "user_1",
		accountUsername: "ctatedev",
		accountName: "Chris Tate",
		lastRefreshStatus: "idle",
		createdAt: 100,
		updatedAt: 200,
	};
}

test("GET /api/me/follows returns follows summary", async () => {
	const response = await handleFollowsGet(
		new Request("http://localhost/api/me/follows"),
		undefined,
		createDependencies(),
	);
	assert.equal(response.status, 200);
	const payload = (await response.json()) as FollowSummary;
	assert.equal(payload.creatorFollows.length, 1);
	assert.equal(payload.subjectFollows.length, 1);
});

test("POST /api/me/follows creates creator follow", async () => {
	let takeawayInput: {
		accountUsername: string;
		accountName?: string;
		accountAvatarUrl?: string;
	} | null = null;
	const response = await handleFollowsPost(
		new Request("http://localhost/api/me/follows", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "creator",
				creatorUsername: "ctatedev",
				scope: "all_feed",
			}),
		}),
		undefined,
		{
			...createDependencies(),
			createTakeawayFollowForSession: async ({ input }) => {
				takeawayInput = input;
				return createTakeawayFollow();
			},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as CreatorFollow;
	assert.equal(payload.scope, "all_feed");
	assert.deepEqual(takeawayInput, {
		accountUsername: "ctatedev",
		accountName: "Chris Tate",
		accountAvatarUrl: undefined,
	});
});

test("POST /api/me/follows creates takeaway follow for creator subject follow", async () => {
	let takeawayInput: {
		accountUsername: string;
		accountName?: string;
		accountAvatarUrl?: string;
	} | null = null;
	const response = await handleFollowsPost(
		new Request("http://localhost/api/me/follows", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "creator",
				creatorUsername: "ctatedev",
				scope: "subject",
				subjectTag: "Shipping",
			}),
		}),
		undefined,
		{
			...createDependencies(),
			createCreatorFollowForSession: async () => ({
				...createCreatorFollow(),
				scope: "subject",
				subjectTag: "Shipping",
			}),
			createTakeawayFollowForSession: async ({ input }) => {
				takeawayInput = input;
				return createTakeawayFollow();
			},
		},
	);

	assert.equal(response.status, 200);
	assert.deepEqual(takeawayInput, {
		accountUsername: "ctatedev",
		accountName: "Chris Tate",
		accountAvatarUrl: undefined,
	});
});

test("POST /api/me/follows does not create takeaway follow for subject follow", async () => {
	let takeawayCalled = false;
	const response = await handleFollowsPost(
		new Request("http://localhost/api/me/follows", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "subject",
				subjectTag: "Shipping",
			}),
		}),
		undefined,
		{
			...createDependencies(),
			createTakeawayFollowForSession: async () => {
				takeawayCalled = true;
				return createTakeawayFollow();
			},
		},
	);

	assert.equal(response.status, 200);
	assert.equal(takeawayCalled, false);
});

test("DELETE /api/me/follows deletes subject follow", async () => {
	const response = await handleFollowsDelete(
		new Request("http://localhost/api/me/follows", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "subject",
				followId: "subject_follow_1",
			}),
		}),
		undefined,
		createDependencies(),
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as DeleteFollowResult;
	assert.equal(payload.followId, "subject_follow_1");
});

test("DELETE /api/me/follows deletes takeaway follow after removing last creator follow", async () => {
	let deletedTakeawayFollowId: string | null = null;
	let listFollowsCallCount = 0;
	const response = await handleFollowsDelete(
		new Request("http://localhost/api/me/follows", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "creator",
				followId: "creator_follow_1",
			}),
		}),
		undefined,
		{
			...createDependencies(),
			listFollowsForSession: async () => {
				listFollowsCallCount += 1;
				if (listFollowsCallCount === 1) {
					return {
						creatorFollows: [createCreatorFollow()],
						subjectFollows: [createSubjectFollow()],
					} as FollowSummary;
				}
				return {
					creatorFollows: [],
					subjectFollows: [createSubjectFollow()],
				} as FollowSummary;
			},
			deleteTakeawayFollowForSession: async ({ followId }) => {
				deletedTakeawayFollowId = followId;
				return {
					followId,
				};
			},
			listTakeawayWorkspaceForSession: async () =>
				({
					follows: [createTakeawayFollow()],
				}) as TakeawayWorkspaceResponse,
		},
	);

	assert.equal(response.status, 200);
	assert.equal(deletedTakeawayFollowId, "takeaway_follow_1");
});

test("DELETE /api/me/follows keeps takeaway follow when another creator scope remains", async () => {
	let deletedTakeawayFollowId: string | null = null;
	let listFollowsCallCount = 0;
	const response = await handleFollowsDelete(
		new Request("http://localhost/api/me/follows", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "creator",
				followId: "creator_follow_1",
			}),
		}),
		undefined,
		{
			...createDependencies(),
			listFollowsForSession: async () => {
				listFollowsCallCount += 1;
				if (listFollowsCallCount === 1) {
					return {
						creatorFollows: [
							createCreatorFollow(),
							{
								...createCreatorFollow(),
								id: "creator_follow_2",
								scope: "subject",
								subjectTag: "Shipping",
							},
						],
						subjectFollows: [createSubjectFollow()],
					} as FollowSummary;
				}
				return {
					creatorFollows: [
						{
							...createCreatorFollow(),
							id: "creator_follow_2",
							scope: "subject",
							subjectTag: "Shipping",
						},
					],
					subjectFollows: [createSubjectFollow()],
				} as FollowSummary;
			},
			deleteTakeawayFollowForSession: async ({ followId }) => {
				deletedTakeawayFollowId = followId;
				return {
					followId,
				};
			},
		},
	);

	assert.equal(response.status, 200);
	assert.equal(deletedTakeawayFollowId, null);
});

test("GET /api/me/follows/suggestions returns subject suggestions", async () => {
	const response = await handleFollowSuggestionsGet(
		new Request("http://localhost/api/me/follows/suggestions?subjectTag=Shipping"),
		undefined,
		{
			validateStartupEnvIfNeeded: createDependencies().validateStartupEnvIfNeeded,
			getServerAuthSession: createDependencies().getServerAuthSession,
			listFollowSuggestionsForSession: createDependencies().listFollowSuggestionsForSession,
			reportServerError: createDependencies().reportServerError,
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as FollowSuggestionsResponse;
	assert.equal(payload.suggestions[0]?.creatorUsername, "opslead");
});

test("GET /api/me/following-feed returns matched bookmarks", async () => {
	const response = await handleFollowingFeedGet(
		new Request("http://localhost/api/me/following-feed"),
		undefined,
		{
			validateStartupEnvIfNeeded: createDependencies().validateStartupEnvIfNeeded,
			getServerAuthSession: createDependencies().getServerAuthSession,
			listFollowingFeedForSession: createDependencies().listFollowingFeedForSession,
			reportServerError: createDependencies().reportServerError,
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as FollowingFeedResponse;
	assert.equal(payload.bookmarks.length, 1);
	assert.equal(payload.bookmarks[0]?.matches[0]?.type, "creator_all_feed");
});

test("GET /api/me/follows returns a JSON error when follow loading fails", async () => {
	const response = await handleFollowsGet(
		new Request("http://localhost/api/me/follows"),
		undefined,
		{
			...createDependencies(),
			listFollowsForSession: async () => {
				throw new Error("Could not find public function for 'follows:listSummary'");
			},
		},
	);

	assert.equal(response.status, 500);
	assert.deepEqual(await response.json(), {
		error: {
			message: "Could not find public function for 'follows:listSummary'",
		},
	});
});

test("GET /api/me/following-feed returns a JSON error when feed loading fails", async () => {
	const response = await handleFollowingFeedGet(
		new Request("http://localhost/api/me/following-feed"),
		undefined,
		{
			...createDependencies(),
			listFollowingFeedForSession: async () => {
				throw new Error("Could not find public function for 'follows:listFollowingFeed'");
			},
		},
	);

	assert.equal(response.status, 500);
	assert.deepEqual(await response.json(), {
		error: {
			message: "Could not find public function for 'follows:listFollowingFeed'",
		},
	});
});
