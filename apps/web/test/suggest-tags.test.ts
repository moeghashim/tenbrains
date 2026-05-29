import assert from "node:assert/strict";
import test from "node:test";

import type { SavedBookmark, SubjectFollow } from "@tenbrains/contracts";

import { suggestBookmarkTags } from "../src/bookmarks/suggest-tags.js";

function createBookmark(id: string, tags: string[], tweetText: string): SavedBookmark {
	return {
		id,
		userId: "user_1",
		tweetId: `tweet_${id}`,
		tweetText,
		tweetUrlOrId: `https://x.com/example/status/${id}`,
		authorUsername: "example",
		tags,
		source: "manual",
		createdAt: 1,
		updatedAt: 1,
	};
}

function createSubjectFollow(subjectTag: string): SubjectFollow {
	return {
		id: `subject_${subjectTag}`,
		userId: "user_1",
		subjectTag,
		createdAt: 1,
		updatedAt: 1,
	};
}

test("suggestBookmarkTags prefers matching existing bookmark tags", () => {
	const tags = suggestBookmarkTags({
		text: "New agent workflow patterns for AI ops teams",
		existingBookmarks: [
			createBookmark("1", ["Agents", "Ops"], "Agents are changing ops workflows"),
			createBookmark("2", ["Research"], "Research loops for teams"),
		],
		subjectFollows: [],
	});

	assert.ok(tags.includes("Agents"));
	assert.ok(tags.includes("Ops"));
});

test("suggestBookmarkTags uses followed subjects when bookmark history is sparse", () => {
	const tags = suggestBookmarkTags({
		text: "A practical reinforcement learning thread",
		existingBookmarks: [],
		subjectFollows: [createSubjectFollow("Reinforcement"), createSubjectFollow("Agents")],
	});

	assert.ok(tags.includes("Reinforcement"));
});
