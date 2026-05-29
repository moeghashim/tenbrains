import assert from "node:assert/strict";
import test from "node:test";

import type {
	AccountTakeawaySnapshot,
	DeleteTakeawayFollowResult,
	RefreshTakeawayResult,
	TakeawayFollow,
	TakeawayHistoryResponse,
	TakeawayWorkspaceResponse,
} from "@tenbrains/contracts";

import {
	handleTakeawayFollowsDelete,
	handleTakeawayFollowsGet,
	handleTakeawayFollowsPost,
} from "../app/api/me/takeaway-follows/route.js";
import {
	handleTakeawaysGet,
	handleTakeawaysPost,
} from "../app/api/me/takeaways/route.js";

function createFollow(): TakeawayFollow {
	return {
		id: "follow_1",
		userId: "user_1",
		accountId: "123",
		accountUsername: "ctatedev",
		accountName: "Chris Tate",
		lastRefreshStatus: "success",
		lastRefreshDateKey: "2026-03-22",
		lastRefreshedAt: 200,
		createdAt: 100,
		updatedAt: 200,
	};
}

function createSnapshot(): AccountTakeawaySnapshot {
	return {
		id: "snapshot_1",
		userId: "user_1",
		followId: "follow_1",
		accountId: "123",
		accountUsername: "ctatedev",
		accountName: "Chris Tate",
		provider: "openai",
		model: "gpt-4.1",
		summary: "The account posts practical shipping lessons.",
		takeaways: [
			"Shipping cadence is a recurring theme.",
			"Reliability work appears often.",
			"Examples stay concrete.",
		],
		sampleSize: 3,
		snapshotDateKey: "2026-03-22",
		posts: [
			{
				id: "201",
				text: "Ship the smaller change first.",
				authorUsername: "ctatedev",
			},
		],
		createdAt: 200,
	};
}

function createSession() {
	return {
		user: {
			id: "user_1",
			email: "user@example.com",
			name: "User",
		},
	};
}

test("GET /api/me/takeaway-follows returns followed accounts", async () => {
	const response = await handleTakeawayFollowsGet(
		new Request("http://localhost/api/me/takeaway-follows"),
		undefined,
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => createSession(),
			listTakeawayWorkspaceForSession: async () =>
				({
					follows: [createFollow()],
				}) as TakeawayWorkspaceResponse,
			createTakeawayFollowForSession: async () => createFollow(),
			deleteTakeawayFollowForSession: async () =>
				({
					followId: "follow_1",
				}) as DeleteTakeawayFollowResult,
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as TakeawayWorkspaceResponse;
	assert.equal(payload.follows[0]?.accountUsername, "ctatedev");
});

test("POST /api/me/takeaway-follows creates a followed account", async () => {
	const response = await handleTakeawayFollowsPost(
		new Request("http://localhost/api/me/takeaway-follows", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				accountUsername: "@ctatedev",
			}),
		}),
		undefined,
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => createSession(),
			listTakeawayWorkspaceForSession: async () =>
				({
					follows: [createFollow()],
				}) as TakeawayWorkspaceResponse,
			createTakeawayFollowForSession: async () => createFollow(),
			deleteTakeawayFollowForSession: async () =>
				({
					followId: "follow_1",
				}) as DeleteTakeawayFollowResult,
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as TakeawayFollow;
	assert.equal(payload.accountUsername, "ctatedev");
});

test("DELETE /api/me/takeaway-follows removes a followed account", async () => {
	const response = await handleTakeawayFollowsDelete(
		new Request("http://localhost/api/me/takeaway-follows", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				followId: "follow_1",
			}),
		}),
		undefined,
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => createSession(),
			listTakeawayWorkspaceForSession: async () =>
				({
					follows: [createFollow()],
				}) as TakeawayWorkspaceResponse,
			createTakeawayFollowForSession: async () => createFollow(),
			deleteTakeawayFollowForSession: async () =>
				({
					followId: "follow_1",
				}) as DeleteTakeawayFollowResult,
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as DeleteTakeawayFollowResult;
	assert.equal(payload.followId, "follow_1");
});

test("GET /api/me/takeaways returns takeaway history for a follow", async () => {
	const response = await handleTakeawaysGet(
		new Request("http://localhost/api/me/takeaways?followId=follow_1"),
		undefined,
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => createSession(),
			getTakeawayHistoryForSession: async () =>
				({
					latest: createSnapshot(),
					history: [createSnapshot()],
				}) as TakeawayHistoryResponse,
			refreshTakeawayForSession: async () =>
				({
					snapshot: createSnapshot(),
					deduped: false,
				}) as RefreshTakeawayResult,
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as TakeawayHistoryResponse;
	assert.equal(payload.latest?.accountUsername, "ctatedev");
});

test("POST /api/me/takeaways refreshes a follow takeaway", async () => {
	const response = await handleTakeawaysPost(
		new Request("http://localhost/api/me/takeaways", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				followId: "follow_1",
			}),
		}),
		undefined,
		{
			validateStartupEnvIfNeeded: () => {},
			getServerAuthSession: async () => createSession(),
			getTakeawayHistoryForSession: async () =>
				({
					latest: createSnapshot(),
					history: [createSnapshot()],
				}) as TakeawayHistoryResponse,
			refreshTakeawayForSession: async () =>
				({
					snapshot: createSnapshot(),
					deduped: false,
				}) as RefreshTakeawayResult,
			reportServerError: () => {},
		},
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as RefreshTakeawayResult;
	assert.equal(payload.snapshot.followId, "follow_1");
	assert.equal(payload.deduped, false);
});
