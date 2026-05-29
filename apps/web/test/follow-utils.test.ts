import assert from "node:assert/strict";
import test from "node:test";

import type { CreatorFollow, SavedBookmark, SubjectFollow } from "@tenbrains/contracts";

import {
	buildCreatorSuggestions,
	buildFollowingFeed,
	dedupeSavedBookmarks,
} from "../src/follows/follow-utils.js";

function createBookmark(
	id: string,
	overrides: Partial<SavedBookmark> = {},
): SavedBookmark {
	return {
		id,
		userId: "user_1",
		tweetId: `tweet_${id}`,
		tweetText: `tweet text ${id}`,
		tweetUrlOrId: `https://x.com/example/status/${id}`,
		authorUsername: "creator",
		authorName: "Creator",
		authorAvatarUrl: undefined,
		tags: ["Growth"],
		createdAt: 100,
		updatedAt: 100,
		...overrides,
	};
}

test("dedupeSavedBookmarks keeps the most recently updated bookmark copy", () => {
	const first = createBookmark("1", { tweetId: "same", tweetUrlOrId: "https://x.com/example/status/same" });
	const second = createBookmark("2", {
		tweetId: "same",
		tweetUrlOrId: "https://x.com/example/status/same",
		updatedAt: 200,
	});

	const deduped = dedupeSavedBookmarks([first, second]);
	assert.deepEqual(
		deduped.map((bookmark) => bookmark.id),
		["2"],
	);
});

test("buildCreatorSuggestions ranks creators by subject bookmark count and excludes existing follows", () => {
	const bookmarks = [
		createBookmark("1", { authorUsername: "opslead", authorName: "Morgan Lee", tags: ["Ops"] }),
		createBookmark("2", { authorUsername: "opslead", authorName: "Morgan Lee", tags: ["Ops"] }),
		createBookmark("3", { authorUsername: "buildgal", authorName: "Riley West", tags: ["Ops"] }),
	];
	const creatorFollows: CreatorFollow[] = [
		{
			id: "follow_1",
			userId: "user_1",
			creatorUsername: "buildgal",
			scope: "subject",
			subjectTag: "Ops",
			createdAt: 100,
			updatedAt: 100,
		},
	];

	const suggestions = buildCreatorSuggestions({
		bookmarks,
		creatorFollows,
		subjectTag: "Ops",
	});

	assert.deepEqual(
		suggestions.map((suggestion) => suggestion.creatorUsername),
		["opslead"],
	);
	assert.equal(suggestions[0]?.bookmarkCount, 2);
});

test("buildFollowingFeed includes creator-wide, creator-subject, and subject follow matches", () => {
	const bookmarks = [
		createBookmark("1", { authorUsername: "opslead", tags: ["Ops"] }),
		createBookmark("2", { authorUsername: "opslead", tags: ["Strategy"] }),
		createBookmark("3", { authorUsername: "writer", tags: ["Ops"] }),
	];
	const creatorFollows: CreatorFollow[] = [
		{
			id: "follow_all",
			userId: "user_1",
			creatorUsername: "opslead",
			scope: "all_feed",
			createdAt: 100,
			updatedAt: 100,
		},
		{
			id: "follow_subject",
			userId: "user_1",
			creatorUsername: "writer",
			scope: "subject",
			subjectTag: "Ops",
			createdAt: 100,
			updatedAt: 100,
		},
	];
	const subjectFollows: SubjectFollow[] = [
		{
			id: "subject_1",
			userId: "user_1",
			subjectTag: "Ops",
			createdAt: 100,
			updatedAt: 100,
		},
	];

	const feed = buildFollowingFeed({
		bookmarks,
		creatorFollows,
		subjectFollows,
	});

	assert.deepEqual(
		feed.map((item) => item.id),
		["1", "2", "3"],
	);
	assert.deepEqual(
		feed[0]?.matches.map((match) => match.type),
		["creator_all_feed", "subject"],
	);
	assert.deepEqual(
		feed[2]?.matches.map((match) => match.type),
		["creator_subject", "subject"],
	);
});
