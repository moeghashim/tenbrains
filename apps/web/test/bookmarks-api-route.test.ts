import assert from "node:assert/strict";
import test from "node:test";
import type {
	DeleteBookmarkResult,
	SaveBookmarkInput,
	SavedBookmark,
	UpdateBookmarkTagsInput,
} from "@tenbrains/contracts";
import { ConvexError } from "convex/values";

import {
	handleBookmarksDelete,
	handleBookmarksGet,
	handleBookmarksPatch,
	handleBookmarksPost,
} from "../app/api/bookmarks/route.js";
import {
	BOOKMARK_ALREADY_EXISTS_ERROR_CODE,
	BOOKMARK_ALREADY_EXISTS_MESSAGE,
	createBookmarkAlreadyExistsErrorData,
} from "../src/bookmarks/errors.js";

interface TestSession {
	user: {
		id: string;
		email: string;
		name: string;
	};
}

interface TestDependenciesOverrides {
	session?: TestSession | null;
	saveBookmarkForSession?: ({ input }: { input: SaveBookmarkInput }) => Promise<SavedBookmark>;
	listBookmarksForSession?: () => Promise<SavedBookmark[]>;
	updateBookmarkTagsForSession?: ({ input }: { input: UpdateBookmarkTagsInput }) => Promise<SavedBookmark>;
	deleteBookmarkForSession?: ({ bookmarkId }: { bookmarkId: string }) => Promise<DeleteBookmarkResult>;
}

function createInput(tags: string[]): SaveBookmarkInput {
	return {
		tweetId: "2028960626685386994",
		tweetText: "Ship small and often.",
		tweetUrlOrId: "https://x.com/ctatedev/status/2028960626685386994",
		authorUsername: "ctatedev",
		authorName: "Chris Tate",
		authorAvatarUrl: "https://pbs.twimg.com/profile_images/example.jpg",
		tags,
	};
}

function createSavedBookmark(input: SaveBookmarkInput, updatedAt: number): SavedBookmark {
	return {
		id: "bookmark_1",
		userId: "user_1",
		...input,
		createdAt: 100,
		updatedAt,
	};
}

function createDependencies({
	session = { user: { id: "user_1", email: "user@example.com", name: "User" } },
	saveBookmarkForSession = async ({ input }: { input: SaveBookmarkInput }) => createSavedBookmark(input, 200),
	listBookmarksForSession = async () => [] as SavedBookmark[],
	updateBookmarkTagsForSession = async ({
		input,
	}: {
		input: UpdateBookmarkTagsInput;
	}) =>
		createSavedBookmark(createInput(input.tags), 300),
	deleteBookmarkForSession = async () =>
		({
			bookmarkId: "bookmark_1",
		}) as DeleteBookmarkResult,
}: TestDependenciesOverrides = {}) {
	return {
		validateStartupEnvIfNeeded: () => {},
		getServerAuthSession: async () => session,
		saveBookmarkForSession,
		listBookmarksForSession,
		updateBookmarkTagsForSession,
		deleteBookmarkForSession,
		reportServerError: () => {},
	};
}

test("POST /api/bookmarks saves bookmark for authenticated user", async () => {
	const input = createInput(["infra", "ux"]);
	const response = await handleBookmarksPost(
		new Request("http://localhost/api/bookmarks", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify(input),
		}),
		createDependencies({
			saveBookmarkForSession: async () => createSavedBookmark(input, 200),
		}),
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as SavedBookmark;
	assert.equal(payload.tweetId, input.tweetId);
	assert.deepEqual(payload.tags, input.tags);
});

test("POST /api/bookmarks rejects duplicate saves for the same tweet", async () => {
	const store = new Map<string, SavedBookmark>();

	const dependencies = {
		validateStartupEnvIfNeeded: () => {},
		getServerAuthSession: async () => ({ user: { id: "user_1", email: "user@example.com", name: "User" } }),
		saveBookmarkForSession: async ({ input }: { input: SaveBookmarkInput }) => {
			const existing = store.get(input.tweetId);
			if (existing) {
				throw new ConvexError(createBookmarkAlreadyExistsErrorData());
			}

			const created = createSavedBookmark(input, 200);
			store.set(input.tweetId, created);
			return created;
		},
		listBookmarksForSession: async () => Array.from(store.values()),
		updateBookmarkTagsForSession: async ({ input }: { input: UpdateBookmarkTagsInput }) => {
			const existing = Array.from(store.values()).find((item) => item.id === input.bookmarkId);
			if (!existing) {
				throw new Error("Bookmark not found");
			}
			const updated = {
				...existing,
				tags: input.tags,
				updatedAt: existing.updatedAt + 50,
			};
			store.set(updated.tweetId, updated);
			return updated;
		},
		deleteBookmarkForSession: async ({ bookmarkId }: { bookmarkId: string }) => {
			const existing = Array.from(store.values()).find((item) => item.id === bookmarkId);
			if (!existing) {
				throw new Error("Bookmark not found");
			}
			store.delete(existing.tweetId);
			return { bookmarkId };
		},
		reportServerError: () => {},
	};

	const firstInput = createInput(["infra"]);
	const secondInput = createInput(["reliability", "shipping"]);

	await handleBookmarksPost(
		new Request("http://localhost/api/bookmarks", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(firstInput),
		}),
		dependencies,
	);

	const duplicateResponse = await handleBookmarksPost(
		new Request("http://localhost/api/bookmarks", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(secondInput),
		}),
		dependencies,
	);

	assert.equal(duplicateResponse.status, 409);
	assert.deepEqual(await duplicateResponse.json(), {
		error: {
			code: BOOKMARK_ALREADY_EXISTS_ERROR_CODE,
			message: BOOKMARK_ALREADY_EXISTS_MESSAGE,
		},
	});

	const listResponse = await handleBookmarksGet(dependencies);
	assert.equal(listResponse.status, 200);
	const payload = (await listResponse.json()) as { bookmarks: SavedBookmark[] };
	assert.equal(payload.bookmarks.length, 1);
	assert.deepEqual(payload.bookmarks[0]?.tags, firstInput.tags);
});

test("GET /api/bookmarks returns current user bookmarks", async () => {
	const saved = createSavedBookmark(createInput(["api"]), 300);
	const response = await handleBookmarksGet(
		createDependencies({
			saveBookmarkForSession: async () => saved,
			listBookmarksForSession: async () => [saved],
		}),
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as { bookmarks: SavedBookmark[] };
	assert.equal(payload.bookmarks.length, 1);
	assert.equal(payload.bookmarks[0]?.tweetId, saved.tweetId);
});

test("POST /api/bookmarks returns 401 when unauthenticated", async () => {
	const input = createInput(["infra"]);
	const response = await handleBookmarksPost(
		new Request("http://localhost/api/bookmarks", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify(input),
		}),
		createDependencies({
			session: null,
			saveBookmarkForSession: async () => createSavedBookmark(input, 200),
		}),
	);

	assert.equal(response.status, 401);
});

test("POST /api/bookmarks returns 400 when tags are invalid", async () => {
	const response = await handleBookmarksPost(
		new Request("http://localhost/api/bookmarks", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				tweetId: "1",
				tweetText: "Tweet",
				tweetUrlOrId: "https://x.com/user/status/1",
				authorUsername: "user",
				tags: [],
			}),
		}),
		createDependencies({
			saveBookmarkForSession: async () => createSavedBookmark(createInput(["fallback"]), 200),
		}),
	);

	assert.equal(response.status, 400);
});

test("PATCH /api/bookmarks updates bookmark tags", async () => {
	const saved = createSavedBookmark(createInput(["old"]), 200);
	const response = await handleBookmarksPatch(
		new Request("http://localhost/api/bookmarks", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				bookmarkId: saved.id,
				tags: ["new", "updated"],
			}),
		}),
		createDependencies({
			updateBookmarkTagsForSession: async ({ input }) => ({
				...saved,
				id: input.bookmarkId,
				tags: input.tags,
				updatedAt: 400,
			}),
		}),
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as SavedBookmark;
	assert.deepEqual(payload.tags, ["new", "updated"]);
});

test("PATCH /api/bookmarks returns 400 when tags include simple singular and plural duplicates", async () => {
	const saved = createSavedBookmark(createInput(["old"]), 200);
	const response = await handleBookmarksPatch(
		new Request("http://localhost/api/bookmarks", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				bookmarkId: saved.id,
				tags: ["agent", "agents"],
			}),
		}),
		createDependencies(),
	);

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), {
		error: {
			code: "INVALID_INPUT",
			message: 'Tags must be unique, including simple singular/plural pairs like "agent" and "agents".',
		},
	});
});

test("PATCH /api/bookmarks returns 404 when bookmark is missing", async () => {
	const response = await handleBookmarksPatch(
		new Request("http://localhost/api/bookmarks", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				bookmarkId: "missing",
				tags: ["one"],
			}),
		}),
		createDependencies({
			updateBookmarkTagsForSession: async () => {
				throw new Error("Bookmark not found");
			},
		}),
	);

	assert.equal(response.status, 404);
});

test("DELETE /api/bookmarks deletes bookmark", async () => {
	const response = await handleBookmarksDelete(
		new Request("http://localhost/api/bookmarks", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				bookmarkId: "bookmark_1",
			}),
		}),
		createDependencies({
			deleteBookmarkForSession: async ({ bookmarkId }: { bookmarkId: string }) => ({ bookmarkId }),
		}),
	);

	assert.equal(response.status, 200);
	const payload = (await response.json()) as DeleteBookmarkResult;
	assert.equal(payload.bookmarkId, "bookmark_1");
});
