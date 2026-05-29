import type { Suggestion } from "@tenbrains/contracts";
import { XApiV2Client, type TweetPayload } from "@tenbrains/x-client";

import { suggestBookmarkTags } from "../bookmarks/suggest-tags.js";
import {
	getTakeawayHistoryForSession,
	listBookmarksForSession,
	listDismissedSuggestionTweetIdsForSession,
	listFollowsForSession,
	listSuggestionsForSession,
	listTakeawayWorkspaceForSession,
	upsertSuggestionsForSession,
} from "../server/convex-admin.js";
import { reportServerError } from "../telemetry/report-error.js";

interface SessionUserIdentity {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface Candidate {
	tweet: TweetPayload;
	reasons: Suggestion["reasons"];
	sourceSignals: string[];
}

interface SuggestionsClient {
	getLatestPostsByUsername(username: string, limit: number): Promise<TweetPayload[]>;
	searchRecentPosts(
		query: string,
		limit: number,
	): Promise<{
		tweets: TweetPayload[];
	}>;
}

const MAX_SUGGESTION_QUERY_LENGTH = 128;

function buildTweetUrl(tweet: TweetPayload): string {
	const username = tweet.authorUsername?.trim().replace(/^@+/, "");
	return username ? `https://x.com/${username}/status/${tweet.id}` : `https://x.com/i/web/status/${tweet.id}`;
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function toSuggestionSearchQuery(value: string): string | null {
	const normalized = value
		.trim()
		.replace(/\s+/g, " ")
		.replace(/^["'`#\s]+/g, "")
		.replace(/["'`\s]+$/g, "");
	if (normalized.length < 2) {
		return null;
	}
	return normalized.slice(0, MAX_SUGGESTION_QUERY_LENGTH);
}

function deriveTopBookmarkTags(textTags: string[], limit: number): string[] {
	const counts = new Map<string, number>();
	for (const tag of textTags) {
		const key = normalize(tag);
		if (!key) {
			continue;
		}
		counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { sensitivity: "base" }))
		.slice(0, limit)
		.map(([tag]) => tag);
}

function mergeCandidate(map: Map<string, Candidate>, tweet: TweetPayload, nextReason: Suggestion["reasons"][number], signal: string) {
	const existing = map.get(tweet.id);
	if (!existing) {
		map.set(tweet.id, {
			tweet,
			reasons: [nextReason],
			sourceSignals: [signal],
		});
		return;
	}

	if (!existing.reasons.some((reason) => reason.code === nextReason.code && reason.label === nextReason.label)) {
		existing.reasons.push(nextReason);
	}
	if (!existing.sourceSignals.includes(signal)) {
		existing.sourceSignals.push(signal);
	}
}

function scoreCandidate({
	candidate,
	bookmarks,
	followedCreators,
}: {
	candidate: Candidate;
	bookmarks: Awaited<ReturnType<typeof listBookmarksForSession>>;
	followedCreators: Set<string>;
}): number {
	let score = 0;
	if (followedCreators.has(normalize(candidate.tweet.authorUsername ?? ""))) {
		score += 60;
	}

	const bookmarkTagMatches = new Set<string>();
	for (const bookmark of bookmarks) {
		const bookmarkText = normalize(bookmark.tweetText);
		const candidateText = normalize(candidate.tweet.text);
		if (bookmarkText && candidateText.includes(bookmarkText.slice(0, Math.min(bookmarkText.length, 48)))) {
			score += 6;
		}
		for (const tag of bookmark.tags) {
			if (normalize(candidate.tweet.text).includes(normalize(tag))) {
				bookmarkTagMatches.add(tag);
			}
		}
	}

	score += bookmarkTagMatches.size * 12;
	for (const reason of candidate.reasons) {
		if (reason.code === "subject_search") {
			score += 30;
		}
		if (reason.code === "bookmark_affinity") {
			score += 25;
		}
		if (reason.code === "takeaway_theme") {
			score += 8;
		}
	}

	return score;
}

export async function buildSuggestionsForSession({
	sessionUser,
	limit = 20,
	xClient = new XApiV2Client(),
}: {
	sessionUser: SessionUserIdentity;
	limit?: number;
	xClient?: SuggestionsClient;
}) {
	const [bookmarks, followSummary, takeawayWorkspace, dismissedTweetIds] = await Promise.all([
		listBookmarksForSession({ sessionUser }),
		listFollowsForSession({ sessionUser }),
		listTakeawayWorkspaceForSession({ sessionUser }),
		listDismissedSuggestionTweetIdsForSession({ sessionUser }),
	]);
	const bookmarkedTweetIds = new Set(bookmarks.map((bookmark) => bookmark.tweetId));
	const dismissedTweetIdSet = new Set(dismissedTweetIds);
	const candidateById = new Map<string, Candidate>();
	const followedCreators = new Set(followSummary.creatorFollows.map((follow) => normalize(follow.creatorUsername)));

	for (const follow of followSummary.creatorFollows.slice(0, 4)) {
		let tweets: TweetPayload[];
		try {
			tweets = await xClient.getLatestPostsByUsername(follow.creatorUsername, 5);
		} catch (error) {
			reportServerError({
				scope: "suggestions.followed_creator_fetch_failure",
				error,
				metadata: {
					userId: sessionUser.id,
					creatorUsername: follow.creatorUsername,
				},
			});
			continue;
		}
		for (const tweet of tweets) {
			mergeCandidate(
				candidateById,
				tweet,
				{ code: "followed_creator", label: `From followed creator @${follow.creatorUsername}` },
				`creator:${normalize(follow.creatorUsername)}`,
			);
		}
	}

	const subjectQueryEntries = new Map<string, string>();
	for (const follow of followSummary.subjectFollows) {
		const query = toSuggestionSearchQuery(follow.subjectTag);
		if (query) {
			subjectQueryEntries.set(normalize(query), query);
		}
	}
	for (const tag of deriveTopBookmarkTags(bookmarks.flatMap((bookmark) => bookmark.tags), 3)) {
		const query = toSuggestionSearchQuery(tag);
		if (query) {
			subjectQueryEntries.set(normalize(query), query);
		}
	}
	for (const query of Array.from(subjectQueryEntries.values()).slice(0, 5)) {
		let page: { tweets: TweetPayload[] };
		try {
			page = await xClient.searchRecentPosts(query, 8);
		} catch (error) {
			reportServerError({
				scope: "suggestions.subject_search_failure",
				error,
				metadata: {
					userId: sessionUser.id,
					query,
				},
			});
			continue;
		}
		for (const tweet of page.tweets) {
			mergeCandidate(
				candidateById,
				tweet,
				{ code: "subject_search", label: `Matches ${query}` },
				`subject:${normalize(query)}`,
			);
		}
	}

	for (const follow of takeawayWorkspace.follows.slice(0, 3)) {
		let history: Awaited<ReturnType<typeof getTakeawayHistoryForSession>>;
		try {
			history = await getTakeawayHistoryForSession({ sessionUser, followId: follow.id });
		} catch (error) {
			reportServerError({
				scope: "suggestions.takeaway_history_failure",
				error,
				metadata: {
					userId: sessionUser.id,
					followId: follow.id,
					accountUsername: follow.accountUsername,
				},
			});
			continue;
		}
		const latest = history.latest;
		if (!latest) {
			continue;
		}
		for (const takeaway of latest.takeaways.slice(0, 2)) {
			const query = toSuggestionSearchQuery(takeaway.split(/[.!?]/)[0] ?? "");
			if (!query) {
				continue;
			}
			let page: { tweets: TweetPayload[] };
			try {
				page = await xClient.searchRecentPosts(query, 5);
			} catch (error) {
				reportServerError({
					scope: "suggestions.takeaway_search_failure",
					error,
					metadata: {
						userId: sessionUser.id,
						accountUsername: follow.accountUsername,
						query,
					},
				});
				continue;
			}
			for (const tweet of page.tweets) {
				mergeCandidate(
					candidateById,
					tweet,
					{ code: "takeaway_theme", label: `Related to takeaway theme from @${follow.accountUsername}` },
					`takeaway:${normalize(follow.accountUsername)}`,
				);
			}
		}
	}

	const ranked = Array.from(candidateById.values())
		.filter((candidate) => !bookmarkedTweetIds.has(candidate.tweet.id) && !dismissedTweetIdSet.has(candidate.tweet.id))
		.map((candidate) => ({
			candidate,
			score: scoreCandidate({
				candidate,
				bookmarks,
				followedCreators,
			}),
		}))
		.filter((item) => item.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, limit)
		.map(({ candidate, score }) => ({
			tweetId: candidate.tweet.id,
			tweetText: candidate.tweet.text,
			tweetUrlOrId: buildTweetUrl(candidate.tweet),
			authorUsername: candidate.tweet.authorUsername ?? "unknown",
			authorName: candidate.tweet.authorName,
			authorAvatarUrl: candidate.tweet.authorAvatarUrl,
			score,
			reasons: candidate.reasons,
			sourceSignals: candidate.sourceSignals,
			suggestedTags: suggestBookmarkTags({
				text: candidate.tweet.text,
				authorUsername: candidate.tweet.authorUsername,
				existingBookmarks: bookmarks,
				subjectFollows: followSummary.subjectFollows,
			}).slice(0, 4),
		}))
		.map((item) => ({
			...item,
			suggestedTags: item.suggestedTags.length > 0 ? item.suggestedTags : ["Inbox"],
		}));

	return await upsertSuggestionsForSession({
		sessionUser,
		suggestions: ranked,
	});
}

export async function listRenderableSuggestionsForSession({
	sessionUser,
}: {
	sessionUser: SessionUserIdentity;
}) {
	const [stored, bookmarks, dismissedTweetIds] = await Promise.all([
		listSuggestionsForSession({ sessionUser }),
		listBookmarksForSession({ sessionUser }),
		listDismissedSuggestionTweetIdsForSession({ sessionUser }),
	]);
	const bookmarkedTweetIds = new Set(bookmarks.map((bookmark) => bookmark.tweetId));
	const dismissedTweetIdSet = new Set(dismissedTweetIds);

	return {
		suggestions: stored.suggestions.filter(
			(suggestion) => !bookmarkedTweetIds.has(suggestion.tweetId) && !dismissedTweetIdSet.has(suggestion.tweetId),
		),
	};
}
