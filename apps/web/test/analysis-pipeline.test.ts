import assert from "node:assert/strict";
import test from "node:test";

import {
	createAnalysisFromTweetUrl,
	createInMemoryAnalysisStorage,
} from "../src/analysis/analysis-pipeline.js";

import type { TweetSourceProvider } from "@tenbrains/x-client";

function createFakeTweetSource(): TweetSourceProvider {
	const readTweet = async (input: string) => {
		return {
			id: "123",
			text: `Weekend deployment completed successfully for ${input}.` +
				" Observability dashboards stayed green and rollback path was unused.",
			authorId: "author_1",
			raw: { input },
		};
	};

	return {
		async getTweetByUrlOrId(input: string) {
			return await readTweet(input);
		},
		async getThreadByUrlOrId(input: string) {
			const tweet = await readTweet(input);
			return {
				rootTweetId: tweet.id,
				tweets: [tweet],
			};
		},
	};
}

test("createAnalysisFromTweetUrl persists analysis and listByUser returns history", async () => {
	const storage = createInMemoryAnalysisStorage();
	const tweetSource = createFakeTweetSource();

	const first = await createAnalysisFromTweetUrl({
		userId: "user_1",
		input: { tweetUrlOrId: "https://x.com/user/status/123", model: "gpt-4.1" },
		tweetSource,
		storage,
		now: () => 100,
	});
	assert.equal(first.userId, "user_1");
	assert.equal(first.novelConcepts.length, 5);

	await createAnalysisFromTweetUrl({
		userId: "user_1",
		input: { tweetUrlOrId: "https://x.com/user/status/456", model: "gpt-4.1-mini" },
		tweetSource,
		storage,
		now: () => 200,
	});

	const history = await storage.listByUser("user_1");
	assert.equal(history.length, 2);
	assert.equal(history[0]?.createdAt, 200);
	assert.equal(history[1]?.createdAt, 100);
});

test("createAnalysisFromTweetUrl rejects unauthorized user input", async () => {
	const storage = createInMemoryAnalysisStorage();
	const tweetSource = createFakeTweetSource();

	await assert.rejects(
		createAnalysisFromTweetUrl({
			userId: "",
			input: { tweetUrlOrId: "https://x.com/user/status/123" },
			tweetSource,
			storage,
		}),
		/Unauthorized/,
	);
});
