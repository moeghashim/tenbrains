import {
	AnalyzeTweetInputSchema,
	SavedAnalysisSchema,
	type AnalyzeTweetInput,
	type SavedAnalysis,
} from "@tenbrains/contracts";
import type { TweetSourceProvider } from "@tenbrains/x-client";

import { buildAnalysisFromTweetPayload } from "./build-analysis.js";

export interface AnalysisStorage {
	insert(record: Omit<SavedAnalysis, "id">): Promise<SavedAnalysis>;
	listByUser(userId: string): Promise<SavedAnalysis[]>;
}

export interface InMemoryAnalysisStorage extends AnalysisStorage {
	readonly records: SavedAnalysis[];
}

export function createInMemoryAnalysisStorage(): InMemoryAnalysisStorage {
	const records: SavedAnalysis[] = [];
	let sequence = 1;
	return {
		records,
		async insert(record) {
			const persisted = SavedAnalysisSchema.parse({
				id: `analysis_${sequence}`,
				...record,
			});
			sequence += 1;
			records.push(persisted);
			return persisted;
		},
		async listByUser(userId) {
			return records.filter((item) => item.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
		},
	};
}

export async function createAnalysisFromTweetUrl({
	userId,
	input,
	tweetSource,
	storage,
	now,
}: {
	userId: string;
	input: AnalyzeTweetInput;
	tweetSource: TweetSourceProvider;
	storage: AnalysisStorage;
	now?: () => number;
}): Promise<SavedAnalysis> {
	if (!userId.trim()) {
		throw new Error("Unauthorized");
	}

	const validatedInput = AnalyzeTweetInputSchema.parse(input);
	const tweet = await tweetSource.getTweetByUrlOrId(validatedInput.tweetUrlOrId);
	const analysis = buildAnalysisFromTweetPayload(tweet);
	const createdAt = now?.() ?? Date.now();

	return await storage.insert({
		userId,
		tweetUrlOrId: validatedInput.tweetUrlOrId,
		provider: validatedInput.provider ?? "openai",
		model: validatedInput.model ?? "gpt-4.1",
		topic: analysis.topic,
		summary: analysis.summary,
		intent: analysis.intent,
		novelConcepts: analysis.novelConcepts,
		createdAt,
	});
}
