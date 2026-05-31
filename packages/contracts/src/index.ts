import { z } from "zod";

import { validateBookmarkTags } from "./bookmark-tags.js";

export * from "./analyze-markdown.js";
export * from "./search.js";

export interface ServiceHealth {
	service: string;
	ok: boolean;
}

export const ProviderIdSchema = z.enum(["openai", "google", "xai", "anthropic"]);

export const UserPreferencesInputSchema = z.object({
	defaultProvider: ProviderIdSchema,
	defaultModel: z.string().min(1, "defaultModel is required"),
	learningMinutes: z.number().int().min(5).max(120),
});

export const UserPreferencesResultSchema = UserPreferencesInputSchema.extend({
	userId: z.string().min(1, "userId is required"),
	updatedAt: z.number().int().nonnegative(),
});

export type UserPreferencesInput = z.infer<typeof UserPreferencesInputSchema>;
export type UserPreferencesResult = z.infer<typeof UserPreferencesResultSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const AnalyzeTweetInputSchema = z.object({
	tweetUrlOrId: z.string().min(1, "tweetUrlOrId is required"),
	provider: ProviderIdSchema.optional(),
	model: z.string().min(1).optional(),
});

export const AnalyzeConceptSchema = z.object({
	name: z.string().min(1),
	whyItMattersInTweet: z.string().min(1),
});

export const AnalyzeTweetResultSchema = z.object({
	topic: z.string().min(1),
	summary: z.string().min(1),
	intent: z.string().min(1),
	novelConcepts: z.array(AnalyzeConceptSchema).length(5),
});

export const AccountTakeawayAnalysisSchema = z.object({
	summary: z.string().min(1),
	takeaways: z.array(z.string().min(1)).min(1).max(5),
});

export const TweetMediaSchema = z.object({
	mediaKey: z.string().min(1),
	type: z.enum(["photo", "video", "animated_gif"]),
	url: z.string().url().optional(),
	previewImageUrl: z.string().url().optional(),
	altText: z.string().min(1).optional(),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
});

export const TweetPublicMetricsSchema = z.object({
	replyCount: z.number().int().nonnegative().optional(),
	repostCount: z.number().int().nonnegative().optional(),
	likeCount: z.number().int().nonnegative().optional(),
	quoteCount: z.number().int().nonnegative().optional(),
	bookmarkCount: z.number().int().nonnegative().optional(),
	impressionCount: z.number().int().nonnegative().optional(),
});

export const TweetPreviewSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	authorId: z.string().min(1).optional(),
	authorUsername: z.string().min(1).optional(),
	authorName: z.string().min(1).optional(),
	authorAvatarUrl: z.string().url().optional(),
	createdAt: z.string().min(1).optional(),
	conversationId: z.string().min(1).optional(),
	inReplyToTweetId: z.string().min(1).optional(),
	media: z.array(TweetMediaSchema).optional(),
	publicMetrics: TweetPublicMetricsSchema.optional(),
});

export const ThreadPreviewSchema = z.object({
	rootTweetId: z.string().min(1),
	tweets: z.array(TweetPreviewSchema).min(1),
});

export const AnalyzeTweetResponseSchema = z.object({
	tweet: TweetPreviewSchema,
	thread: ThreadPreviewSchema.optional(),
	analysis: AnalyzeTweetResultSchema,
});

export const ExtensionSessionUserSchema = z.object({
	id: z.string().min(1),
	xUsername: z.string().min(1).optional(),
	name: z.string().min(1).nullable().optional(),
});

export const ExtensionSessionStatusSchema = z
	.object({
		authenticated: z.boolean(),
		user: ExtensionSessionUserSchema.optional(),
	})
	.refine((value) => !value.authenticated || value.user !== undefined, {
		message: "Authenticated extension sessions must include a user.",
		path: ["user"],
	});

export const SavedAnalysisSchema = AnalyzeTweetResultSchema.extend({
	id: z.string().min(1),
	userId: z.string().min(1),
	tweetUrlOrId: z.string().min(1),
	provider: ProviderIdSchema,
	model: z.string().min(1),
	thread: ThreadPreviewSchema.optional(),
	createdAt: z.number().int().nonnegative(),
});

export const TakeawayRefreshStatusSchema = z.enum(["idle", "success", "error"]);

export const TakeawayFollowSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	accountId: z.string().min(1).optional(),
	accountUsername: z.string().min(1),
	accountName: z.string().min(1).optional(),
	accountAvatarUrl: z.string().url().optional(),
	lastRefreshDateKey: z.string().min(1).optional(),
	lastRefreshedAt: z.number().int().nonnegative().optional(),
	lastRefreshStatus: TakeawayRefreshStatusSchema,
	lastRefreshError: z.string().min(1).optional(),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const CreateTakeawayFollowInputSchema = z.object({
	accountUsername: z.string().min(1, "accountUsername is required"),
});

export const DeleteTakeawayFollowInputSchema = z.object({
	followId: z.string().min(1, "followId is required"),
});

export const DeleteTakeawayFollowResultSchema = z.object({
	followId: z.string().min(1),
});

export const TakeawayWorkspaceResponseSchema = z.object({
	follows: z.array(TakeawayFollowSchema),
});

export const AccountTakeawayPostSchema = TweetPreviewSchema;

export const AccountTakeawaySnapshotSchema = AccountTakeawayAnalysisSchema.extend({
	id: z.string().min(1),
	userId: z.string().min(1),
	followId: z.string().min(1),
	accountId: z.string().min(1).optional(),
	accountUsername: z.string().min(1),
	accountName: z.string().min(1).optional(),
	accountAvatarUrl: z.string().url().optional(),
	provider: ProviderIdSchema,
	model: z.string().min(1),
	sampleSize: z.number().int().nonnegative(),
	snapshotDateKey: z.string().min(1),
	posts: z.array(AccountTakeawayPostSchema).max(20),
	createdAt: z.number().int().nonnegative(),
});

export const TakeawayHistoryResponseSchema = z.object({
	latest: AccountTakeawaySnapshotSchema.optional(),
	history: z.array(AccountTakeawaySnapshotSchema),
});

export const RefreshTakeawayInputSchema = z.object({
	followId: z.string().min(1, "followId is required"),
});

export const RefreshTakeawayResultSchema = z.object({
	snapshot: AccountTakeawaySnapshotSchema,
	deduped: z.boolean(),
});

export const ProviderCredentialSummarySchema = z.object({
	provider: ProviderIdSchema,
	configured: z.boolean(),
	keyHint: z.string().min(1).optional(),
	updatedAt: z.number().int().nonnegative().nullable().optional(),
});

export const ProviderCredentialSummaryListSchema = z.array(ProviderCredentialSummarySchema);

export const ProviderCredentialInputSchema = z.object({
	provider: ProviderIdSchema,
	apiKey: z.string().min(1, "apiKey is required"),
});

export const BookmarkTagSchema = z.string().min(1).max(24);

const BookmarkTagsSchema = z.array(BookmarkTagSchema).superRefine((tags, context) => {
	const validationError = validateBookmarkTags(tags);
	if (!validationError) {
		return;
	}

	context.addIssue({
		code: z.ZodIssueCode.custom,
		message: validationError,
	});
});

export const BookmarkedTweetSchema = z.object({
	tweetId: z.string().min(1),
	tweetText: z.string().min(1),
	tweetUrlOrId: z.string().min(1),
	authorUsername: z.string().min(1),
	authorName: z.string().min(1).optional(),
	authorAvatarUrl: z.string().url().optional(),
	thread: ThreadPreviewSchema.optional(),
});

export const BookmarkSourceSchema = z.enum(["manual", "x_sync", "suggestion"]);

export const SaveBookmarkInputSchema = BookmarkedTweetSchema.extend({
	tags: BookmarkTagsSchema,
	source: BookmarkSourceSchema.optional(),
	importedAt: z.number().int().nonnegative().optional(),
	systemSuggestedTags: BookmarkTagsSchema.optional(),
});

export const UpdateBookmarkTagsInputSchema = z.object({
	bookmarkId: z.string().min(1),
	tags: BookmarkTagsSchema,
});

export const DeleteBookmarkInputSchema = z.object({
	bookmarkId: z.string().min(1),
});

export const DeleteBookmarkResultSchema = z.object({
	bookmarkId: z.string().min(1),
});

export const SavedBookmarkSchema = SaveBookmarkInputSchema.extend({
	id: z.string().min(1),
	userId: z.string().min(1),
	source: BookmarkSourceSchema.optional(),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const BookmarkSyncModeSchema = z.enum(["initial_backfill", "incremental"]);

export const BookmarkSyncStateSchema = z.object({
	userId: z.string().min(1),
	lastSyncedAt: z.number().int().nonnegative().optional(),
	lastError: z.string().min(1).optional(),
	importedCount: z.number().int().nonnegative(),
	cursor: z.string().min(1).optional(),
	mode: BookmarkSyncModeSchema.optional(),
	backfillComplete: z.boolean().optional(),
	updatedAt: z.number().int().nonnegative(),
});

export const BookmarkSyncStatusResponseSchema = z.object({
	state: BookmarkSyncStateSchema.optional(),
});

export const SuggestionReasonSchema = z.object({
	code: z.enum(["followed_creator", "subject_search", "bookmark_affinity", "takeaway_theme"]),
	label: z.string().min(1),
});

export const SuggestionSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	tweetId: z.string().min(1),
	tweetText: z.string().min(1),
	tweetUrlOrId: z.string().min(1),
	authorUsername: z.string().min(1),
	authorName: z.string().min(1).optional(),
	authorAvatarUrl: z.string().url().optional(),
	score: z.number(),
	reasons: z.array(SuggestionReasonSchema).min(1),
	sourceSignals: z.array(z.string().min(1)).min(1),
	suggestedTags: BookmarkTagsSchema,
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const SuggestionFeedbackStatusSchema = z.enum(["saved", "dismissed"]);

export const SuggestionFeedbackSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	suggestionId: z.string().min(1),
	status: SuggestionFeedbackStatusSchema,
	createdAt: z.number().int().nonnegative(),
});

export const SuggestionsResponseSchema = z.object({
	suggestions: z.array(SuggestionSchema),
});

export const SaveSuggestionInputSchema = z.object({
	suggestionId: z.string().min(1, "suggestionId is required"),
});

export const DismissSuggestionInputSchema = z.object({
	suggestionId: z.string().min(1, "suggestionId is required"),
});

export const SuggestionActionResponseSchema = z.object({
	suggestion: SuggestionSchema.optional(),
	suggestions: z.array(SuggestionSchema),
});

export const FollowScopeSchema = z.enum(["subject", "all_feed"]);

export const CreateCreatorFollowInputSchema = z
	.object({
		kind: z.literal("creator"),
		creatorUsername: z.string().min(1),
		creatorName: z.string().min(1).optional(),
		creatorAvatarUrl: z.string().url().optional(),
		scope: FollowScopeSchema,
		subjectTag: BookmarkTagSchema.optional(),
	})
	.superRefine((input, context) => {
		if (input.scope === "subject" && !input.subjectTag) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "subjectTag is required when scope is subject.",
				path: ["subjectTag"],
			});
		}
		if (input.scope === "all_feed" && input.subjectTag) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "subjectTag must be omitted when scope is all_feed.",
				path: ["subjectTag"],
			});
		}
	});

export const CreateSubjectFollowInputSchema = z.object({
	kind: z.literal("subject"),
	subjectTag: BookmarkTagSchema,
});

export const CreateFollowInputSchema = z.discriminatedUnion("kind", [
	CreateCreatorFollowInputSchema,
	CreateSubjectFollowInputSchema,
]);

export const DeleteCreatorFollowInputSchema = z.object({
	kind: z.literal("creator"),
	followId: z.string().min(1),
});

export const DeleteSubjectFollowInputSchema = z.object({
	kind: z.literal("subject"),
	followId: z.string().min(1),
});

export const DeleteFollowInputSchema = z.discriminatedUnion("kind", [
	DeleteCreatorFollowInputSchema,
	DeleteSubjectFollowInputSchema,
]);

export const DeleteFollowResultSchema = z.object({
	followId: z.string().min(1),
});

export const CreatorFollowSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	creatorUsername: z.string().min(1),
	creatorName: z.string().min(1).optional(),
	creatorAvatarUrl: z.string().url().optional(),
	scope: FollowScopeSchema,
	subjectTag: BookmarkTagSchema.optional(),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const SubjectFollowSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	subjectTag: BookmarkTagSchema,
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const FollowSummarySchema = z.object({
	creatorFollows: z.array(CreatorFollowSchema),
	subjectFollows: z.array(SubjectFollowSchema),
});

export const SuggestedCreatorSchema = z.object({
	creatorUsername: z.string().min(1),
	creatorName: z.string().min(1).optional(),
	creatorAvatarUrl: z.string().url().optional(),
	subjectTag: BookmarkTagSchema,
	bookmarkCount: z.number().int().positive(),
	latestBookmarkAt: z.number().int().nonnegative(),
});

export const FollowSuggestionsResponseSchema = z.object({
	subjectTag: BookmarkTagSchema,
	suggestions: z.array(SuggestedCreatorSchema),
});

export const FollowMatchSchema = z.object({
	type: z.enum(["creator_all_feed", "creator_subject", "subject"]),
	creatorUsername: z.string().min(1).optional(),
	subjectTag: BookmarkTagSchema.optional(),
});

export const FollowingFeedItemSchema = SavedBookmarkSchema.extend({
	matches: z.array(FollowMatchSchema).min(1),
});

export const FollowingFeedResponseSchema = z.object({
	bookmarks: z.array(FollowingFeedItemSchema),
});

export type AnalyzeTweetInput = z.infer<typeof AnalyzeTweetInputSchema>;
export type AnalyzeTweetResult = z.infer<typeof AnalyzeTweetResultSchema>;
export type AccountTakeawayAnalysis = z.infer<typeof AccountTakeawayAnalysisSchema>;
export type TweetMedia = z.infer<typeof TweetMediaSchema>;
export type TweetPublicMetrics = z.infer<typeof TweetPublicMetricsSchema>;
export type TweetPreview = z.infer<typeof TweetPreviewSchema>;
export type ThreadPreview = z.infer<typeof ThreadPreviewSchema>;
export type AnalyzeTweetResponse = z.infer<typeof AnalyzeTweetResponseSchema>;
export type ExtensionSessionUser = z.infer<typeof ExtensionSessionUserSchema>;
export type ExtensionSessionStatus = z.infer<typeof ExtensionSessionStatusSchema>;
export type SavedAnalysis = z.infer<typeof SavedAnalysisSchema>;
export type TakeawayRefreshStatus = z.infer<typeof TakeawayRefreshStatusSchema>;
export type TakeawayFollow = z.infer<typeof TakeawayFollowSchema>;
export type CreateTakeawayFollowInput = z.infer<typeof CreateTakeawayFollowInputSchema>;
export type DeleteTakeawayFollowInput = z.infer<typeof DeleteTakeawayFollowInputSchema>;
export type DeleteTakeawayFollowResult = z.infer<typeof DeleteTakeawayFollowResultSchema>;
export type TakeawayWorkspaceResponse = z.infer<typeof TakeawayWorkspaceResponseSchema>;
export type AccountTakeawayPost = z.infer<typeof AccountTakeawayPostSchema>;
export type AccountTakeawaySnapshot = z.infer<typeof AccountTakeawaySnapshotSchema>;
export type TakeawayHistoryResponse = z.infer<typeof TakeawayHistoryResponseSchema>;
export type RefreshTakeawayInput = z.infer<typeof RefreshTakeawayInputSchema>;
export type RefreshTakeawayResult = z.infer<typeof RefreshTakeawayResultSchema>;
export type ProviderCredentialSummary = z.infer<typeof ProviderCredentialSummarySchema>;
export type ProviderCredentialInput = z.infer<typeof ProviderCredentialInputSchema>;
export type SaveBookmarkInput = z.infer<typeof SaveBookmarkInputSchema>;
export type SavedBookmark = z.infer<typeof SavedBookmarkSchema>;
export type BookmarkSyncMode = z.infer<typeof BookmarkSyncModeSchema>;
export type BookmarkSyncState = z.infer<typeof BookmarkSyncStateSchema>;
export type BookmarkSyncStatusResponse = z.infer<typeof BookmarkSyncStatusResponseSchema>;
export type SuggestionReason = z.infer<typeof SuggestionReasonSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type SuggestionFeedbackStatus = z.infer<typeof SuggestionFeedbackStatusSchema>;
export type SuggestionFeedback = z.infer<typeof SuggestionFeedbackSchema>;
export type SuggestionsResponse = z.infer<typeof SuggestionsResponseSchema>;
export type SaveSuggestionInput = z.infer<typeof SaveSuggestionInputSchema>;
export type DismissSuggestionInput = z.infer<typeof DismissSuggestionInputSchema>;
export type SuggestionActionResponse = z.infer<typeof SuggestionActionResponseSchema>;
export type FollowScope = z.infer<typeof FollowScopeSchema>;
export type CreateCreatorFollowInput = z.infer<typeof CreateCreatorFollowInputSchema>;
export type CreateSubjectFollowInput = z.infer<typeof CreateSubjectFollowInputSchema>;
export type CreateFollowInput = z.infer<typeof CreateFollowInputSchema>;
export type DeleteCreatorFollowInput = z.infer<typeof DeleteCreatorFollowInputSchema>;
export type DeleteSubjectFollowInput = z.infer<typeof DeleteSubjectFollowInputSchema>;
export type DeleteFollowInput = z.infer<typeof DeleteFollowInputSchema>;
export type DeleteFollowResult = z.infer<typeof DeleteFollowResultSchema>;
export type CreatorFollow = z.infer<typeof CreatorFollowSchema>;
export type SubjectFollow = z.infer<typeof SubjectFollowSchema>;
export type FollowSummary = z.infer<typeof FollowSummarySchema>;
export type SuggestedCreator = z.infer<typeof SuggestedCreatorSchema>;
export type FollowSuggestionsResponse = z.infer<typeof FollowSuggestionsResponseSchema>;
export type FollowMatch = z.infer<typeof FollowMatchSchema>;
export type FollowingFeedItem = z.infer<typeof FollowingFeedItemSchema>;
export type FollowingFeedResponse = z.infer<typeof FollowingFeedResponseSchema>;
export type UpdateBookmarkTagsInput = z.infer<typeof UpdateBookmarkTagsInputSchema>;
export type DeleteBookmarkInput = z.infer<typeof DeleteBookmarkInputSchema>;
export type DeleteBookmarkResult = z.infer<typeof DeleteBookmarkResultSchema>;

export const LearningTrackTaskSetSchema = z.object({
	learn: z.string().min(1),
	explain: z.string().min(1),
	check: z.string().min(1),
});

export const LearningTrackDaySchema = z.object({
	day: z.number().int().min(1).max(7),
	title: z.string().min(1),
	focus: z.string().min(1),
	minutes: z.number().int().min(1),
	tasks: LearningTrackTaskSetSchema,
});

export const CreateLearningTrackInputSchema = z.object({
	analysisId: z.string().min(1),
});

export const CreateLearningTrackResultSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	analysisId: z.string().min(1),
	minutesPerDay: z.number().int().min(1),
	days: z.array(LearningTrackDaySchema).length(7),
	createdAt: z.number().int().nonnegative(),
});

export type CreateLearningTrackInput = z.infer<typeof CreateLearningTrackInputSchema>;
export type CreateLearningTrackResult = z.infer<typeof CreateLearningTrackResultSchema>;
