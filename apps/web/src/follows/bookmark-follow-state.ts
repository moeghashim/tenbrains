import type { FollowSummary, SavedBookmark } from "@tenbrains/contracts";

import {
	normalizeCreatorUsername,
	normalizeSubjectTag,
} from "./follow-utils.js";

export const EMPTY_FOLLOW_SUMMARY: FollowSummary = {
	creatorFollows: [],
	subjectFollows: [],
};

export interface BookmarkFollowState {
	isCreatorFeedFollowed: boolean;
	followedCreatorSubjects: string[];
	followedSubjects: string[];
}

export interface FollowableBookmarkLike {
	authorUsername: string;
	tags: string[];
}

export function buildBookmarkFollowStateForItem(
	bookmark: FollowableBookmarkLike,
	summary: FollowSummary,
): BookmarkFollowState {
	const normalizedCreatorUsername = normalizeCreatorUsername(
		bookmark.authorUsername,
	);
	const creatorFollows = summary.creatorFollows.filter(
		(follow) =>
			normalizeCreatorUsername(follow.creatorUsername) ===
			normalizedCreatorUsername,
	);

	return {
		isCreatorFeedFollowed: creatorFollows.some(
			(follow) => follow.scope === "all_feed",
		),
		followedCreatorSubjects: creatorFollows
			.filter(
				(follow) =>
					follow.scope === "subject" &&
					typeof follow.subjectTag === "string" &&
					follow.subjectTag.trim().length > 0,
			)
			.map((follow) => normalizeSubjectTag(follow.subjectTag ?? "")),
		followedSubjects: summary.subjectFollows.map((follow) =>
			normalizeSubjectTag(follow.subjectTag),
		),
	};
}

export function buildBookmarkFollowState(
	bookmark: SavedBookmark,
	summary: FollowSummary,
): BookmarkFollowState {
	return buildBookmarkFollowStateForItem(bookmark, summary);
}

export function isCreatorSubjectCovered(
	state: BookmarkFollowState,
	subjectTag: string,
): boolean {
	if (state.isCreatorFeedFollowed) {
		return true;
	}

	return state.followedCreatorSubjects.includes(normalizeSubjectTag(subjectTag));
}

export function isSubjectFollowed(
	summary: FollowSummary,
	subjectTag: string,
): boolean {
	const normalizedSubjectTag = normalizeSubjectTag(subjectTag);
	return summary.subjectFollows.some(
		(follow) => normalizeSubjectTag(follow.subjectTag) === normalizedSubjectTag,
	);
}
