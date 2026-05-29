import {
	CreateLearningTrackInputSchema,
	CreateLearningTrackResultSchema,
	type CreateLearningTrackInput,
	type CreateLearningTrackResult,
	type SavedAnalysis,
} from "@tenbrains/contracts";
import { buildFeynmanTrack, prioritizeConcepts } from "tenbrains";

export interface TrackStorage {
	insert(record: Omit<CreateLearningTrackResult, "id">): Promise<CreateLearningTrackResult>;
	listByUser(userId: string): Promise<CreateLearningTrackResult[]>;
}

export interface InMemoryTrackStorage extends TrackStorage {
	readonly records: CreateLearningTrackResult[];
}

export function createInMemoryTrackStorage(): InMemoryTrackStorage {
	const records: CreateLearningTrackResult[] = [];
	let sequence = 1;
	return {
		records,
		async insert(record) {
			const persisted = CreateLearningTrackResultSchema.parse({
				id: `track_${sequence}`,
				...record,
			});
			sequence += 1;
			records.push(persisted);
			return persisted;
		},
		async listByUser(userId) {
			return records.filter((item) => item.userId === userId).sort((left, right) => right.createdAt - left.createdAt);
		},
	};
}

export async function createTrackFromSavedAnalysis({
	input,
	userId,
	analysis,
	storage,
	now,
}: {
	input: CreateLearningTrackInput;
	userId: string;
	analysis: SavedAnalysis;
	storage: TrackStorage;
	now?: () => number;
}): Promise<CreateLearningTrackResult> {
	if (!userId.trim()) {
		throw new Error("Unauthorized");
	}

	const validatedInput = CreateLearningTrackInputSchema.parse(input);
	if (analysis.id !== validatedInput.analysisId) {
		throw new Error("Analysis ID mismatch");
	}
	if (analysis.userId !== userId) {
		throw new Error("Analysis does not belong to user");
	}

	const ratings = analysis.novelConcepts.map((concept) => ({
		concept,
		familiarity: 1,
		interest: 5,
	}));
	const prioritized = prioritizeConcepts(ratings);
	const track = buildFeynmanTrack(prioritized);
	const createdAt = now?.() ?? Date.now();

	return await storage.insert({
		userId,
		analysisId: analysis.id,
		minutesPerDay: track.minutesPerDay,
		days: track.days,
		createdAt,
	});
}
