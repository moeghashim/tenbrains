import assert from "node:assert/strict";
import test from "node:test";

import type { SavedBookmark } from "@tenbrains/contracts";
import { strFromU8, unzipSync } from "fflate";

import {
	buildBookmarkMarkdownFileName,
	buildBookmarksArchiveFileName,
	buildBookmarksMarkdownArchive,
	renderBookmarkMarkdown,
} from "../src/bookmarks/export-markdown.js";

function createBookmark(id: string, tags: string[]): SavedBookmark {
	return {
		id,
		userId: "user_1",
		tweetId: `tweet_${id}`,
		tweetText: `Ship better tooling for release confidence ${id}`,
		tweetUrlOrId: `https://x.com/user/status/${id}`,
		authorUsername: "release_lead",
		authorName: "Release Lead",
		authorAvatarUrl: undefined,
		tags,
		createdAt: Date.UTC(2026, 2, 5, 10, 0, 0),
		updatedAt: Date.UTC(2026, 2, 5, 11, 0, 0),
	};
}

test("renderBookmarkMarkdown renders bookmark metadata and tweet body", () => {
	const markdown = renderBookmarkMarkdown(createBookmark("42", ["Strategy", "Launch"]));
	assert.match(markdown, /^# Release Lead \(@release_lead\)$/m);
	assert.match(markdown, /- Tweet ID: tweet_42/);
	assert.match(markdown, /- Tags: Strategy, Launch/);
	assert.match(markdown, /## Tweet/);
	assert.match(markdown, /Ship better tooling for release confidence 42/);
});

test("buildBookmarkMarkdownFileName creates ordered markdown filenames", () => {
	const fileName = buildBookmarkMarkdownFileName(createBookmark("42", ["Strategy"]), 3);
	assert.equal(fileName, "04-release-lead-ship-better-tooling-for-release-conf.md");
});

test("buildBookmarksMarkdownArchive creates a zip with one markdown file per bookmark", () => {
	const archive = buildBookmarksMarkdownArchive([
		createBookmark("42", ["Strategy"]),
		createBookmark("84", ["Ops"]),
	]);
	const files = unzipSync(archive);
	const fileNames = Object.keys(files).sort();

	assert.deepEqual(fileNames, [
		"01-release-lead-ship-better-tooling-for-release-conf.md",
		"02-release-lead-ship-better-tooling-for-release-conf.md",
	]);
	assert.match(strFromU8(files["01-release-lead-ship-better-tooling-for-release-conf.md"] ?? new Uint8Array()), /tweet_42/);
	assert.match(strFromU8(files["02-release-lead-ship-better-tooling-for-release-conf.md"] ?? new Uint8Array()), /tweet_84/);
});

test("buildBookmarksArchiveFileName uses active tags when present", () => {
	const fileName = buildBookmarksArchiveFileName(["Deep Work", "Agent Ops"]);
	const dateSegment = new Date().toISOString().slice(0, 10);
	assert.equal(fileName, `tenbrains-bookmarks-deep-work-agent-ops-${dateSegment}.zip`);
});
