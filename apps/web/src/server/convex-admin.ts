import {
	AccountTakeawaySnapshotSchema,
	type AccountTakeawaySnapshot,
	type AnalyzeTweetInput,
	type AnalyzeTweetResult,
	type BookmarkSyncMode,
	BookmarkSyncStateSchema,
	BookmarkSyncStatusResponseSchema,
	type CreatorFollow,
	type CreateCreatorFollowInput,
	type CreateSubjectFollowInput,
	type CreateTakeawayFollowInput,
	DeleteFollowResultSchema,
	type DeleteFollowResult,
	DeleteBookmarkResultSchema,
	type DeleteBookmarkResult,
	DeleteTakeawayFollowResultSchema,
	type DeleteTakeawayFollowResult,
	FollowSuggestionsResponseSchema,
	type FollowSuggestionsResponse,
	FollowSummarySchema,
	type FollowSummary,
	FollowingFeedResponseSchema,
	type FollowingFeedResponse,
	ProviderCredentialSummaryListSchema,
	ProviderIdSchema,
	type RefreshTakeawayResult,
	RefreshTakeawayResultSchema,
	type SaveBookmarkInput,
	SavedAnalysisSchema,
	type SavedAnalysis,
	SavedBookmarkSchema,
	type SavedBookmark,
	TakeawayFollowSchema,
	type TakeawayFollow,
	TakeawayHistoryResponseSchema,
	type TakeawayHistoryResponse,
	TakeawayWorkspaceResponseSchema,
	type TakeawayWorkspaceResponse,
	CreatorFollowSchema,
	type SubjectFollow,
	SubjectFollowSchema,
	type ProviderCredentialSummary,
	type ProviderId,
	type Suggestion,
	SuggestionSchema,
	SuggestionActionResponseSchema,
	type SuggestionFeedback,
	SuggestionFeedbackSchema,
	SuggestionsResponseSchema,
	type UpdateBookmarkTagsInput,
	type UserPreferencesInput,
	UserPreferencesInputSchema,
	UserPreferencesResultSchema,
	type UserPreferencesResult,
} from "@tenbrains/contracts";
import type { TweetPayload } from "@tenbrains/x-client";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { buildKeyHint, decryptSecret, encryptSecret } from "./secret-crypto.js";

interface SessionUserIdentity {
	id: string;
	email?: string | null;
	name?: string | null;
}

export interface XAccountCredentialRecord {
	xUserId: string;
	accessToken: string;
	refreshToken?: string;
	tokenType?: string;
	scope?: string;
	expiresAt?: number;
	updatedAt: number;
}

interface ConvexActingIdentity {
	subject: string;
	issuer: string;
	tokenIdentifier: string;
	email?: string;
	name?: string;
}

interface ConvexHttpClientWithAdminAuth extends ConvexHttpClient {
	setAdminAuth(token: string, actingAsIdentity?: ConvexActingIdentity): void;
}

interface ConvexEnv {
	[key: string]: string | undefined;
	NEXT_PUBLIC_CONVEX_URL?: string;
	CONVEX_DEPLOY_KEY?: string;
}

export type EmbeddingSourceType = "bookmark" | "analysis" | "takeaway";

export interface StoredEmbedding {
	_id: string;
	userId: string;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
	createdAt: number;
	updatedAt: number;
}

export interface ScoredEmbeddingRecord extends StoredEmbedding {
	_score: number;
}

const upsertCurrentUserRef = makeFunctionReference<
	"mutation",
	{ email?: string; name?: string },
	string
>("users:upsertCurrentUser");

const createFromComputedRef = makeFunctionReference<
	"mutation",
	{
		tweetUrlOrId: string;
		provider: ProviderId;
		model?: string;
		thread?: SavedAnalysis["thread"];
		topic: string;
		summary: string;
		intent: string;
		novelConcepts: AnalyzeTweetResult["novelConcepts"];
	},
	SavedAnalysis
>("analysis:createFromComputed");

const getPreferencesRef = makeFunctionReference<"query", Record<string, never>, UserPreferencesResult>(
	"preferences:getPreferences",
);
const updatePreferencesRef = makeFunctionReference<"mutation", UserPreferencesInput, UserPreferencesResult>(
	"preferences:updatePreferences",
);
const listProviderCredentialsRef = makeFunctionReference<"query", Record<string, never>, ProviderCredentialSummary[]>(
	"provider_credentials:listByUser",
);
const getProviderCredentialRef = makeFunctionReference<
	"query",
	{ provider: ProviderId },
	{ provider: ProviderId; encryptedApiKey: string; keyHint?: string; updatedAt: number } | null
>("provider_credentials:getByProvider");
const upsertProviderCredentialRef = makeFunctionReference<
	"mutation",
	{ provider: ProviderId; encryptedApiKey: string; keyHint?: string },
	ProviderCredentialSummary
>("provider_credentials:upsert");
const removeProviderCredentialRef = makeFunctionReference<"mutation", { provider: ProviderId }, { provider: ProviderId }>(
	"provider_credentials:remove",
);

const saveBookmarkRef = makeFunctionReference<"mutation", SaveBookmarkInput, SavedBookmark>("bookmarks:save");
const updateBookmarkTagsRef = makeFunctionReference<"mutation", UpdateBookmarkTagsInput, SavedBookmark>(
	"bookmarks:updateTags",
);
const deleteBookmarkRef = makeFunctionReference<"mutation", { bookmarkId: string }, DeleteBookmarkResult>("bookmarks:remove");

const listBookmarksByUserRef = makeFunctionReference<"query", Record<string, never>, SavedBookmark[]>(
	"bookmarks:listByUser",
);
const upsertEmbeddingRef = makeFunctionReference<
	"mutation",
	{
		sourceType: EmbeddingSourceType;
		sourceId: string;
		text: string;
		contentHash: string;
		model: string;
		embedding: number[];
	},
	StoredEmbedding
>("embeddings:upsertEmbedding");
const deleteEmbeddingsForSourceRef = makeFunctionReference<
	"mutation",
	{ sourceType: EmbeddingSourceType; sourceId: string },
	{ deletedCount: number }
>("embeddings:deleteEmbeddingsForSource");
const searchSimilarEmbeddingsRef = makeFunctionReference<
	"action",
	{ vector: number[]; limit?: number; sourceTypes?: EmbeddingSourceType[] },
	ScoredEmbeddingRecord[]
>("embeddings:searchSimilar");
const listFollowsRef = makeFunctionReference<"query", Record<string, never>, FollowSummary>("follows:listSummary");
const upsertCreatorFollowRef = makeFunctionReference<
	"mutation",
	Omit<CreateCreatorFollowInput, "kind">,
	CreatorFollow
>("follows:upsertCreatorFollow");
const removeCreatorFollowRef = makeFunctionReference<"mutation", { followId: string }, DeleteFollowResult>(
	"follows:removeCreatorFollow",
);
const upsertSubjectFollowRef = makeFunctionReference<
	"mutation",
	Omit<CreateSubjectFollowInput, "kind">,
	SubjectFollow
>("follows:upsertSubjectFollow");
const removeSubjectFollowRef = makeFunctionReference<"mutation", { followId: string }, DeleteFollowResult>(
	"follows:removeSubjectFollow",
);
const listFollowSuggestionsRef = makeFunctionReference<"query", { subjectTag: string }, FollowSuggestionsResponse>(
	"follows:listSuggestionsForSubject",
);
const listFollowingFeedRef = makeFunctionReference<"query", Record<string, never>, FollowingFeedResponse>(
	"follows:listFollowingFeed",
);
const listTakeawayWorkspaceRef = makeFunctionReference<"query", Record<string, never>, TakeawayWorkspaceResponse>(
	"takeaways:listWorkspace",
);
const getTakeawayFollowByIdRef = makeFunctionReference<"query", { followId: string }, TakeawayFollow>(
	"takeaways:getFollowById",
);
const upsertTakeawayFollowRef = makeFunctionReference<
	"mutation",
	CreateTakeawayFollowInput & {
		accountId?: string;
		accountName?: string;
		accountAvatarUrl?: string;
	},
	TakeawayFollow
>("takeaways:upsertFollow");
const deleteTakeawayFollowRef = makeFunctionReference<"mutation", { followId: string }, DeleteTakeawayFollowResult>(
	"takeaways:removeFollow",
);
const getTakeawayHistoryRef = makeFunctionReference<"query", { followId: string }, TakeawayHistoryResponse>(
	"takeaways:getHistoryForFollow",
);
const markTakeawayRefreshErrorRef = makeFunctionReference<
	"mutation",
	{ followId: string; dateKey: string; refreshedAt: number; errorMessage: string },
	TakeawayFollow
>("takeaways:markRefreshError");
const saveTakeawaySnapshotRef = makeFunctionReference<
	"mutation",
	{
		followId: string;
		accountId?: string;
		accountUsername: string;
		accountName?: string;
		accountAvatarUrl?: string;
		provider: ProviderId;
		model: string;
		summary: string;
		takeaways: string[];
		sampleSize: number;
		snapshotDateKey: string;
		posts: AccountTakeawaySnapshot["posts"];
		createdAt: number;
	},
	AccountTakeawaySnapshot
>("takeaways:saveSnapshotForFollow");
const listDueTakeawayRefreshJobsRef = makeFunctionReference<
	"query",
	{ dateKey: string; limit: number },
	Array<{ userId: string; followId: string; accountUsername: string }>
>("takeaways:listDueRefreshJobs");
const upsertXAccountCredentialForCurrentUserRef = makeFunctionReference<
	"mutation",
	{
		xUserId: string;
		encryptedAccessToken: string;
		encryptedRefreshToken?: string;
		tokenType?: string;
		scope?: string;
		expiresAt?: number;
	},
	{ xUserId: string; updatedAt: number; expiresAt?: number }
>("x_account_credentials:upsertForCurrentUser");
const getXAccountCredentialForCurrentUserRef = makeFunctionReference<
	"query",
	Record<string, never>,
	{
		xUserId: string;
		encryptedAccessToken: string;
		encryptedRefreshToken?: string;
		tokenType?: string;
		scope?: string;
		expiresAt?: number;
		updatedAt: number;
	} | null
>("x_account_credentials:getForCurrentUser");
const getXAccountCredentialByUserIdRef = makeFunctionReference<
	"query",
	{ userId: string },
	{
		xUserId: string;
		encryptedAccessToken: string;
		encryptedRefreshToken?: string;
		tokenType?: string;
		scope?: string;
		expiresAt?: number;
		updatedAt: number;
	} | null
>("x_account_credentials:getByUserId");
const getBookmarkSyncStatusRef = makeFunctionReference<
	"query",
	Record<string, never>,
	{
		state?: {
			userId: string;
			lastSyncedAt?: number;
			lastError?: string;
			importedCount: number;
			cursor?: string;
			mode?: BookmarkSyncMode;
			backfillComplete?: boolean;
			updatedAt: number;
		};
	}
>("bookmark_sync:getStatus");
const upsertBookmarkSyncStatusRef = makeFunctionReference<
	"mutation",
	{
		lastSyncedAt?: number;
		lastError?: string;
		importedCount: number;
		cursor?: string;
		mode?: BookmarkSyncMode;
		backfillComplete?: boolean;
	},
	{
		userId: string;
		lastSyncedAt?: number;
		lastError?: string;
		importedCount: number;
		cursor?: string;
		mode?: BookmarkSyncMode;
		backfillComplete?: boolean;
		updatedAt: number;
	}
>("bookmark_sync:upsertStatusForCurrentUser");
const listDueBookmarkSyncJobsRef = makeFunctionReference<
	"query",
	{ beforeTimestamp: number; limit: number },
	Array<{
		userId: string;
		xUserId: string;
		lastSyncedAt?: number;
		cursor?: string;
		mode?: BookmarkSyncMode;
		backfillComplete?: boolean;
	}>
>("bookmark_sync:listDueSyncJobs");
const listSuggestionsForCurrentUserRef = makeFunctionReference<
	"query",
	Record<string, never>,
	{ suggestions: Suggestion[] }
>("suggestions:listForCurrentUser");
const upsertSuggestionsForCurrentUserRef = makeFunctionReference<
	"mutation",
	{
		suggestions: Array<{
			tweetId: string;
			tweetText: string;
			tweetUrlOrId: string;
			authorUsername: string;
			authorName?: string;
			authorAvatarUrl?: string;
			score: number;
			reasons: Suggestion["reasons"];
			sourceSignals: string[];
			suggestedTags: string[];
		}>;
	},
	{ suggestions: Suggestion[] }
>("suggestions:upsertManyForCurrentUser");
const recordSuggestionFeedbackForCurrentUserRef = makeFunctionReference<
	"mutation",
	{ suggestionId: string; status: "saved" | "dismissed" },
	SuggestionFeedback
>("suggestions:recordFeedbackForCurrentUser");
const listDismissedSuggestionTweetIdsRef = makeFunctionReference<"query", Record<string, never>, string[]>(
	"suggestions:listDismissedTweetIdsForCurrentUser",
);
const getSuggestionByIdForCurrentUserRef = makeFunctionReference<
	"query",
	{ suggestionId: string },
	Suggestion | null
>("suggestions:getSuggestionByIdForCurrentUser");

function readRequiredEnv(name: keyof ConvexEnv, env: ConvexEnv): string {
	const value = env[name];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value.trim();
}

function createActingIdentity(user: SessionUserIdentity): ConvexActingIdentity {
	const issuer = "https://www.tenbrains.app/authjs";
	return {
		subject: user.id,
		issuer,
		tokenIdentifier: `${issuer}|${user.id}`,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
	};
}

function createDeployKeyAdminClient(env: ConvexEnv = process.env): ConvexHttpClient {
	const convexUrl = readRequiredEnv("NEXT_PUBLIC_CONVEX_URL", env);
	const deployKey = readRequiredEnv("CONVEX_DEPLOY_KEY", env);
	const client = new ConvexHttpClient(convexUrl);
	const clientWithAdminAuth = client as ConvexHttpClientWithAdminAuth;
	clientWithAdminAuth.setAdminAuth(deployKey);
	return client;
}

function createAdminClient({ user, env = process.env }: { user: SessionUserIdentity; env?: ConvexEnv }): ConvexHttpClient {
	const convexUrl = readRequiredEnv("NEXT_PUBLIC_CONVEX_URL", env);
	const deployKey = readRequiredEnv("CONVEX_DEPLOY_KEY", env);
	const client = new ConvexHttpClient(convexUrl);
	const clientWithAdminAuth = client as ConvexHttpClientWithAdminAuth;
	clientWithAdminAuth.setAdminAuth(deployKey, createActingIdentity(user));
	return client;
}

async function createAuthedAdminClient({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<{ client: ConvexHttpClient; userId: string }> {
	const userId = sessionUser.id.trim();
	if (!userId) {
		throw new Error("Unauthorized");
	}

	const client = createAdminClient({
		user: {
			...sessionUser,
			id: userId,
		},
		env,
	});

	await client.mutation(upsertCurrentUserRef, {
		email: sessionUser.email ?? undefined,
		name: sessionUser.name ?? undefined,
	});

	return { client, userId };
}

export async function getPreferencesForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<UserPreferencesResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return UserPreferencesResultSchema.parse(await client.query(getPreferencesRef, {}));
}

export async function updatePreferencesForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: UserPreferencesInput;
	env?: ConvexEnv;
}): Promise<UserPreferencesResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	const validated = UserPreferencesInputSchema.parse(input);
	return UserPreferencesResultSchema.parse(await client.mutation(updatePreferencesRef, validated));
}

export async function listProviderCredentialsForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<ProviderCredentialSummary[]> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return ProviderCredentialSummaryListSchema.parse(await client.query(listProviderCredentialsRef, {}));
}

export async function getProviderApiKeyForSession({
	sessionUser,
	provider,
	env,
}: {
	sessionUser: SessionUserIdentity;
	provider: ProviderId;
	env?: ConvexEnv;
}): Promise<string | null> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	const record = await client.query(getProviderCredentialRef, { provider: ProviderIdSchema.parse(provider) });
	if (!record) {
		return null;
	}
	return decryptSecret(record.encryptedApiKey);
}

export async function upsertProviderCredentialForSession({
	sessionUser,
	provider,
	apiKey,
	env,
}: {
	sessionUser: SessionUserIdentity;
	provider: ProviderId;
	apiKey: string;
	env?: ConvexEnv;
}): Promise<ProviderCredentialSummary> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	const validatedProvider = ProviderIdSchema.parse(provider);
	const trimmedApiKey = apiKey.trim();
	if (trimmedApiKey.length === 0) {
		throw new Error("API key is required.");
	}

	return await client.mutation(upsertProviderCredentialRef, {
		provider: validatedProvider,
		encryptedApiKey: encryptSecret(trimmedApiKey),
		keyHint: buildKeyHint(trimmedApiKey),
	});
}

export async function deleteProviderCredentialForSession({
	sessionUser,
	provider,
	env,
}: {
	sessionUser: SessionUserIdentity;
	provider: ProviderId;
	env?: ConvexEnv;
}): Promise<void> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	await client.mutation(removeProviderCredentialRef, {
		provider: ProviderIdSchema.parse(provider),
	});
}

export async function upsertXAccountCredentialForSession({
	sessionUser,
	xUserId,
	accessToken,
	refreshToken,
	tokenType,
	scope,
	expiresAt,
	env,
}: {
	sessionUser: SessionUserIdentity;
	xUserId: string;
	accessToken: string;
	refreshToken?: string;
	tokenType?: string;
	scope?: string;
	expiresAt?: number;
	env?: ConvexEnv;
}): Promise<void> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	await client.mutation(upsertXAccountCredentialForCurrentUserRef, {
		xUserId: xUserId.trim(),
		encryptedAccessToken: encryptSecret(accessToken.trim()),
		encryptedRefreshToken: refreshToken?.trim() ? encryptSecret(refreshToken.trim()) : undefined,
		tokenType: tokenType?.trim(),
		scope: scope?.trim(),
		expiresAt,
	});
}

export async function getXAccountCredentialForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<XAccountCredentialRecord | null> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	const record = await client.query(getXAccountCredentialForCurrentUserRef, {});
	if (!record) {
		return null;
	}
	return {
		xUserId: record.xUserId,
		accessToken: decryptSecret(record.encryptedAccessToken),
		refreshToken: record.encryptedRefreshToken ? decryptSecret(record.encryptedRefreshToken) : undefined,
		tokenType: record.tokenType,
		scope: record.scope,
		expiresAt: record.expiresAt,
		updatedAt: record.updatedAt,
	};
}

export async function getXAccountCredentialByUserId({
	userId,
	env,
}: {
	userId: string;
	env?: ConvexEnv;
}): Promise<XAccountCredentialRecord | null> {
	const client = createDeployKeyAdminClient(env);
	const record = await client.query(getXAccountCredentialByUserIdRef, { userId });
	if (!record) {
		return null;
	}
	return {
		xUserId: record.xUserId,
		accessToken: decryptSecret(record.encryptedAccessToken),
		refreshToken: record.encryptedRefreshToken ? decryptSecret(record.encryptedRefreshToken) : undefined,
		tokenType: record.tokenType,
		scope: record.scope,
		expiresAt: record.expiresAt,
		updatedAt: record.updatedAt,
	};
}

export async function getBookmarkSyncStatusForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return BookmarkSyncStatusResponseSchema.parse(await client.query(getBookmarkSyncStatusRef, {}));
}

export async function upsertBookmarkSyncStatusForSession({
	sessionUser,
	lastSyncedAt,
	lastError,
	importedCount,
	cursor,
	mode,
	backfillComplete,
	env,
}: {
	sessionUser: SessionUserIdentity;
	lastSyncedAt?: number;
	lastError?: string;
	importedCount: number;
	cursor?: string;
	mode?: BookmarkSyncMode;
	backfillComplete?: boolean;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return BookmarkSyncStateSchema.parse(
		await client.mutation(upsertBookmarkSyncStatusRef, {
			lastSyncedAt,
			lastError,
			importedCount,
			cursor,
			mode,
			backfillComplete,
		}),
	);
}

export async function listDueBookmarkSyncJobs({
	beforeTimestamp,
	limit,
	env,
}: {
	beforeTimestamp: number;
	limit: number;
	env?: ConvexEnv;
}) {
	const client = createDeployKeyAdminClient(env);
	return await client.query(listDueBookmarkSyncJobsRef, { beforeTimestamp, limit });
}

export async function listSuggestionsForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return SuggestionsResponseSchema.parse(await client.query(listSuggestionsForCurrentUserRef, {}));
}

export async function upsertSuggestionsForSession({
	sessionUser,
	suggestions,
	env,
}: {
	sessionUser: SessionUserIdentity;
	suggestions: Array<{
		tweetId: string;
		tweetText: string;
		tweetUrlOrId: string;
		authorUsername: string;
		authorName?: string;
		authorAvatarUrl?: string;
		score: number;
		reasons: Suggestion["reasons"];
		sourceSignals: string[];
		suggestedTags: string[];
	}>;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return SuggestionsResponseSchema.parse(await client.mutation(upsertSuggestionsForCurrentUserRef, { suggestions }));
}

export async function recordSuggestionFeedbackForSession({
	sessionUser,
	suggestionId,
	status,
	env,
}: {
	sessionUser: SessionUserIdentity;
	suggestionId: string;
	status: "saved" | "dismissed";
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return SuggestionFeedbackSchema.parse(
		await client.mutation(recordSuggestionFeedbackForCurrentUserRef, { suggestionId, status }),
	);
}

export async function listDismissedSuggestionTweetIdsForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return await client.query(listDismissedSuggestionTweetIdsRef, {});
}

export async function getSuggestionByIdForSession({
	sessionUser,
	suggestionId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	suggestionId: string;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	const suggestion = await client.query(getSuggestionByIdForCurrentUserRef, { suggestionId });
	return suggestion ? SuggestionSchema.parse(suggestion) : null;
}

export async function persistAnalysisForSession({
	sessionUser,
	input,
	analysis,
	thread,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: AnalyzeTweetInput & { provider: ProviderId; model: string };
	analysis: AnalyzeTweetResult;
	thread?: SavedAnalysis["thread"];
	env?: ConvexEnv;
}): Promise<SavedAnalysis> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	const saved = await client.mutation(createFromComputedRef, {
		tweetUrlOrId: input.tweetUrlOrId,
		provider: input.provider,
		model: input.model,
		thread,
		topic: analysis.topic,
		summary: analysis.summary,
		intent: analysis.intent,
		novelConcepts: analysis.novelConcepts,
	});

	return SavedAnalysisSchema.parse(saved);
}

export async function saveBookmarkForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: SaveBookmarkInput;
	env?: ConvexEnv;
}): Promise<SavedBookmark> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	const saved = await client.mutation(saveBookmarkRef, input);
	return SavedBookmarkSchema.parse(saved);
}

export async function listBookmarksForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<SavedBookmark[]> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	const bookmarks = await client.query(listBookmarksByUserRef, {});
	return bookmarks.map((bookmark) => SavedBookmarkSchema.parse(bookmark));
}

export async function updateBookmarkTagsForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: UpdateBookmarkTagsInput;
	env?: ConvexEnv;
}): Promise<SavedBookmark> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	const updated = await client.mutation(updateBookmarkTagsRef, input);
	return SavedBookmarkSchema.parse(updated);
}

export async function deleteBookmarkForSession({
	sessionUser,
	bookmarkId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	bookmarkId: string;
	env?: ConvexEnv;
}): Promise<DeleteBookmarkResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	const deleted = await client.mutation(deleteBookmarkRef, {
		bookmarkId,
	});
	return DeleteBookmarkResultSchema.parse(deleted);
}

export async function upsertEmbeddingForSession({
	sessionUser,
	sourceType,
	sourceId,
	text,
	contentHash,
	model,
	embedding,
	env,
}: {
	sessionUser: SessionUserIdentity;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	text: string;
	contentHash: string;
	model: string;
	embedding: number[];
	env?: ConvexEnv;
}): Promise<StoredEmbedding> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return await client.mutation(upsertEmbeddingRef, {
		sourceType,
		sourceId,
		text,
		contentHash,
		model,
		embedding,
	});
}

export async function deleteEmbeddingsForSourceForSession({
	sessionUser,
	sourceType,
	sourceId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	sourceType: EmbeddingSourceType;
	sourceId: string;
	env?: ConvexEnv;
}): Promise<{ deletedCount: number }> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return await client.mutation(deleteEmbeddingsForSourceRef, {
		sourceType,
		sourceId,
	});
}

export async function searchSimilarEmbeddingsForSession({
	sessionUser,
	vector,
	limit,
	sourceTypes,
	env,
}: {
	sessionUser: SessionUserIdentity;
	vector: number[];
	limit?: number;
	sourceTypes?: EmbeddingSourceType[];
	env?: ConvexEnv;
}): Promise<ScoredEmbeddingRecord[]> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return await client.action(searchSimilarEmbeddingsRef, {
		vector,
		limit,
		sourceTypes,
	});
}

export async function listFollowsForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<FollowSummary> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });

	return FollowSummarySchema.parse(await client.query(listFollowsRef, {}));
}

export async function createCreatorFollowForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: Omit<CreateCreatorFollowInput, "kind">;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return CreatorFollowSchema.parse(await client.mutation(upsertCreatorFollowRef, input));
}

export async function deleteCreatorFollowForSession({
	sessionUser,
	followId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	env?: ConvexEnv;
}): Promise<DeleteFollowResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return DeleteFollowResultSchema.parse(await client.mutation(removeCreatorFollowRef, { followId }));
}

export async function createSubjectFollowForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: Omit<CreateSubjectFollowInput, "kind">;
	env?: ConvexEnv;
}) {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return SubjectFollowSchema.parse(await client.mutation(upsertSubjectFollowRef, input));
}

export async function deleteSubjectFollowForSession({
	sessionUser,
	followId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	env?: ConvexEnv;
}): Promise<DeleteFollowResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return DeleteFollowResultSchema.parse(await client.mutation(removeSubjectFollowRef, { followId }));
}

export async function listFollowSuggestionsForSession({
	sessionUser,
	subjectTag,
	env,
}: {
	sessionUser: SessionUserIdentity;
	subjectTag: string;
	env?: ConvexEnv;
}): Promise<FollowSuggestionsResponse> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return FollowSuggestionsResponseSchema.parse(await client.query(listFollowSuggestionsRef, { subjectTag }));
}

export async function listFollowingFeedForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<FollowingFeedResponse> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return FollowingFeedResponseSchema.parse(await client.query(listFollowingFeedRef, {}));
}

export async function listTakeawayWorkspaceForSession({
	sessionUser,
	env,
}: {
	sessionUser: SessionUserIdentity;
	env?: ConvexEnv;
}): Promise<TakeawayWorkspaceResponse> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return TakeawayWorkspaceResponseSchema.parse(await client.query(listTakeawayWorkspaceRef, {}));
}

export async function getTakeawayFollowByIdForSession({
	sessionUser,
	followId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	env?: ConvexEnv;
}): Promise<TakeawayFollow> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return TakeawayFollowSchema.parse(await client.query(getTakeawayFollowByIdRef, { followId }));
}

export async function createTakeawayFollowForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: CreateTakeawayFollowInput & {
		accountId?: string;
		accountName?: string;
		accountAvatarUrl?: string;
	};
	env?: ConvexEnv;
}): Promise<TakeawayFollow> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return TakeawayFollowSchema.parse(await client.mutation(upsertTakeawayFollowRef, input));
}

export async function deleteTakeawayFollowForSession({
	sessionUser,
	followId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	env?: ConvexEnv;
}): Promise<DeleteTakeawayFollowResult> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return DeleteTakeawayFollowResultSchema.parse(await client.mutation(deleteTakeawayFollowRef, { followId }));
}

export async function getTakeawayHistoryForSession({
	sessionUser,
	followId,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	env?: ConvexEnv;
}): Promise<TakeawayHistoryResponse> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return TakeawayHistoryResponseSchema.parse(await client.query(getTakeawayHistoryRef, { followId }));
}

export async function markTakeawayRefreshErrorForSession({
	sessionUser,
	followId,
	dateKey,
	refreshedAt,
	errorMessage,
	env,
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	dateKey: string;
	refreshedAt: number;
	errorMessage: string;
	env?: ConvexEnv;
}): Promise<TakeawayFollow> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return TakeawayFollowSchema.parse(
		await client.mutation(markTakeawayRefreshErrorRef, {
			followId,
			dateKey,
			refreshedAt,
			errorMessage,
		}),
	);
}

export async function persistTakeawaySnapshotForSession({
	sessionUser,
	input,
	env,
}: {
	sessionUser: SessionUserIdentity;
	input: {
		followId: string;
		accountId?: string;
		accountUsername: string;
		accountName?: string;
		accountAvatarUrl?: string;
		provider: ProviderId;
		model: string;
		summary: string;
		takeaways: string[];
		sampleSize: number;
		snapshotDateKey: string;
		posts: AccountTakeawaySnapshot["posts"];
		createdAt: number;
	};
	env?: ConvexEnv;
}): Promise<AccountTakeawaySnapshot> {
	const { client } = await createAuthedAdminClient({ sessionUser, env });
	return AccountTakeawaySnapshotSchema.parse(await client.mutation(saveTakeawaySnapshotRef, input));
}

export async function listDueTakeawayRefreshJobs({
	dateKey,
	limit,
	env,
}: {
	dateKey: string;
	limit: number;
	env?: ConvexEnv;
}): Promise<Array<{ userId: string; followId: string; accountUsername: string }>> {
	const client = createDeployKeyAdminClient(env);
	return await client.query(listDueTakeawayRefreshJobsRef, { dateKey, limit });
}
