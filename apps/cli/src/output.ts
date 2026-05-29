import type { ProviderId } from "@tenbrains/contracts";
import type { TweetLearningAnalysis } from "tenbrains";
import type { ThreadPayload, ThreadTweetPayload } from "@tenbrains/x-client";

export interface AnalyzeCliJsonResult {
	tweet: ThreadTweetPayload;
	thread: ThreadPayload;
	analysis: TweetLearningAnalysis;
	provider: ProviderId;
	model: string;
}

export function buildThreadCanonicalUrl(tweet: ThreadTweetPayload): string {
	const username = typeof tweet.authorUsername === "string" && tweet.authorUsername.trim() ? tweet.authorUsername.trim() : "i/web";
	if (username === "i/web") {
		return `https://x.com/i/web/status/${tweet.id}`;
	}
	return `https://x.com/${username}/status/${tweet.id}`;
}

export function renderThreadMarkdown(thread: ThreadPayload): string {
	const lines = [`# Thread (${thread.tweets.length} posts)`, ""];
	thread.tweets.forEach((tweet, index) => {
		lines.push(`## ${index + 1}. @${tweet.authorUsername ?? "unknown"}`);
		lines.push(buildThreadCanonicalUrl(tweet));
		lines.push("");
		lines.push(tweet.text);
		lines.push("");
	});
	return lines.join("\n").trimEnd();
}

export function buildAnalyzeCliJsonResult({
	tweet,
	thread,
	analysis,
	provider,
	model,
}: {
	tweet: ThreadTweetPayload;
	thread: ThreadPayload;
	analysis: TweetLearningAnalysis;
	provider: ProviderId;
	model: string;
}): AnalyzeCliJsonResult {
	return {
		tweet,
		thread,
		analysis,
		provider,
		model,
	};
}
