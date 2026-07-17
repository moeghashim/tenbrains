import { parseOrThrow } from "../core/validate.js";
import {
  type AnalysisResult,
  AnalysisResultSchema,
  type SummaryResult,
  SummaryResultSchema,
  type TakeawayResult,
  TakeawayResultSchema,
} from "../domain/schemas.js";
import { complete } from "./client.js";
import { extractJsonObject } from "./json.js";
import { mockAnalysis, mockSummary, mockTakeaway } from "./mock.js";
import {
  accountTakeawaySystemPrompt,
  accountTakeawayUserPrompt,
  contentSummarySystemPrompt,
  contentSummaryUserPrompt,
  tweetAnalysisSystemPrompt,
  tweetAnalysisUserPrompt,
} from "./prompts.js";
import type { ResolvedProvider } from "./resolve.js";

export interface AnalysisOutcome {
  result: AnalysisResult;
  mock: boolean;
}

export interface PostForAnalysis {
  text: string;
  authorUsername?: string | undefined;
  authorName?: string | undefined;
  url?: string | undefined;
}

export async function analyzePost(
  resolved: ResolvedProvider,
  post: PostForAnalysis,
  kind: "tweet" | "transcript" = "tweet",
): Promise<AnalysisOutcome> {
  if (resolved.provider === "mock") {
    return { result: mockAnalysis(post.text), mock: true };
  }
  const text = await complete({
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey as string,
    system: tweetAnalysisSystemPrompt(kind),
    user: tweetAnalysisUserPrompt(post),
  });
  const result = parseOrThrow(
    AnalysisResultSchema,
    extractJsonObject(text),
    "Provider response did not match the expected analysis shape.",
    "PROVIDER_BAD_OUTPUT",
  );
  return { result, mock: false };
}

export interface SummaryOutcome {
  result: SummaryResult;
  mock: boolean;
}

export async function summarizeContent(
  resolved: ResolvedProvider,
  content: string,
): Promise<SummaryOutcome> {
  if (resolved.provider === "mock") {
    return { result: mockSummary(content), mock: true };
  }
  const text = await complete({
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey as string,
    system: contentSummarySystemPrompt(),
    user: contentSummaryUserPrompt(content),
  });
  const result = parseOrThrow(
    SummaryResultSchema,
    extractJsonObject(text),
    "Provider response did not match the expected summary shape.",
    "PROVIDER_BAD_OUTPUT",
  );
  return { result, mock: false };
}

export interface TakeawayOutcome {
  result: TakeawayResult;
  mock: boolean;
}

export async function summarizeAccount(
  resolved: ResolvedProvider,
  input: {
    account: { username: string; name?: string | undefined };
    posts: Array<{ text: string; postedAt?: string | undefined }>;
  },
): Promise<TakeawayOutcome> {
  if (resolved.provider === "mock") {
    return { result: mockTakeaway(input.posts), mock: true };
  }
  const text = await complete({
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey as string,
    system: accountTakeawaySystemPrompt(),
    user: accountTakeawayUserPrompt(input),
  });
  const result = parseOrThrow(
    TakeawayResultSchema,
    extractJsonObject(text),
    "Provider response did not match the expected takeaway shape.",
    "PROVIDER_BAD_OUTPUT",
  );
  return { result, mock: false };
}
