import {
	type RefreshTakeawayResult,
	RefreshTakeawayResultSchema,
	type TakeawayFollow,
	type AccountTakeawaySnapshot,
	type ProviderId,
} from "@tenbrains/contracts";
import { analyzeAccountTakeaway } from "@tenbrains/ai";
import { XApiV2Client, type TweetPayload } from "@tenbrains/x-client";

import {
	getPreferencesForSession,
	getProviderApiKeyForSession,
	getTakeawayFollowByIdForSession,
	getTakeawayHistoryForSession,
	markTakeawayRefreshErrorForSession,
	persistTakeawaySnapshotForSession,
} from "../server/convex-admin.js";
import { embedTakeawaySnapshotSource } from "../embeddings/embed-source.js";

interface SessionUserIdentity {
	id: string;
	email?: string | null;
	name?: string | null;
}

function buildDateKey(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function toTweetPreview(tweet: TweetPayload): AccountTakeawaySnapshot["posts"][number] {
	return {
		id: tweet.id,
		text: tweet.text,
		authorId: tweet.authorId,
		authorUsername: tweet.authorUsername,
		authorName: tweet.authorName,
		authorAvatarUrl: tweet.authorAvatarUrl,
		createdAt: tweet.createdAt,
		conversationId: tweet.conversationId,
		inReplyToTweetId: tweet.inReplyToTweetId,
		media: tweet.media,
		publicMetrics: tweet.publicMetrics,
	};
}

async function buildSnapshot({
	sessionUser,
	follow,
	refreshedAt,
	dateKey,
}: {
	sessionUser: SessionUserIdentity;
	follow: TakeawayFollow;
	refreshedAt: number;
	dateKey: string;
}): Promise<AccountTakeawaySnapshot> {
	const preferences = await getPreferencesForSession({ sessionUser });
	const provider = preferences.defaultProvider as ProviderId;
	const model = preferences.defaultModel;
	const apiKey = await getProviderApiKeyForSession({
		sessionUser,
		provider,
	});
	if (!apiKey) {
		throw new Error(`No API key is configured for ${provider}.`);
	}

	const xClient = new XApiV2Client();
	const user = await xClient.getUserByUsername(follow.accountUsername);
	const posts = await xClient.getLatestPostsByUserId(user.id, 20);
	const analysis = await analyzeAccountTakeaway({
		provider,
		apiKey,
		model,
		account: {
			id: user.id,
			username: user.username,
			name: user.name,
		},
		posts,
	});

	const snapshot = await persistTakeawaySnapshotForSession({
		sessionUser,
		input: {
			followId: follow.id,
			accountId: user.id,
			accountUsername: user.username,
			accountName: user.name,
			accountAvatarUrl: user.avatarUrl,
			provider,
			model,
			summary: analysis.summary,
			takeaways: analysis.takeaways,
			sampleSize: posts.length,
			snapshotDateKey: dateKey,
			posts: posts.map(toTweetPreview),
			createdAt: refreshedAt,
		},
	});
	await embedTakeawaySnapshotSource({
		sessionUser,
		snapshot,
	});
	return snapshot;
}

export async function refreshTakeawayForSession({
	sessionUser,
	followId,
	now = () => Date.now(),
}: {
	sessionUser: SessionUserIdentity;
	followId: string;
	now?: () => number;
}): Promise<RefreshTakeawayResult> {
	const refreshedAt = now();
	const dateKey = buildDateKey(refreshedAt);
	const [follow, history] = await Promise.all([
		getTakeawayFollowByIdForSession({ sessionUser, followId }),
		getTakeawayHistoryForSession({ sessionUser, followId }),
	]);

	if (history.latest && history.latest.snapshotDateKey === dateKey) {
		return RefreshTakeawayResultSchema.parse({
			snapshot: history.latest,
			deduped: true,
		});
	}

	try {
		const snapshot = await buildSnapshot({
			sessionUser,
			follow,
			refreshedAt,
			dateKey,
		});

		return RefreshTakeawayResultSchema.parse({
			snapshot,
			deduped: false,
		});
	} catch (error) {
		await markTakeawayRefreshErrorForSession({
			sessionUser,
			followId,
			dateKey,
			refreshedAt,
			errorMessage: error instanceof Error ? error.message : "Unable to refresh takeaway.",
		});
		throw error;
	}
}

export { buildDateKey as buildTakeawayDateKey };
