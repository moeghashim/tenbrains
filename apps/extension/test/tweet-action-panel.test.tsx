import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TweetActionPanel } from "../src/content/TweetActionPanel.js";

function createProps() {
	return {
		status: "success" as const,
		tweetUrl: "https://x.com/ctatedev/status/2028960626685386994",
		analysisResult: {
			tweet: {
				id: "2028960626685386994",
				text: "Ship small and often.",
				authorUsername: "ctatedev",
				authorName: "Chris Tate",
				publicMetrics: {
					replyCount: 12,
					likeCount: 240,
					repostCount: 33,
				},
			},
			analysis: {
				topic: "Shipping cadence",
				summary: "A concise note on shipping smaller increments.",
				intent: "Encourage steady delivery.",
				novelConcepts: [
					{ name: "Iteration", whyItMattersInTweet: "It frames the delivery cycle." },
					{ name: "Scope", whyItMattersInTweet: "Small scope lowers risk." },
					{ name: "Cadence", whyItMattersInTweet: "The post suggests steady rhythm." },
					{ name: "Feedback", whyItMattersInTweet: "Frequent releases improve learning." },
					{ name: "Confidence", whyItMattersInTweet: "Shipping increases confidence." },
				],
			},
			thread: {
				rootTweetId: "2028960626685386994",
				tweets: [
					{
						id: "2028960626685386994",
						text: "Ship small and often.",
						authorUsername: "ctatedev",
						authorName: "Chris Tate",
					},
					{
						id: "2028960626685386995",
						text: "Follow-up detail in the same thread.",
						authorUsername: "ctatedev",
						authorName: "Chris Tate",
						inReplyToTweetId: "2028960626685386994",
					},
				],
			},
		},
		tagsInput: "Iteration, Scope",
		errorMessage: null,
		authMessage: null,
		saveMessage: "Saved to Tenbrains bookmarks.",
		copyStatus: null,
		isSaving: false,
		onAnalyze: () => {},
		onCopyMarkdown: () => {},
		onToggleConcept: () => {},
		onChangeTagsInput: () => {},
		onSaveBookmark: () => {},
	};
}

test("TweetActionPanel renders analysis and bookmark states", () => {
	const html = renderToStaticMarkup(<TweetActionPanel {...createProps()} />);
	assert.match(html, /Tenbrains for X/);
	assert.match(html, /Shipping cadence/);
	assert.match(html, /Saved to Tenbrains bookmarks/);
	assert.match(html, /Iteration/);
	assert.match(html, /Open Bookmarks/);
	assert.match(html, /Copy Thread Markdown/);
	assert.match(html, /Showing all 2 posts in the analyzed thread/);
	assert.match(html, /Follow-up detail in the same thread/);
});

test("TweetActionPanel renders markdown copy feedback", () => {
	const html = renderToStaticMarkup(
		<TweetActionPanel
			{...createProps()}
			copyStatus={{
				kind: "success",
				message: "Copied thread and analysis as Markdown.",
			}}
		/>,
	);

	assert.match(html, /Copied thread and analysis as Markdown\./);
});

test("TweetActionPanel renders auth-pending message", () => {
	const html = renderToStaticMarkup(
		<TweetActionPanel
			{...createProps()}
			status="auth-pending"
			analysisResult={null}
			authMessage="Complete Tenbrains sign-in in the opened tab, then return to X."
			saveMessage={null}
		/>,
	);
	assert.match(html, /Complete Tenbrains sign-in/);
	assert.doesNotMatch(html, /Saved to Tenbrains bookmarks/);
});
