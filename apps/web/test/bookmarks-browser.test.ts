import assert from "node:assert/strict";
import test from "node:test";

import type { FollowSummary, SavedBookmark } from "@tenbrains/contracts";

import {
	BOOKMARK_DETAILS_PANEL_CLASS,
	buildCollapsedTagFilterOptions,
	dedupeBookmarks,
	filterBookmarksBySearch,
	filterBookmarksByTags,
	sortTagFilterOptionsForDisplay,
} from "../components/bookmarks-browser.js";
import {
	buildBookmarkFollowState,
	isCreatorSubjectCovered,
	isSubjectFollowed,
} from "../src/follows/bookmark-follow-state.js";

function createBookmark(
	id: string,
	tags: string[],
	overrides: Partial<Pick<SavedBookmark, "tweetText" | "authorUsername" | "authorName">> = {},
): SavedBookmark {
	return {
		id,
		userId: "user_1",
		tweetId: `tweet_${id}`,
		tweetText: overrides.tweetText ?? `tweet text ${id}`,
		tweetUrlOrId: `https://x.com/user/status/${id}`,
		authorUsername: overrides.authorUsername ?? "user",
		authorName: overrides.authorName ?? "User",
		authorAvatarUrl: undefined,
		tags,
		createdAt: 100,
		updatedAt: 100,
	};
}

test("filterBookmarksBySearch returns all bookmarks when query is blank", () => {
	const bookmarks = [createBookmark("1", ["Strategy"]), createBookmark("2", ["Growth"])];
	assert.deepEqual(filterBookmarksBySearch(bookmarks, ""), bookmarks);
	assert.deepEqual(filterBookmarksBySearch(bookmarks, "   "), bookmarks);
});

test("filterBookmarksBySearch matches tweet text case-insensitively", () => {
	const bookmarks = [
		createBookmark("1", ["Strategy"], { tweetText: "Building a Better Workflow" }),
		createBookmark("2", ["Growth"], { tweetText: "Shipping notes" }),
	];

	const filtered = filterBookmarksBySearch(bookmarks, "workflow");
	assert.deepEqual(
		filtered.map((bookmark) => bookmark.id),
		["1"],
	);
});

test("filterBookmarksBySearch matches author name and username", () => {
	const bookmarks = [
		createBookmark("1", ["Strategy"], { authorUsername: "opslead", authorName: "Morgan Lee" }),
		createBookmark("2", ["Growth"], { authorUsername: "growthgal", authorName: "Riley West" }),
	];

	assert.deepEqual(
		filterBookmarksBySearch(bookmarks, "morgan").map((bookmark) => bookmark.id),
		["1"],
	);
	assert.deepEqual(
		filterBookmarksBySearch(bookmarks, "GROWTHGAL").map((bookmark) => bookmark.id),
		["2"],
	);
});

test("filterBookmarksBySearch matches tags", () => {
	const bookmarks = [
		createBookmark("1", ["Strategy", "Writing"]),
		createBookmark("2", ["Growth"]),
	];

	const filtered = filterBookmarksBySearch(bookmarks, "writing");
	assert.deepEqual(
		filtered.map((bookmark) => bookmark.id),
		["1"],
	);
});

test("filterBookmarksByTags returns all bookmarks when no tags are selected", () => {
	const bookmarks = [createBookmark("1", ["Strategy"]), createBookmark("2", ["Growth"])];
	const filtered = filterBookmarksByTags(bookmarks, []);
	assert.deepEqual(filtered, bookmarks);
});

test("filterBookmarksByTags matches selected tags case-insensitively", () => {
	const bookmarks = [
		createBookmark("1", ["Strategy", "Writing"]),
		createBookmark("2", ["Growth"]),
		createBookmark("3", ["Ops"]),
	];
	const filtered = filterBookmarksByTags(bookmarks, ["strategy", "GROWTH"]);
	assert.deepEqual(
		filtered.map((bookmark) => bookmark.id),
		["1", "2"],
	);
});

test("filterBookmarksByTags ignores empty selected values", () => {
	const bookmarks = [createBookmark("1", ["Strategy"]), createBookmark("2", ["Growth"])];
	const filtered = filterBookmarksByTags(bookmarks, ["", "  "]);
	assert.deepEqual(filtered, bookmarks);
});

test("sortTagFilterOptionsForDisplay prioritizes active tags and then higher counts", () => {
	const options = [
		{ key: "research", label: "Research", count: 1 },
		{ key: "seo", label: "SEO", count: 3 },
		{ key: "tips", label: "Tips", count: 4 },
		{ key: "workflow", label: "Workflow", count: 2 },
	];

	const sorted = sortTagFilterOptionsForDisplay(options, ["workflow"]);
	assert.deepEqual(
		sorted.map((option) => option.key),
		["workflow", "tips", "seo", "research"],
	);
});

test("buildCollapsedTagFilterOptions keeps active tags visible beyond the default limit", () => {
	const options = sortTagFilterOptionsForDisplay(
		[
			{ key: "tips", label: "Tips", count: 8 },
			{ key: "seo", label: "SEO", count: 7 },
			{ key: "workflow", label: "Workflow", count: 6 },
			{ key: "media", label: "Media", count: 5 },
			{ key: "social", label: "Social", count: 4 },
		],
		["social", "workflow"],
	);

	const collapsed = buildCollapsedTagFilterOptions(options, ["social", "workflow"], 3);
	assert.deepEqual(
		collapsed.map((option) => option.key),
		["workflow", "social", "tips"],
	);
});

test("buildCollapsedTagFilterOptions returns the highest-priority tags when nothing is selected", () => {
	const options = sortTagFilterOptionsForDisplay(
		[
			{ key: "research", label: "Research", count: 1 },
			{ key: "seo", label: "SEO", count: 3 },
			{ key: "tips", label: "Tips", count: 4 },
			{ key: "workflow", label: "Workflow", count: 2 },
		],
		[],
	);

	const collapsed = buildCollapsedTagFilterOptions(options, [], 2);
	assert.deepEqual(
		collapsed.map((option) => option.key),
		["tips", "seo"],
	);
});

test("dedupeBookmarks keeps the most recently updated copy of the same tweet", () => {
	const older = createBookmark("1", ["Tip"], { tweetText: "Older copy" });
	const newer = {
		...createBookmark("2", ["Tips"], { tweetText: "Newer copy" }),
		tweetId: older.tweetId,
		tweetUrlOrId: older.tweetUrlOrId,
		updatedAt: 200,
	};
	const unrelated = {
		...createBookmark("3", ["Tools"]),
		updatedAt: 150,
	};

	const deduped = dedupeBookmarks([older, newer, unrelated]);
	assert.deepEqual(
		deduped.map((bookmark) => bookmark.id),
		["2", "3"],
	);
	assert.equal(deduped[0]?.tweetText, "Newer copy");
});

test("bookmark search and tag filters combine as an intersection", () => {
	const bookmarks = [
		createBookmark("1", ["Strategy"], { tweetText: "Workflow strategy" }),
		createBookmark("2", ["Growth"], { tweetText: "Workflow experiments" }),
		createBookmark("3", ["Strategy"], { tweetText: "Team rituals" }),
	];

	const filtered = filterBookmarksByTags(filterBookmarksBySearch(bookmarks, "workflow"), ["strategy"]);
	assert.deepEqual(
		filtered.map((bookmark) => bookmark.id),
		["1"],
	);
});

test("buildBookmarkFollowState detects creator feed and creator subject follows case-insensitively", () => {
	const bookmark = createBookmark("1", ["Strategy", "Ops"], {
		authorUsername: "@OpsLead",
	});
	const summary: FollowSummary = {
		creatorFollows: [
			{
				id: "follow_1",
				userId: "user_1",
				creatorUsername: "opslead",
				scope: "all_feed",
				createdAt: 100,
				updatedAt: 100,
			},
			{
				id: "follow_2",
				userId: "user_1",
				creatorUsername: "opslead",
				scope: "subject",
				subjectTag: "strategy",
				createdAt: 100,
				updatedAt: 100,
			},
		],
		subjectFollows: [],
	};

	const state = buildBookmarkFollowState(bookmark, summary);
	assert.equal(state.isCreatorFeedFollowed, true);
	assert.equal(isCreatorSubjectCovered(state, "Strategy"), true);
	assert.equal(isCreatorSubjectCovered(state, "ops"), true);
});

test("isSubjectFollowed matches subject follows case-insensitively", () => {
	const summary: FollowSummary = {
		creatorFollows: [],
		subjectFollows: [
			{
				id: "subject_1",
				userId: "user_1",
				subjectTag: "Growth",
				createdAt: 100,
				updatedAt: 100,
			},
		],
	};

	assert.equal(isSubjectFollowed(summary, "growth"), true);
	assert.equal(isSubjectFollowed(summary, "GROWTH"), true);
	assert.equal(isSubjectFollowed(summary, "strategy"), false);
});

test("bookmark details panel stays scrollable when expanded", () => {
	assert.match(BOOKMARK_DETAILS_PANEL_CLASS, /\boverflow-y-auto\b/);
	assert.match(BOOKMARK_DETAILS_PANEL_CLASS, /\boverscroll-contain\b/);
	assert.match(BOOKMARK_DETAILS_PANEL_CLASS, /\btouch-pan-y\b/);
});
