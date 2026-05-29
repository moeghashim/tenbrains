import type { TweetPayload } from "@tenbrains/x-client";

function compactIncludes(tweet: TweetPayload) {
	return {
		id: tweet.id,
		text: tweet.text,
		authorId: tweet.authorId,
		authorUsername: tweet.authorUsername,
		authorName: tweet.authorName,
		authorAvatarUrl: tweet.authorAvatarUrl,
		media: tweet.media ?? [],
		publicMetrics: tweet.publicMetrics ?? {},
	};
}

export function buildTweetAnalysisSystemPrompt(): string {
	return [
		"You are analyzing a post on X.",
		"Return only a valid JSON object with exactly these keys: topic, summary, intent, novelConcepts.",
		"novelConcepts must be an array with exactly 5 objects.",
		"Each concept object must have keys: name and whyItMattersInTweet.",
		"topic, summary, intent, name, and whyItMattersInTweet must be non-empty strings.",
		"Do not include markdown fences, comments, or extra keys.",
		"Keep it factual and avoid speculation when evidence is missing.",
	].join(" ");
}

export function buildTweetAnalysisUserPrompt(tweet: TweetPayload): string {
	return JSON.stringify(
		{
			tweet: compactIncludes(tweet),
		},
		null,
		2,
	);
}

export function buildAccountTakeawaySystemPrompt(): string {
	return [
		"You are analyzing a followed X account based on its recent posts.",
		"Return only a valid JSON object with exactly these keys: summary, takeaways.",
		"summary must be a non-empty string.",
		"takeaways must be an array with 3 to 5 non-empty strings.",
		"Keep the language concise, factual, and grounded in the provided posts.",
		"Do not speculate beyond the evidence in the posts.",
		"Do not include markdown fences, comments, or extra keys.",
	].join(" ");
}

export function buildAccountTakeawayUserPrompt({
	account,
	posts,
}: {
	account: {
		id?: string;
		username: string;
		name?: string;
	};
	posts: TweetPayload[];
}): string {
	return JSON.stringify(
		{
			account,
			posts: posts.map((post) => compactIncludes(post)),
		},
		null,
		2,
	);
}
