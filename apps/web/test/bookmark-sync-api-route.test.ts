import assert from "node:assert/strict";
import test from "node:test";

import type { BookmarkSyncStatusResponse } from "@tenbrains/contracts";

import { handleBookmarkSyncGet, handleBookmarkSyncPost } from "../app/api/me/bookmark-sync/route.js";

const syncState: NonNullable<BookmarkSyncStatusResponse["state"]> = {
	userId: "user_1",
	lastSyncedAt: 100,
	importedCount: 2,
	mode: "incremental",
	backfillComplete: true,
	updatedAt: 120,
};

type BookmarkSyncRouteDependencies = NonNullable<Parameters<typeof handleBookmarkSyncGet>[0]>;

function createDependencies(overrides: Partial<BookmarkSyncRouteDependencies> = {}): BookmarkSyncRouteDependencies {
	return {
		validateStartupEnvIfNeeded: () => {},
		getServerAuthSession: async () => ({
			user: {
				id: "user_1",
				email: "user@example.com",
				name: "User",
			},
		}),
		getBookmarkSyncStatusForSession: async () => ({
			state: syncState,
		}),
		getXAccountCredentialForSession: async () => ({
			xUserId: "user_1",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			scope: "users.read tweet.read bookmark.read offline.access",
			updatedAt: 100,
		}),
		syncXBookmarksForSession: async () => ({
			importedCount: 2,
		}),
		reportServerError: () => {},
		...overrides,
	};
}

test("GET /api/me/bookmark-sync returns current sync state", async () => {
	const response = await handleBookmarkSyncGet(createDependencies());

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		state: syncState,
		connected: true,
		requiresReconnect: false,
	});
});

test("GET /api/me/bookmark-sync reports when reconnect is required", async () => {
	const response = await handleBookmarkSyncGet(
		createDependencies({
			getXAccountCredentialForSession: async () => null,
		}),
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		state: syncState,
		connected: false,
		requiresReconnect: true,
	});
});

test("POST /api/me/bookmark-sync runs manual sync for the signed-in user", async () => {
	let syncedUserId = "";
	const response = await handleBookmarkSyncPost(
		createDependencies({
			syncXBookmarksForSession: async ({ sessionUser }) => {
				syncedUserId = sessionUser.id;
				return { importedCount: 3 };
			},
			getBookmarkSyncStatusForSession: async () => ({
				state: {
					...syncState,
					importedCount: 3,
				},
			}),
		}),
	);

	assert.equal(response.status, 200);
	assert.equal(syncedUserId, "user_1");
	assert.deepEqual(await response.json(), {
		importedCount: 3,
		state: {
			...syncState,
			importedCount: 3,
		},
		connected: true,
		requiresReconnect: false,
	});
});

test("POST /api/me/bookmark-sync asks authenticated users to reconnect when X credentials are missing", async () => {
	const response = await handleBookmarkSyncPost(
		createDependencies({
			getXAccountCredentialForSession: async () => null,
		}),
	);

	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {
		error: {
			code: "X_SYNC_NOT_CONNECTED",
			message: "X bookmark sync needs a fresh X connection. Sign in with X again to grant bookmark access.",
		},
		connected: false,
		requiresReconnect: true,
	});
});

test("POST /api/me/bookmark-sync returns 401 when unauthenticated", async () => {
	const response = await handleBookmarkSyncPost(
		createDependencies({
			getServerAuthSession: async () => null,
		}),
	);

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), {
		error: {
			message: "Unauthorized",
		},
	});
});
