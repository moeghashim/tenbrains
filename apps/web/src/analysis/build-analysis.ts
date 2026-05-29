import {
	AnalyzeTweetResultSchema,
	type AnalyzeTweetResult,
} from "@tenbrains/contracts";
import { parseTweetLearningAnalysisText } from "tenbrains";
import type { TweetPayload } from "@tenbrains/x-client";

function toSentence(text: string, maxLength: number): string {
	const compact = text.replace(/\s+/g, " ").trim();
	if (compact.length <= maxLength) {
		return compact;
	}
	return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length >= 5);
}

function buildConcepts(tweetText: string): AnalyzeTweetResult["novelConcepts"] {
	const uniqueTerms = Array.from(new Set(tokenize(tweetText))).slice(0, 5);
	const fallbackTerms = ["signal", "cadence", "leverage", "clarity", "synthesis"];
	while (uniqueTerms.length < 5) {
		const fallback = fallbackTerms[uniqueTerms.length] ?? `concept-${uniqueTerms.length + 1}`;
		uniqueTerms.push(fallback);
	}

	return uniqueTerms.map((term) => ({
		name: term.charAt(0).toUpperCase() + term.slice(1),
		whyItMattersInTweet: `This term appears central to the tweet narrative: ${term}.`,
	}));
}

export function buildAnalysisFromTweetPayload(tweet: TweetPayload): AnalyzeTweetResult {
	const topicSeed = toSentence(tweet.text, 80);
	const summary = toSentence(tweet.text, 180);
	const intent = "Share a concise update with clear technical signal.";
	const generated = {
		topic: topicSeed,
		summary,
		intent,
		novelConcepts: buildConcepts(tweet.text),
	};

	const parsedCoreShape = parseTweetLearningAnalysisText(JSON.stringify(generated));
	return AnalyzeTweetResultSchema.parse(parsedCoreShape);
}
