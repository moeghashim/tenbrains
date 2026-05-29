import assert from "node:assert/strict";
import test from "node:test";

import {
	createInMemoryTrackStorage,
	createTrackFromSavedAnalysis,
} from "../src/track/track-pipeline.js";

import type { SavedAnalysis } from "@tenbrains/contracts";

function createSavedAnalysis(): SavedAnalysis {
	return {
		id: "analysis_1",
		userId: "user_1",
		tweetUrlOrId: "https://x.com/user/status/123",
		provider: "openai",
		model: "gpt-4.1",
		topic: "Model deployment",
		summary: "Summary",
		intent: "Intent",
		novelConcepts: [
			{ name: "Concept 1", whyItMattersInTweet: "Reason 1" },
			{ name: "Concept 2", whyItMattersInTweet: "Reason 2" },
			{ name: "Concept 3", whyItMattersInTweet: "Reason 3" },
			{ name: "Concept 4", whyItMattersInTweet: "Reason 4" },
			{ name: "Concept 5", whyItMattersInTweet: "Reason 5" },
		],
		createdAt: 1,
	};
}

test("createTrackFromSavedAnalysis builds and stores a seven-day track", async () => {
	const storage = createInMemoryTrackStorage();
	const result = await createTrackFromSavedAnalysis({
		input: { analysisId: "analysis_1" },
		userId: "user_1",
		analysis: createSavedAnalysis(),
		storage,
		now: () => 100,
	});

	assert.equal(result.userId, "user_1");
	assert.equal(result.days.length, 7);
	assert.equal(result.minutesPerDay, 10);

	const list = await storage.listByUser("user_1");
	assert.equal(list.length, 1);
	assert.equal(list[0]?.id, result.id);
});

test("createTrackFromSavedAnalysis rejects mismatched ownership", async () => {
	const storage = createInMemoryTrackStorage();
	const analysis = createSavedAnalysis();
	analysis.userId = "user_2";

	await assert.rejects(
		createTrackFromSavedAnalysis({
			input: { analysisId: "analysis_1" },
			userId: "user_1",
			analysis,
			storage,
		}),
		/does not belong to user/,
	);
});
