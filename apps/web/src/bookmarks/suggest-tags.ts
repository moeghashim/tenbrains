import { parseBookmarkTags, validateBookmarkTags } from "@tenbrains/contracts/bookmark-tags";
import type { SavedBookmark, SubjectFollow } from "@tenbrains/contracts";

const STOP_WORDS = new Set([
	"about",
	"after",
	"again",
	"also",
	"because",
	"been",
	"being",
	"could",
	"from",
	"have",
	"into",
	"just",
	"more",
	"most",
	"over",
	"some",
	"than",
	"that",
	"their",
	"them",
	"then",
	"there",
	"these",
	"they",
	"this",
	"those",
	"what",
	"when",
	"where",
	"which",
	"while",
	"with",
	"would",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.map((token) => token.trim())
		.filter((token) => token.length >= 3 && token.length <= 24 && !STOP_WORDS.has(token));
}

function titleCase(input: string): string {
	return input
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

export function suggestBookmarkTags({
	text,
	authorUsername,
	existingBookmarks,
	subjectFollows,
}: {
	text: string;
	authorUsername?: string;
	existingBookmarks: SavedBookmark[];
	subjectFollows: SubjectFollow[];
}): string[] {
	const textTokens = new Set(tokenize(text));
	const candidateScores = new Map<string, number>();

	for (const bookmark of existingBookmarks) {
		const bookmarkTokens = new Set(tokenize(bookmark.tweetText));
		for (const tag of bookmark.tags) {
			const key = tag.trim();
			if (!key) {
				continue;
			}
			let score = candidateScores.get(key) ?? 0;
			const normalizedTagTokens = tokenize(tag);
			if (normalizedTagTokens.some((token) => textTokens.has(token))) {
				score += 5;
			}
			for (const token of bookmarkTokens) {
				if (textTokens.has(token)) {
					score += 1;
				}
			}
			candidateScores.set(key, score);
		}
	}

	for (const follow of subjectFollows) {
		const tag = follow.subjectTag.trim();
		if (!tag) {
			continue;
		}
		const tagTokens = tokenize(tag);
		if (tagTokens.some((token) => textTokens.has(token))) {
			candidateScores.set(tag, (candidateScores.get(tag) ?? 0) + 8);
		}
	}

	if (authorUsername?.trim()) {
		candidateScores.set(authorUsername.trim().replace(/^@+/, ""), (candidateScores.get(authorUsername) ?? 0) + 2);
	}

	const rankedCandidates = Array.from(candidateScores.entries())
		.filter(([, score]) => score > 0)
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { sensitivity: "base" }))
		.map(([tag]) => tag);

	const fallbackTokens = Array.from(textTokens).slice(0, 4).map((token) => titleCase(token));
	const merged = parseBookmarkTags([...rankedCandidates.slice(0, 4), ...fallbackTokens].join(","));
	const validTags = merged.filter((_, index) => validateBookmarkTags(merged.slice(0, index + 1)) === null);

	return validTags.slice(0, 4);
}
