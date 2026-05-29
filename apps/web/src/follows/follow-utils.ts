import type {
	CreatorFollow,
	FollowMatch,
	FollowingFeedItem,
	SavedBookmark,
	SubjectFollow,
	SuggestedCreator,
} from "@tenbrains/contracts";

export const ALL_FEED_SUBJECT_KEY = "__all_feed__";

function compareBookmarksByRecency(
	left: Pick<SavedBookmark, "updatedAt" | "createdAt">,
	right: Pick<SavedBookmark, "updatedAt" | "createdAt">,
): number {
	if (right.updatedAt !== left.updatedAt) {
		return right.updatedAt - left.updatedAt;
	}
	return right.createdAt - left.createdAt;
}

function buildBookmarkIdentityKey(bookmark: SavedBookmark): string {
	const tweetId = bookmark.tweetId.trim();
	if (tweetId.length > 0) {
		return tweetId;
	}
	return bookmark.tweetUrlOrId.trim().toLowerCase();
}

export function sanitizeCreatorUsername(username: string): string {
	return username.trim().replace(/^@+/, "");
}

export function normalizeCreatorUsername(username: string): string {
	return sanitizeCreatorUsername(username).toLowerCase();
}

export function normalizeSubjectTag(subjectTag: string): string {
	return subjectTag.trim().toLowerCase();
}

function bookmarkHasSubjectTag(bookmark: SavedBookmark, subjectTag: string): boolean {
	const normalizedSubject = normalizeSubjectTag(subjectTag);
	return bookmark.tags.some((tag) => normalizeSubjectTag(tag) === normalizedSubject);
}

export function dedupeSavedBookmarks(bookmarks: SavedBookmark[]): SavedBookmark[] {
	const dedupedByIdentity = new Map<string, SavedBookmark>();
	for (const bookmark of bookmarks) {
		const identity = buildBookmarkIdentityKey(bookmark);
		const existing = dedupedByIdentity.get(identity);
		if (!existing || compareBookmarksByRecency(existing, bookmark) > 0) {
			dedupedByIdentity.set(identity, bookmark);
		}
	}

	return Array.from(dedupedByIdentity.values()).sort(compareBookmarksByRecency);
}

export function buildCreatorSuggestions({
	bookmarks,
	creatorFollows,
	subjectTag,
}: {
	bookmarks: SavedBookmark[];
	creatorFollows: CreatorFollow[];
	subjectTag: string;
}): SuggestedCreator[] {
	const normalizedSubject = normalizeSubjectTag(subjectTag);
	const existingCreatorFollows = new Set(
		creatorFollows
			.filter((follow) => {
				if (follow.scope === "all_feed") {
					return true;
				}
				return normalizeSubjectTag(follow.subjectTag ?? "") === normalizedSubject;
			})
			.map((follow) => normalizeCreatorUsername(follow.creatorUsername)),
	);
	const suggestions = new Map<
		string,
		{
			creatorUsername: string;
			creatorName?: string;
			creatorAvatarUrl?: string;
			bookmarkCount: number;
			latestBookmarkAt: number;
		}
	>();

	for (const bookmark of dedupeSavedBookmarks(bookmarks)) {
		if (!bookmarkHasSubjectTag(bookmark, subjectTag)) {
			continue;
		}
		const normalizedCreator = normalizeCreatorUsername(bookmark.authorUsername);
		if (!normalizedCreator || existingCreatorFollows.has(normalizedCreator)) {
			continue;
		}
		const existing = suggestions.get(normalizedCreator);
		if (existing) {
			existing.bookmarkCount += 1;
			existing.latestBookmarkAt = Math.max(existing.latestBookmarkAt, bookmark.updatedAt);
			if (!existing.creatorName && bookmark.authorName) {
				existing.creatorName = bookmark.authorName;
			}
			if (!existing.creatorAvatarUrl && bookmark.authorAvatarUrl) {
				existing.creatorAvatarUrl = bookmark.authorAvatarUrl;
			}
			continue;
		}
		suggestions.set(normalizedCreator, {
			creatorUsername: sanitizeCreatorUsername(bookmark.authorUsername),
			creatorName: bookmark.authorName,
			creatorAvatarUrl: bookmark.authorAvatarUrl,
			bookmarkCount: 1,
			latestBookmarkAt: bookmark.updatedAt,
		});
	}

	return Array.from(suggestions.values())
		.sort((left, right) => {
			if (right.bookmarkCount !== left.bookmarkCount) {
				return right.bookmarkCount - left.bookmarkCount;
			}
			if (right.latestBookmarkAt !== left.latestBookmarkAt) {
				return right.latestBookmarkAt - left.latestBookmarkAt;
			}
			return left.creatorUsername.localeCompare(right.creatorUsername, undefined, { sensitivity: "base" });
		})
		.map((suggestion) => ({
			...suggestion,
			subjectTag: subjectTag.trim(),
		}));
}

function collectBookmarkMatches({
	bookmark,
	creatorFollows,
	subjectFollows,
}: {
	bookmark: SavedBookmark;
	creatorFollows: CreatorFollow[];
	subjectFollows: SubjectFollow[];
}): FollowMatch[] {
	const matches: FollowMatch[] = [];
	const normalizedCreator = normalizeCreatorUsername(bookmark.authorUsername);

	for (const follow of creatorFollows) {
		if (normalizeCreatorUsername(follow.creatorUsername) !== normalizedCreator) {
			continue;
		}

		if (follow.scope === "all_feed") {
			matches.push({
				type: "creator_all_feed",
				creatorUsername: follow.creatorUsername,
			});
			continue;
		}

		if (follow.subjectTag && bookmarkHasSubjectTag(bookmark, follow.subjectTag)) {
			matches.push({
				type: "creator_subject",
				creatorUsername: follow.creatorUsername,
				subjectTag: follow.subjectTag,
			});
		}
	}

	for (const follow of subjectFollows) {
		if (!bookmarkHasSubjectTag(bookmark, follow.subjectTag)) {
			continue;
		}
		matches.push({
			type: "subject",
			subjectTag: follow.subjectTag,
		});
	}

	return matches;
}

export function buildFollowingFeed({
	bookmarks,
	creatorFollows,
	subjectFollows,
}: {
	bookmarks: SavedBookmark[];
	creatorFollows: CreatorFollow[];
	subjectFollows: SubjectFollow[];
}): FollowingFeedItem[] {
	const items: FollowingFeedItem[] = [];
	for (const bookmark of dedupeSavedBookmarks(bookmarks)) {
		const matches = collectBookmarkMatches({
			bookmark,
			creatorFollows,
			subjectFollows,
		});
		if (matches.length === 0) {
			continue;
		}
		items.push({
			...bookmark,
			matches,
		});
	}

	return items.sort(compareBookmarksByRecency);
}
