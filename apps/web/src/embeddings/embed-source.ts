import { createHash } from "node:crypto";

import { embedTexts } from "@tenbrains/ai";
import type { AnalyzeTweetResult, AccountTakeawaySnapshot, SavedAnalysis, SavedBookmark } from "@tenbrains/contracts";

import { resolveEmbeddingKey } from "./resolve-key.js";
import { upsertEmbeddingForSession } from "../server/convex-admin.js";
import { reportServerError } from "../telemetry/report-error.js";

export type EmbeddingSourceType = "bookmark" | "analysis" | "takeaway";

interface SessionUserIdentity {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface TelemetryMetadata {
	[key: string]: string | number | boolean | null;
}

interface EmbedTextsClient {
	(input: {
		texts: string[];
		apiKey: string;
		model?: string;
	}): Promise<{
		model: string;
		dimensions: number;
		vectors: number[][];
	}>;
}

interface UpsertEmbeddingForSession {
	(input: {
		sessionUser: SessionUserIdentity;
		sourceType: EmbeddingSourceType;
		sourceId: string;
		text: string;
		contentHash: string;
		model: string;
		embedding: number[];
	}): Promise<unknown>;
}

interface ResolveEmbeddingKey {
	(input: { sessionUser: SessionUserIdentity }): Promise<string | null>;
}

interface ReportServerError {
	(input: {
		scope: string;
		error: unknown;
		metadata?: TelemetryMetadata;
	}): void;
}

export interface EmbedAndStoreSourceInput {
	sessionUser: SessionUserIdentity;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	text: string;
}

export interface EmbedAndStoreSourceDependencies {
	resolveEmbeddingKey?: ResolveEmbeddingKey;
	embedTexts?: EmbedTextsClient;
	upsertEmbeddingForSession?: UpsertEmbeddingForSession;
	reportServerError?: ReportServerError;
}

function normalizeEmbeddingText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function computeEmbeddingContentHash(text: string): string {
	return createHash("sha256").update(normalizeEmbeddingText(text)).digest("hex");
}

function reportEmbeddingSkip({
	input,
	report,
	error,
	reason,
}: {
	input: EmbedAndStoreSourceInput;
	report: ReportServerError;
	error: unknown;
	reason: string;
}): void {
	report({
		scope: reason,
		error,
		metadata: {
			level: "info",
			userId: input.sessionUser.id,
			sourceType: input.sourceType,
			sourceId: input.sourceId,
		},
	});
}

export async function embedAndStoreSource(
	input: EmbedAndStoreSourceInput,
	dependencies: EmbedAndStoreSourceDependencies = {},
): Promise<void> {
	const resolveKey = dependencies.resolveEmbeddingKey ?? resolveEmbeddingKey;
	const embed = dependencies.embedTexts ?? embedTexts;
	const upsert = dependencies.upsertEmbeddingForSession ?? upsertEmbeddingForSession;
	const report = dependencies.reportServerError ?? reportServerError;
	const normalizedText = normalizeEmbeddingText(input.text);

	try {
		if (!normalizedText) {
			reportEmbeddingSkip({
				input,
				report,
				error: new Error("Embedding skipped because source text is empty."),
				reason: "embeddings.skipped_empty_text",
			});
			return;
		}

		const apiKey = await resolveKey({ sessionUser: input.sessionUser });
		if (!apiKey) {
			reportEmbeddingSkip({
				input,
				report,
				error: new Error("Embedding skipped because no OpenAI API key is configured."),
				reason: "embeddings.skipped_no_key",
			});
			return;
		}

		// PR2's Convex upsert already skips unchanged contentHash rows, so this path avoids an extra pre-read.
		const contentHash = computeEmbeddingContentHash(normalizedText);
		const result = await embed({
			texts: [normalizedText],
			apiKey,
		});
		const embedding = result.vectors[0];
		if (!embedding) {
			throw new Error("Embedding service returned no vector for source text.");
		}

		await upsert({
			sessionUser: input.sessionUser,
			sourceType: input.sourceType,
			sourceId: input.sourceId,
			text: normalizedText,
			contentHash,
			model: result.model,
			embedding,
		});
	} catch (error) {
		report({
			scope: "embeddings.embed_on_write_failure",
			error,
			metadata: {
				userId: input.sessionUser.id,
				sourceType: input.sourceType,
				sourceId: input.sourceId,
			},
		});
	}
}

export function buildAnalysisEmbeddingText(analysis: AnalyzeTweetResult): string {
	return [
		analysis.topic,
		analysis.summary,
		analysis.intent,
		...analysis.novelConcepts.map((concept) => concept.name),
	].join("\n");
}

export function buildTakeawayEmbeddingText(snapshot: Pick<AccountTakeawaySnapshot, "summary" | "takeaways">): string {
	return [snapshot.summary, ...snapshot.takeaways].join("\n");
}

export async function embedBookmarkSource({
	sessionUser,
	bookmark,
	dependencies,
}: {
	sessionUser: SessionUserIdentity;
	bookmark: Pick<SavedBookmark, "tweetId" | "tweetText">;
	dependencies?: EmbedAndStoreSourceDependencies;
}): Promise<void> {
	await embedAndStoreSource(
		{
			sessionUser,
			sourceType: "bookmark",
			sourceId: bookmark.tweetId,
			text: bookmark.tweetText,
		},
		dependencies,
	);
}

export async function embedAnalysisSource({
	sessionUser,
	analysis,
	dependencies,
}: {
	sessionUser: SessionUserIdentity;
	analysis: Pick<SavedAnalysis, "id" | "topic" | "summary" | "intent" | "novelConcepts">;
	dependencies?: EmbedAndStoreSourceDependencies;
}): Promise<void> {
	await embedAndStoreSource(
		{
			sessionUser,
			sourceType: "analysis",
			sourceId: analysis.id,
			text: buildAnalysisEmbeddingText(analysis),
		},
		dependencies,
	);
}

export async function embedTakeawaySnapshotSource({
	sessionUser,
	snapshot,
	dependencies,
}: {
	sessionUser: SessionUserIdentity;
	snapshot: Pick<AccountTakeawaySnapshot, "id" | "summary" | "takeaways">;
	dependencies?: EmbedAndStoreSourceDependencies;
}): Promise<void> {
	await embedAndStoreSource(
		{
			sessionUser,
			sourceType: "takeaway",
			sourceId: snapshot.id,
			text: buildTakeawayEmbeddingText(snapshot),
		},
		dependencies,
	);
}
