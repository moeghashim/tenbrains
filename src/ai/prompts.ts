import type { NewPost } from "../db/repositories.js";

function compactPost(post: Pick<NewPost, "text" | "authorUsername" | "authorName" | "url">) {
  return {
    text: post.text,
    authorUsername: post.authorUsername ?? null,
    authorName: post.authorName ?? null,
    url: post.url ?? null,
  };
}

export function tweetAnalysisSystemPrompt(kind: "tweet" | "transcript" = "tweet"): string {
  return [
    kind === "transcript"
      ? "You are analyzing a video transcript."
      : "You are analyzing a post on X.",
    "Return only a valid JSON object with exactly these keys: topic, summary, intent, novelConcepts.",
    "novelConcepts must be an array with exactly 5 objects.",
    "Each concept object must have keys: name and whyItMattersInTweet.",
    "topic, summary, intent, name, and whyItMattersInTweet must be non-empty strings.",
    "Do not include markdown fences, comments, or extra keys.",
    "Keep it factual and avoid speculation when evidence is missing.",
  ].join(" ");
}

export function contentSummarySystemPrompt(): string {
  return [
    "You are summarizing long-form content.",
    "Return only a valid JSON object with exactly these keys: summary, keyPoints.",
    "summary must be a substantive, readable multi-paragraph string.",
    "keyPoints must be an array of non-empty strings.",
    "Stay factual and grounded in the supplied content.",
    "Do not include markdown fences, comments, or extra keys.",
  ].join(" ");
}

export function contentSummaryUserPrompt(content: string): string {
  return JSON.stringify({ content }, null, 2);
}

export function tweetAnalysisUserPrompt(post: {
  text: string;
  authorUsername?: string | undefined;
  authorName?: string | undefined;
  url?: string | undefined;
}): string {
  return JSON.stringify({ post: compactPost(post) }, null, 2);
}

export function accountTakeawaySystemPrompt(): string {
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

export function accountTakeawayUserPrompt(input: {
  account: { username: string; name?: string | undefined };
  posts: Array<{ text: string; postedAt?: string | undefined }>;
}): string {
  return JSON.stringify(
    {
      account: { username: input.account.username, name: input.account.name ?? null },
      posts: input.posts.map((p) => ({ text: p.text, postedAt: p.postedAt ?? null })),
    },
    null,
    2,
  );
}
