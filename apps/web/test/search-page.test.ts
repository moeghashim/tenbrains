import assert from "node:assert/strict";
import test from "node:test";

import type { SearchResult } from "@tenbrains/contracts";

import {
	buildResultLink,
	formatScoreLabel,
	groupResultsBySourceType,
	truncateSnippet,
} from "../components/semantic-search-browser-helpers.js";

function createResult({
	sourceType,
	sourceId,
	score,
	text = "Result text",
}: {
	sourceType: SearchResult["sourceType"];
	sourceId: string;
	score: number;
	text?: string;
}): SearchResult {
	return {
		sourceType,
		sourceId,
		text,
		score,
		createdAt: 100,
		updatedAt: 200,
	};
}

test("groupResultsBySourceType partitions results and preserves within-group order", () => {
	const firstBookmark = createResult({ sourceType: "bookmark", sourceId: "tweet_1", score: 0.95 });
	const analysis = createResult({ sourceType: "analysis", sourceId: "analysis_1", score: 0.9 });
	const takeaway = createResult({ sourceType: "takeaway", sourceId: "takeaway_1", score: 0.88 });
	const secondBookmark = createResult({ sourceType: "bookmark", sourceId: "tweet_2", score: 0.72 });

	const grouped = groupResultsBySourceType([firstBookmark, analysis, takeaway, secondBookmark]);

	assert.deepEqual(grouped.bookmark, [firstBookmark, secondBookmark]);
	assert.deepEqual(grouped.analysis, [analysis]);
	assert.deepEqual(grouped.takeaway, [takeaway]);
});

test("buildResultLink maps bookmark results to x.com and workspace results to existing pages", () => {
	assert.deepEqual(buildResultLink(createResult({ sourceType: "bookmark", sourceId: "12345", score: 0.95 })), {
		href: "https://x.com/i/web/status/12345",
		label: "View on X",
		external: true,
	});
	assert.deepEqual(buildResultLink(createResult({ sourceType: "analysis", sourceId: "analysis_1", score: 0.9 })), {
		href: "/app",
		label: "View in analyses",
		external: false,
	});
	assert.deepEqual(buildResultLink(createResult({ sourceType: "takeaway", sourceId: "takeaway_1", score: 0.8 })), {
		href: "/app/takeaway",
		label: "View in takeaways",
		external: false,
	});
});

test("formatScoreLabel renders vector scores as rounded percentages", () => {
	assert.equal(formatScoreLabel(0.95), "95%");
	assert.equal(formatScoreLabel(0.7), "70%");
	assert.equal(formatScoreLabel(1), "100%");
});

test("truncateSnippet only truncates text over the provided max length", () => {
	assert.equal(truncateSnippet("Short snippet", 20), "Short snippet");
	assert.equal(truncateSnippet("This text is longer than the preview budget", 20), "This text is long...");
});
