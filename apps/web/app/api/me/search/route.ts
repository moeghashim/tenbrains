import { embedTexts } from "@tenbrains/ai";
import {
	SearchRequestSchema,
	type SearchResult,
	SearchResponseSchema,
	type SearchResponse,
} from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../src/config/startup-env.js";
import { resolveEmbeddingKey } from "../../../../src/embeddings/resolve-key.js";
import {
	type ScoredEmbeddingRecord,
	searchSimilarEmbeddingsForSession,
} from "../../../../src/server/convex-admin.js";
import { reportServerError } from "../../../../src/telemetry/report-error.js";

interface SessionUserLike {
	id?: string | null;
	email?: string | null;
	name?: string | null;
}

interface SessionLike {
	user?: SessionUserLike | null;
}

interface AuthenticatedSessionUser {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface SearchRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	resolveEmbeddingKey: typeof resolveEmbeddingKey;
	embedTexts: typeof embedTexts;
	searchSimilarEmbeddingsForSession: typeof searchSimilarEmbeddingsForSession;
	reportServerError: typeof reportServerError;
}

const DEFAULT_SEARCH_LIMIT = 10;

const defaultDependencies: SearchRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	resolveEmbeddingKey,
	embedTexts,
	searchSimilarEmbeddingsForSession,
	reportServerError,
};

function readSessionUser(session: SessionLike | null): AuthenticatedSessionUser | null {
	const user = session?.user;
	const id = user?.id?.trim() ?? "";
	if (!user || !id) {
		return null;
	}
	return {
		id,
		email: user.email,
		name: user.name,
	};
}

function unauthorizedResponse() {
	return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
}

function invalidInputResponse(error: ZodError | SyntaxError) {
	const message = error instanceof ZodError ? (error.issues[0]?.message ?? "Invalid search input.") : "Invalid JSON body.";
	return NextResponse.json({ error: { message } }, { status: 400 });
}

function searchFailureResponse() {
	return NextResponse.json({ error: { message: "Unable to search." } }, { status: 500 });
}

function toSearchResult(record: ScoredEmbeddingRecord): SearchResult {
	return {
		sourceType: record.sourceType,
		sourceId: record.sourceId,
		text: record.text,
		score: record._score,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

function sortResultsByScore(results: SearchResult[]): SearchResult[] {
	return [...results].sort((left, right) => right.score - left.score);
}

async function readSearchInput(req: Request) {
	try {
		return SearchRequestSchema.parse(await req.json());
	} catch (error) {
		if (error instanceof ZodError || error instanceof SyntaxError) {
			return invalidInputResponse(error);
		}
		throw error;
	}
}

export async function handleSearchPost(
	req: Request,
	dependencies: SearchRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const inputOrResponse = await readSearchInput(req);
		if (inputOrResponse instanceof NextResponse) {
			return inputOrResponse;
		}
		const input = inputOrResponse;

		try {
			const apiKey = await dependencies.resolveEmbeddingKey({ sessionUser });
			if (!apiKey) {
				const response: SearchResponse = SearchResponseSchema.parse({
					query: input.query,
					needsKey: true,
					results: [],
				});
				return NextResponse.json(response);
			}

			const embedded = await dependencies.embedTexts({
				texts: [input.query],
				apiKey,
			});
			const vector = embedded.vectors[0];
			if (!vector) {
				throw new Error("Embedding service returned no vector for the search query.");
			}

			const rows = await dependencies.searchSimilarEmbeddingsForSession({
				sessionUser,
				vector,
				limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
				sourceTypes: input.sourceTypes,
			});
			const response: SearchResponse = SearchResponseSchema.parse({
				query: input.query,
				results: sortResultsByScore(rows.map(toSearchResult)),
			});
			return NextResponse.json(response);
		} catch (error) {
			dependencies.reportServerError({
				scope: "api.search.failure",
				error,
				metadata: {
					userId: sessionUser.id,
				},
			});
			return searchFailureResponse();
		}
	} catch (error) {
		dependencies.reportServerError({
			scope: "api.search.failure",
			error,
		});
		return searchFailureResponse();
	}
}

export async function POST(req: Request) {
	return handleSearchPost(req);
}
