import { type AccountTakeawayAnalysis, AccountTakeawayAnalysisSchema, type ProviderId } from "@tenbrains/contracts";
import type { TweetPayload, XUserPayload } from "@tenbrains/x-client";
import { parseTweetLearningAnalysisText, type TweetLearningAnalysis } from "tenbrains";

import { getProviderCatalogEntry } from "./catalog.js";
import { AiProviderError } from "./errors.js";
import {
	buildAccountTakeawaySystemPrompt,
	buildAccountTakeawayUserPrompt,
	buildTweetAnalysisSystemPrompt,
	buildTweetAnalysisUserPrompt,
} from "./prompt.js";

interface JsonObject {
	[key: string]: unknown;
}

const PROVIDER_REQUEST_TIMEOUT_MS = 25_000;

function mapStatusToError(provider: ProviderId, status: number, message: string): AiProviderError {
	if (status === 401 || status === 403) {
		return new AiProviderError({ provider, code: "UNAUTHORIZED", status, message });
	}
	if (status === 429) {
		return new AiProviderError({ provider, code: "RATE_LIMITED", status, message, retryable: true });
	}
	return new AiProviderError({
		provider,
		code: "UPSTREAM_ERROR",
		status,
		message,
		retryable: status >= 500,
	});
}

function toErrorMessage(payload: unknown, fallback: string): string {
	if (typeof payload !== "object" || payload === null) {
		return fallback;
	}

	for (const key of ["error", "message"]) {
		const value = (payload as JsonObject)[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
		if (typeof value === "object" && value !== null) {
			const nestedMessage = (value as JsonObject).message;
			if (typeof nestedMessage === "string" && nestedMessage.trim()) {
				return nestedMessage.trim();
			}
		}
	}

	return fallback;
}

async function postJson(provider: ProviderId, url: string, init: RequestInit): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, {
			...init,
			signal: controller.signal,
		});
	} catch (error) {
		throw new AiProviderError({
			provider,
			code: "NETWORK_ERROR",
			message: controller.signal.aborted
				? `${getProviderCatalogEntry(provider).label} request timed out.`
				: error instanceof Error
					? error.message
					: "Network request failed.",
			retryable: true,
		});
	} finally {
		clearTimeout(timeout);
	}

	const contentType = response.headers.get("content-type") ?? "";
	const payload = contentType.includes("application/json")
		? ((await response.json()) as unknown)
		: await response.text();
	if (!response.ok) {
		throw mapStatusToError(
			provider,
			response.status,
			toErrorMessage(payload, `Provider request failed (${response.status}).`),
		);
	}
	return payload;
}

function extractOpenAiText(payload: unknown): string {
	if (typeof payload !== "object" || payload === null) {
		return "";
	}
	const outputText = (payload as JsonObject).output_text;
	if (typeof outputText === "string" && outputText.trim()) {
		return outputText.trim();
	}

	const output = (payload as JsonObject).output;
	if (!Array.isArray(output)) {
		return "";
	}

	return output
		.flatMap((item) => {
			if (typeof item !== "object" || item === null) {
				return [];
			}

			const content = (item as JsonObject).content;
			if (!Array.isArray(content)) {
				return [];
			}

			return content.flatMap((entry) => {
				if (typeof entry !== "object" || entry === null) {
					return [];
				}
				const text = (entry as JsonObject).text;
				return typeof text === "string" && text.trim() ? [text.trim()] : [];
			});
		})
		.join("\n")
		.trim();
}

function extractAnthropicText(payload: unknown): string {
	if (typeof payload !== "object" || payload === null) {
		return "";
	}
	const content = (payload as JsonObject).content;
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.flatMap((item) => {
			if (typeof item !== "object" || item === null) {
				return [];
			}
			const text = (item as JsonObject).text;
			return typeof text === "string" ? [text] : [];
		})
		.join("\n")
		.trim();
}

function extractGoogleText(payload: unknown): string {
	if (typeof payload !== "object" || payload === null) {
		return "";
	}
	const candidates = (payload as JsonObject).candidates;
	if (!Array.isArray(candidates) || candidates.length === 0) {
		return "";
	}
	const content = (candidates[0] as JsonObject).content;
	if (typeof content !== "object" || content === null) {
		return "";
	}
	const parts = (content as JsonObject).parts;
	if (!Array.isArray(parts)) {
		return "";
	}
	return parts
		.flatMap((part) => {
			if (typeof part !== "object" || part === null) {
				return [];
			}
			const text = (part as JsonObject).text;
			return typeof text === "string" ? [text] : [];
		})
		.join("\n")
		.trim();
}

function extractXaiText(payload: unknown): string {
	if (typeof payload !== "object" || payload === null) {
		return "";
	}
	const choices = (payload as JsonObject).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return "";
	}
	const message = (choices[0] as JsonObject).message;
	if (typeof message !== "object" || message === null) {
		return "";
	}
	const content = (message as JsonObject).content;
	return typeof content === "string" ? content.trim() : "";
}

function parseProviderText(provider: ProviderId, text: string): TweetLearningAnalysis {
	try {
		return parseTweetLearningAnalysisText(text);
	} catch (error) {
		throw new AiProviderError({
			provider,
			code: "INVALID_RESPONSE",
			message: error instanceof Error ? error.message : "Provider returned invalid analysis output.",
		});
	}
}

function parseAccountTakeawayText(provider: ProviderId, text: string): AccountTakeawayAnalysis {
	try {
		return AccountTakeawayAnalysisSchema.parse(JSON.parse(text));
	} catch (error) {
		throw new AiProviderError({
			provider,
			code: "INVALID_RESPONSE",
			message: error instanceof Error ? error.message : "Provider returned invalid takeaway output.",
		});
	}
}

async function generateProviderText({
	provider,
	apiKey,
	model,
	systemPrompt,
	userPrompt,
}: {
	provider: ProviderId;
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
}): Promise<string> {
	let text = "";
	if (provider === "openai") {
		const payload = await postJson(provider, "https://api.openai.com/v1/responses", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				input: [
					{ role: "system", content: [{ type: "input_text", text: systemPrompt }] },
					{ role: "user", content: [{ type: "input_text", text: userPrompt }] },
				],
			}),
		});
		text = extractOpenAiText(payload);
	} else if (provider === "google") {
		const payload = await postJson(
			provider,
			`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: systemPrompt }] },
					contents: [{ role: "user", parts: [{ text: userPrompt }] }],
				}),
			},
		);
		text = extractGoogleText(payload);
	} else if (provider === "xai") {
		const payload = await postJson(provider, "https://api.x.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
			}),
		});
		text = extractXaiText(payload);
	} else {
		const payload = await postJson(provider, "https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				max_tokens: 1200,
				system: systemPrompt,
				messages: [{ role: "user", content: userPrompt }],
			}),
		});
		text = extractAnthropicText(payload);
	}

	if (!text.trim()) {
		throw new AiProviderError({
			provider,
			code: "INVALID_RESPONSE",
			message: `${getProviderCatalogEntry(provider).label} returned no text output.`,
		});
	}

	return text;
}

export async function analyzeTweetPayload({
	provider,
	apiKey,
	model,
	tweet,
}: {
	provider: ProviderId;
	apiKey: string;
	model: string;
	tweet: TweetPayload;
}): Promise<TweetLearningAnalysis> {
	if (!apiKey.trim()) {
		throw new AiProviderError({
			provider,
			code: "CONFIG_ERROR",
			message: `Missing API key for ${getProviderCatalogEntry(provider).label}.`,
		});
	}

	const systemPrompt = buildTweetAnalysisSystemPrompt();
	const userPrompt = buildTweetAnalysisUserPrompt(tweet);
	const text = await generateProviderText({
		provider,
		apiKey,
		model,
		systemPrompt,
		userPrompt,
	});
	return parseProviderText(provider, text);
}

export async function analyzeAccountTakeaway({
	provider,
	apiKey,
	model,
	account,
	posts,
}: {
	provider: ProviderId;
	apiKey: string;
	model: string;
	account: Pick<XUserPayload, "id" | "username" | "name">;
	posts: TweetPayload[];
}): Promise<AccountTakeawayAnalysis> {
	if (!apiKey.trim()) {
		throw new AiProviderError({
			provider,
			code: "CONFIG_ERROR",
			message: `Missing API key for ${getProviderCatalogEntry(provider).label}.`,
		});
	}
	if (posts.length === 0) {
		return AccountTakeawayAnalysisSchema.parse({
			summary: `No recent posts were available for @${account.username}.`,
			takeaways: ["No recent posts were returned by X for this account."],
		});
	}

	const text = await generateProviderText({
		provider,
		apiKey,
		model,
		systemPrompt: buildAccountTakeawaySystemPrompt(),
		userPrompt: buildAccountTakeawayUserPrompt({
			account,
			posts,
		}),
	});

	return parseAccountTakeawayText(provider, text);
}
