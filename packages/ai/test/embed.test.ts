import assert from "node:assert/strict";
import test from "node:test";

import {
	AiProviderError,
	EMBED_BATCH_SIZE,
	EMBED_MAX_INPUT_CHARS,
	embedTexts,
	OPENAI_EMBEDDING_DIMENSIONS,
	OPENAI_EMBEDDING_MODEL,
} from "../src/index.js";

interface EmbeddingRequestBody {
	model: string;
	input: string[];
	dimensions: number;
}

function vector(seed: number): number[] {
	return Array.from({ length: OPENAI_EMBEDDING_DIMENSIONS }, (_value, index) => (index === 0 ? seed : 0));
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}

function readRequestBody(init: RequestInit | undefined): EmbeddingRequestBody {
	const body = init?.body;
	if (typeof body !== "string") {
		assert.fail("Expected request body to be a string.");
	}
	return JSON.parse(body) as EmbeddingRequestBody;
}

async function captureAiProviderError(operation: () => Promise<unknown>): Promise<AiProviderError> {
	try {
		await operation();
		assert.fail("Expected AiProviderError.");
	} catch (error) {
		assert.ok(error instanceof AiProviderError);
		return error;
	}
}

test("embedTexts returns an empty result without calling fetch for empty input", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error("fetch should not be called");
	};

	try {
		const result = await embedTexts({
			texts: [],
			apiKey: "sk-test",
		});

		assert.equal(result.model, OPENAI_EMBEDDING_MODEL);
		assert.equal(result.dimensions, OPENAI_EMBEDDING_DIMENSIONS);
		assert.deepEqual(result.vectors, []);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("embedTexts batches requests and preserves input order across batches", async () => {
	const originalFetch = globalThis.fetch;
	const batchSizes: number[] = [];
	let offset = 0;
	globalThis.fetch = async (_input, init) => {
		const request = readRequestBody(init);
		const batchOffset = offset;
		offset += request.input.length;
		batchSizes.push(request.input.length);
		return jsonResponse({
			data: request.input.map((_text, index) => ({
				index,
				embedding: vector(batchOffset + index),
			})),
		});
	};

	try {
		const texts = Array.from({ length: EMBED_BATCH_SIZE + 1 }, (_value, index) => `input ${index}`);
		const result = await embedTexts({
			texts,
			apiKey: "sk-test",
		});

		assert.deepEqual(batchSizes, [EMBED_BATCH_SIZE, 1]);
		assert.equal(result.vectors.length, texts.length);
		assert.equal(result.vectors[0]?.[0], 0);
		assert.equal(result.vectors[95]?.[0], 95);
		assert.equal(result.vectors[96]?.[0], 96);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("embedTexts orders vectors by provider index within each batch", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (_input, init) => {
		const request = readRequestBody(init);
		return jsonResponse({
			data: request.input
				.map((_text, index) => ({
					index,
					embedding: vector(index),
				}))
				.reverse(),
		});
	};

	try {
		const result = await embedTexts({
			texts: ["first", "second", "third"],
			apiKey: "sk-test",
		});

		assert.deepEqual(
			result.vectors.map((item) => item[0]),
			[0, 1, 2],
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("embedTexts truncates long inputs before sending them to OpenAI", async () => {
	const originalFetch = globalThis.fetch;
	let sentInput = "";
	globalThis.fetch = async (_input, init) => {
		const request = readRequestBody(init);
		sentInput = request.input[0] ?? "";
		return jsonResponse({
			data: [{ index: 0, embedding: vector(0) }],
		});
	};

	try {
		await embedTexts({
			texts: ["x".repeat(EMBED_MAX_INPUT_CHARS + 10)],
			apiKey: "sk-test",
		});

		assert.equal(sentInput.length, EMBED_MAX_INPUT_CHARS);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("embedTexts maps provider status errors to AiProviderError", async () => {
	const cases: Array<{
		status: number;
		code: AiProviderError["code"];
		retryable: boolean;
	}> = [
		{ status: 401, code: "UNAUTHORIZED", retryable: false },
		{ status: 429, code: "RATE_LIMITED", retryable: true },
		{ status: 503, code: "UPSTREAM_ERROR", retryable: true },
	];
	const originalFetch = globalThis.fetch;

	try {
		for (const testCase of cases) {
			globalThis.fetch = async () =>
				jsonResponse(
					{
						error: {
							message: `status ${testCase.status}`,
						},
					},
					testCase.status,
				);

			const error = await captureAiProviderError(() =>
				embedTexts({
					texts: ["hello"],
					apiKey: "sk-test",
				}),
			);

			assert.equal(error.code, testCase.code);
			assert.equal(error.status, testCase.status);
			assert.equal(error.retryable, testCase.retryable);
			assert.match(error.message, new RegExp(`status ${testCase.status}`));
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});
