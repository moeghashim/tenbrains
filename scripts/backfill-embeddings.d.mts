export type BackfillSourceType = "bookmark" | "analysis" | "takeaway";
export type BackfillSourceFilter = BackfillSourceType | "all";

export interface BackfillOptions {
	dryRun?: boolean;
	source?: BackfillSourceFilter;
	userId?: string | null;
	limit?: number | null;
	batchSize?: number;
}

export interface BackfillUser {
	_id: string;
	xUserId: string | null;
}

export interface BackfillBookmark {
	_id: string;
	tweetId: string;
	tweetText: string;
}

export interface BackfillAnalysis {
	_id: string;
	topic: string;
	summary: string;
	intent: string;
	novelConcepts: Array<{
		name: string;
		whyItMattersInTweet: string;
	}>;
}

export interface BackfillTakeawaySnapshot {
	_id: string;
	summary: string;
	takeaways: string[];
}

export interface BackfillPage<T> {
	items: T[];
	nextCursor: string | null;
}

export interface BackfillEmbeddingInput {
	userId: string;
	sourceType: BackfillSourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
}

export interface BackfillDeps {
	listBackfillUsers(input: { cursor: string | null; limit: number }): Promise<BackfillPage<BackfillUser>>;
	getEncryptedOpenAiCredentialForUser(input: {
		userId: string;
	}): Promise<{ encryptedApiKey: string; updatedAt: number } | null>;
	listBackfillBookmarksForUser(input: {
		userId: string;
		cursor: string | null;
		limit: number;
	}): Promise<BackfillPage<BackfillBookmark>>;
	listBackfillAnalysesForUser(input: {
		userId: string;
		cursor: string | null;
		limit: number;
	}): Promise<BackfillPage<BackfillAnalysis>>;
	listBackfillTakeawaySnapshotsForUser(input: {
		userId: string;
		cursor: string | null;
		limit: number;
	}): Promise<BackfillPage<BackfillTakeawaySnapshot>>;
	getExistingEmbeddingContentHash(input: {
		userId: string;
		sourceType: BackfillSourceType;
		sourceId: string;
	}): Promise<string | null>;
	upsertEmbedding(input: BackfillEmbeddingInput): Promise<unknown>;
	embedTexts(input: {
		texts: string[];
		apiKey: string;
	}): Promise<{ model: string; dimensions: number; vectors: number[][] }>;
	decryptSecret(payload: string, env?: Record<string, string | undefined>): string;
	sleep(delayMs: number): Promise<void>;
	log(message: string): void;
	now(): number;
}

export interface BackfillFailedRow {
	userId: string;
	sourceType: BackfillSourceType;
	sourceId: string;
	error: string;
}

export interface BackfillSummary {
	dryRun: boolean;
	source: BackfillSourceFilter;
	batchSize: number;
	limit: number | null;
	usersProcessed: number;
	usersSkipped: number;
	bookmarksConsidered: number;
	bookmarksPlanned: number;
	bookmarksEmbedded: number;
	bookmarksSkipped: number;
	bookmarksFailed: number;
	analysesConsidered: number;
	analysesPlanned: number;
	analysesEmbedded: number;
	analysesSkipped: number;
	analysesFailed: number;
	takeawaySnapshotsConsidered: number;
	takeawaySnapshotsPlanned: number;
	takeawaySnapshotsEmbedded: number;
	takeawaySnapshotsSkipped: number;
	takeawaySnapshotsFailed: number;
	approxTokensPlanned: number;
	approxTokensUsed: number;
	retryCount: number;
	elapsedSeconds: number;
	failedRows: BackfillFailedRow[];
}

export function parseBackfillArgs(argv: string[]): BackfillOptions;

export function runBackfill(input: {
	options?: BackfillOptions;
	deps: BackfillDeps;
	env?: Record<string, string | undefined>;
}): Promise<BackfillSummary>;

export function createConvexBackfillClient(input?: {
	env?: Record<string, string | undefined>;
}): unknown;

export function createConvexBackfillDeps(input?: {
	client: unknown;
	env?: Record<string, string | undefined>;
	log?: (message: string) => void;
}): BackfillDeps;

export function printBackfillSummary(
	summary: BackfillSummary,
	output?: {
		log?: (message: string) => void;
		error?: (message: string) => void;
	},
): void;

export function main(input?: {
	argv?: string[];
	env?: Record<string, string | undefined>;
}): Promise<BackfillSummary>;
