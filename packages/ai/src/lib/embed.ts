import type { ProviderId } from "@tenbrains/contracts";

import {
	type EmbeddingCatalogEntry,
	getDefaultEmbeddingCatalogEntry,
	getEmbeddingCatalogEntry,
	getProviderCatalogEntry,
	OPENAI_EMBEDDING_MODEL,
} from "./catalog.js";
import { AiProviderError } from "./errors.js";

interface JsonObject {
	[key: string]: unknown;
}

interface OpenAiEmbeddingData {
	index: number;
	embedding: number[];
}

export interface EmbedTextsInput {
	texts: string[];
	apiKey: string;
	model?: string;
}

export interface EmbedTextsResult {
	model: string;
	dimensions: number;
	vectors: number[][];
}

export const EMBED_BATCH_SIZE = 96;
export const EMBED_MAX_INPUT_CHARS = 8000;

const PROVIDER_REQUEST_TIMEOUT_MS = 25_000;
const OPENAI_PROVIDER = "openai" satisfies ProviderId;

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

function resolveEmbeddingModel(model?: string): EmbeddingCatalogEntry {
	const trimmed = model?.trim();
	if (!trimmed) {
		return getDefaultEmbeddingCatalogEntry();
	}

	const entry = getEmbeddingCatalogEntry(trimmed);
	if (!entry) {
		throw new AiProviderError({
			provider: OPENAI_PROVIDER,
			code: "CONFIG_ERROR",
			message: `Unsupported embedding model: ${trimmed}.`,
		});
	}
	return entry;
}

function truncateText(text: string): string {
	return text.length > EMBED_MAX_INPUT_CHARS ? text.slice(0, EMBED_MAX_INPUT_CHARS) : text;
}

function isNumberVector(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function parseEmbeddingData(payload: unknown, dimensions: number, expectedCount: number): number[][] {
	if (typeof payload !== "object" || payload === null) {
		throw new AiProviderError({
			provider: OPENAI_PROVIDER,
			code: "INVALID_RESPONSE",
			message: "Provider returned an invalid embeddings response.",
		});
	}

	const data = (payload as JsonObject).data;
	if (!Array.isArray(data)) {
		throw new AiProviderError({
			provider: OPENAI_PROVIDER,
			code: "INVALID_RESPONSE",
			message: "Provider returned embeddings without a data array.",
		});
	}

	const parsed: OpenAiEmbeddingData[] = [];
	for (const item of data) {
		if (typeof item !== "object" || item === null) {
			continue;
		}
		const index = (item as JsonObject).index;
		const embedding = (item as JsonObject).embedding;
		if (typeof index === "number" && Number.isInteger(index) && isNumberVector(embedding)) {
			parsed.push({ index, embedding });
		}
	}

	if (parsed.length !== expectedCount) {
		throw new AiProviderError({
			provider: OPENAI_PROVIDER,
			code: "INVALID_RESPONSE",
			message: "Provider returned the wrong number of embedding vectors.",
		});
	}

	const seenIndexes = new Set<number>();
	for (const item of parsed) {
		if (item.index < 0 || item.index >= expectedCount || seenIndexes.has(item.index)) {
			throw new AiProviderError({
				provider: OPENAI_PROVIDER,
				code: "INVALID_RESPONSE",
				message: "Provider returned embedding indexes that do not match the input order.",
			});
		}
		seenIndexes.add(item.index);
	}

	const vectors = parsed.sort((left, right) => left.index - right.index).map((item) => item.embedding);
	if (vectors.some((vector) => vector.length !== dimensions)) {
		throw new AiProviderError({
			provider: OPENAI_PROVIDER,
			code: "INVALID_RESPONSE",
			message: `Provider returned embeddings with dimensions other than ${dimensions}.`,
		});
	}
	return vectors;
}

async function embedBatch({
	apiKey,
	model,
	dimensions,
	texts,
}: {
	apiKey: string;
	model: string;
	dimensions: number;
	texts: string[];
}): Promise<number[][]> {
	const payload = await postJson(OPENAI_PROVIDER, "https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			input: texts.map(truncateText),
			dimensions,
		}),
	});
	return parseEmbeddingData(payload, dimensions, texts.length);
}

export async function embedTexts(input: EmbedTextsInput): Promise<EmbedTextsResult> {
	const modelEntry = resolveEmbeddingModel(input.model ?? OPENAI_EMBEDDING_MODEL);
	if (input.texts.length === 0) {
		return {
			model: modelEntry.model,
			dimensions: modelEntry.dimensions,
			vectors: [],
		};
	}

	const apiKey = input.apiKey.trim();
	if (!apiKey) {
		throw new AiProviderError({
			provider: modelEntry.provider,
			code: "CONFIG_ERROR",
			message: "OpenAI API key is required for embeddings.",
		});
	}

	const vectors: number[][] = [];
	for (let start = 0; start < input.texts.length; start += EMBED_BATCH_SIZE) {
		const batch = input.texts.slice(start, start + EMBED_BATCH_SIZE);
		vectors.push(
			...(await embedBatch({
				apiKey,
				model: modelEntry.model,
				dimensions: modelEntry.dimensions,
				texts: batch,
			})),
		);
	}

	return {
		model: modelEntry.model,
		dimensions: modelEntry.dimensions,
		vectors,
	};
}
