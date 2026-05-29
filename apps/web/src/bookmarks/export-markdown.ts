import type { SavedBookmark } from "@tenbrains/contracts";
import { strToU8, zipSync } from "fflate";

export function buildBookmarkCanonicalUrl(bookmark: SavedBookmark): string {
	const rawUrl = bookmark.tweetUrlOrId.trim();
	if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
		return rawUrl;
	}
	return `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;
}

function toIsoDate(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

function sanitizeFileNameSegment(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (trimmed.length === 0) {
		return "bookmark";
	}

	const normalized = trimmed
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/g, "")
		.replace(/-+$/g, "");

	return normalized.length > 0 ? normalized.slice(0, 48) : "bookmark";
}

export function buildBookmarkMarkdownFileName(bookmark: SavedBookmark, position: number): string {
	const username = sanitizeFileNameSegment(bookmark.authorUsername);
	const tweetSlug = sanitizeFileNameSegment(bookmark.tweetText).slice(0, 36);
	return `${String(position + 1).padStart(2, "0")}-${username}-${tweetSlug}.md`;
}

export function buildBookmarksArchiveFileName(tags: string[]): string {
	const dateSegment = new Date().toISOString().slice(0, 10);
	if (tags.length === 0) {
		return `tenbrains-bookmarks-${dateSegment}.zip`;
	}

	const tagSegment = tags.map((tag) => sanitizeFileNameSegment(tag)).join("-");
	return `tenbrains-bookmarks-${tagSegment.slice(0, 48)}-${dateSegment}.zip`;
}

export function renderBookmarkMarkdown(bookmark: SavedBookmark): string {
	const authorLabel = bookmark.authorName?.trim() ? `${bookmark.authorName} (@${bookmark.authorUsername})` : `@${bookmark.authorUsername}`;
	const threadSection =
		bookmark.thread && bookmark.thread.tweets.length > 1
			? [
					"## Thread",
					"",
					...bookmark.thread.tweets.flatMap((tweet, index) => [
						`### Post ${index + 1}`,
						"",
						tweet.text,
						"",
					]),
				]
			: [];

	return [
		`# ${authorLabel}`,
		"",
		`- Tweet ID: ${bookmark.tweetId}`,
		`- URL: ${buildBookmarkCanonicalUrl(bookmark)}`,
		`- Tags: ${bookmark.tags.join(", ")}`,
		`- Saved At: ${toIsoDate(bookmark.createdAt)}`,
		`- Updated At: ${toIsoDate(bookmark.updatedAt)}`,
		"",
		"## Tweet",
		"",
		bookmark.tweetText,
		"",
		...threadSection,
	].join("\n");
}

export function buildBookmarksMarkdownArchive(bookmarks: SavedBookmark[]): Uint8Array {
	const entries = Object.fromEntries(
		bookmarks.map((bookmark, index) => [buildBookmarkMarkdownFileName(bookmark, index), strToU8(renderBookmarkMarkdown(bookmark))]),
	);
	return zipSync(entries, {
		level: 0,
	});
}
