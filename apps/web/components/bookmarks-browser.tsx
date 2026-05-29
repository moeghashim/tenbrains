"use client";

import { parseBookmarkTags, validateBookmarkTags } from "@tenbrains/contracts/bookmark-tags";
import type {
	CreateFollowInput,
	FollowSummary,
	SavedBookmark,
} from "@tenbrains/contracts";
import { buildBookmarkCanonicalUrl, buildBookmarksArchiveFileName, buildBookmarksMarkdownArchive } from "../src/bookmarks/export-markdown.js";
import {
	buildBookmarkFollowState,
	EMPTY_FOLLOW_SUMMARY,
	isCreatorSubjectCovered,
	isSubjectFollowed,
} from "../src/follows/bookmark-follow-state.js";
import {
	readJsonResponse,
	readResponseErrorMessage,
} from "../src/http/read-json-response.js";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type BookmarkViewMode = "tile" | "row";

interface BookmarksResponseSuccess {
	bookmarks: SavedBookmark[];
}

interface BookmarkSyncStatusResponseSuccess {
	state?: {
		lastSyncedAt?: number;
		lastError?: string;
		importedCount: number;
		mode?: "initial_backfill" | "incremental";
		backfillComplete?: boolean;
	};
	connected?: boolean;
	requiresReconnect?: boolean;
}

interface BookmarkSyncManualResponse extends BookmarkSyncStatusResponseSuccess {
	importedCount: number;
}

interface BookmarkSyncErrorResponse extends BookmarksResponseError {
	connected?: boolean;
	requiresReconnect?: boolean;
}

interface FollowsResponseSuccess extends FollowSummary {}

interface BookmarksResponseError {
	error?: {
		code?: string;
		message?: string;
	};
}

interface DeleteBookmarkResponseSuccess {
	bookmarkId: string;
}

interface BookmarkTagFilterOption {
	key: string;
	label: string;
	count: number;
}

const DEFAULT_VISIBLE_TAG_FILTERS = 6;
const BOOKMARK_SYNC_RECONNECT_PATH = "/auth/popup-start?redirect_url=%2Fapp%2Fbookmarks";
export const BOOKMARK_DETAILS_PANEL_CLASS =
	"glass-panel absolute inset-y-0 right-0 z-10 h-full w-full overflow-y-auto overscroll-contain border-l border-outline-variant/20 bg-surface-container-high/90 p-6 shadow-2xl touch-pan-y sm:w-[560px]";

function compareBookmarksByRecency(left: Pick<SavedBookmark, "updatedAt" | "createdAt">, right: Pick<SavedBookmark, "updatedAt" | "createdAt">): number {
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

function normalizeBookmarkSearchQuery(query: string): string {
	return query.trim().toLowerCase();
}

function formatBookmarkDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function truncateForPreview(text: string, maxLength = 170): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength).trimEnd()}…`;
}

function describeBookmarkSource(bookmark: SavedBookmark): string | null {
	if (bookmark.source === "x_sync") {
		return "Synced from X";
	}
	if (bookmark.source === "suggestion") {
		return "Saved from suggestion";
	}
	return null;
}

function bookmarkAvatarLabel(bookmark: SavedBookmark): string {
	const preferred = bookmark.authorName ?? bookmark.authorUsername;
	const firstChar = preferred.trim().charAt(0);
	return firstChar.length > 0 ? firstChar.toUpperCase() : "X";
}

function buildTagFilterOptions(bookmarks: SavedBookmark[]): BookmarkTagFilterOption[] {
	const byKey = new Map<string, BookmarkTagFilterOption>();
	for (const bookmark of bookmarks) {
		const uniqueTags = new Set<string>();
		for (const tag of bookmark.tags) {
			const key = tag.trim().toLowerCase();
			if (!key || uniqueTags.has(key)) {
				continue;
			}
			uniqueTags.add(key);

			const existing = byKey.get(key);
			if (existing) {
				byKey.set(key, { ...existing, count: existing.count + 1 });
				continue;
			}

			byKey.set(key, {
				key,
				label: tag.trim(),
				count: 1,
			});
		}
	}

	return Array.from(byKey.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

export function sortTagFilterOptionsForDisplay(
	options: BookmarkTagFilterOption[],
	activeTagKeys: string[],
): BookmarkTagFilterOption[] {
	const normalizedActiveKeys = new Set(
		activeTagKeys.map((tagKey) => tagKey.trim().toLowerCase()).filter((tagKey) => tagKey.length > 0),
	);

	return [...options].sort((left, right) => {
		const leftActive = normalizedActiveKeys.has(left.key);
		const rightActive = normalizedActiveKeys.has(right.key);
		if (leftActive !== rightActive) {
			return leftActive ? -1 : 1;
		}
		if (right.count !== left.count) {
			return right.count - left.count;
		}
		return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
	});
}

export function buildCollapsedTagFilterOptions(
	options: BookmarkTagFilterOption[],
	activeTagKeys: string[],
	limit = DEFAULT_VISIBLE_TAG_FILTERS,
): BookmarkTagFilterOption[] {
	if (limit <= 0) {
		return [];
	}

	const normalizedActiveKeys = new Set(
		activeTagKeys.map((tagKey) => tagKey.trim().toLowerCase()).filter((tagKey) => tagKey.length > 0),
	);
	const visibleOptions: BookmarkTagFilterOption[] = [];
	const visibleKeys = new Set<string>();

	for (const option of options) {
		if (!normalizedActiveKeys.has(option.key) || visibleKeys.has(option.key)) {
			continue;
		}
		visibleOptions.push(option);
		visibleKeys.add(option.key);
	}

	for (const option of options) {
		if (visibleOptions.length >= limit) {
			break;
		}
		if (visibleKeys.has(option.key)) {
			continue;
		}
		visibleOptions.push(option);
		visibleKeys.add(option.key);
	}

	return visibleOptions;
}

export function dedupeBookmarks(bookmarks: SavedBookmark[]): SavedBookmark[] {
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

export function filterBookmarksByTags(bookmarks: SavedBookmark[], selectedTagKeys: string[]): SavedBookmark[] {
	if (selectedTagKeys.length === 0) {
		return bookmarks;
	}

	const normalizedKeys = new Set(selectedTagKeys.map((tagKey) => tagKey.trim().toLowerCase()).filter((tagKey) => tagKey.length > 0));
	if (normalizedKeys.size === 0) {
		return bookmarks;
	}

	return bookmarks.filter((bookmark) => bookmark.tags.some((tag) => normalizedKeys.has(tag.trim().toLowerCase())));
}

export function filterBookmarksBySearch(bookmarks: SavedBookmark[], query: string): SavedBookmark[] {
	const normalizedQuery = normalizeBookmarkSearchQuery(query);
	if (!normalizedQuery) {
		return bookmarks;
	}

	return bookmarks.filter((bookmark) => {
		const fields = [
			bookmark.tweetText,
			bookmark.authorName ?? "",
			bookmark.authorUsername,
			...bookmark.tags,
		];
		return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
	});
}

export function BookmarksBrowser() {
	const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
	const [viewMode, setViewMode] = useState<BookmarkViewMode>("tile");
	const [searchQuery, setSearchQuery] = useState("");
	const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
	const [isTagFiltersExpanded, setIsTagFiltersExpanded] = useState(false);
	const [selectedBookmark, setSelectedBookmark] = useState<SavedBookmark | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [panelTagsInput, setPanelTagsInput] = useState("");
	const [panelErrorMessage, setPanelErrorMessage] = useState<string | null>(null);
	const [panelSuccessMessage, setPanelSuccessMessage] = useState<string | null>(null);
	const [isUpdatingTags, setIsUpdatingTags] = useState(false);
	const [isDeletingBookmark, setIsDeletingBookmark] = useState(false);
	const [isCreatingFollow, setIsCreatingFollow] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isSyncingBookmarks, setIsSyncingBookmarks] = useState(false);
	const [exportMessage, setExportMessage] = useState<string | null>(null);
	const [bookmarkSyncMessage, setBookmarkSyncMessage] = useState<string | null>(null);
	const [bookmarkSyncRequiresReconnect, setBookmarkSyncRequiresReconnect] = useState(false);
	const [followMessage, setFollowMessage] = useState<string | null>(null);
	const [followSummary, setFollowSummary] = useState<FollowSummary>(
		EMPTY_FOLLOW_SUMMARY,
	);
	const [bookmarkSyncState, setBookmarkSyncState] = useState<BookmarkSyncStatusResponseSuccess["state"]>();

	async function readFollowSummary(): Promise<FollowSummary> {
		try {
			const response = await fetch("/api/me/follows", {
				method: "GET",
				headers: {
					"content-type": "application/json",
				},
			});
			const payload = await readJsonResponse<FollowsResponseSuccess | BookmarksResponseError>(response);
			if (
				!response.ok ||
				!payload ||
				!("creatorFollows" in payload) ||
				!("subjectFollows" in payload)
			) {
				return EMPTY_FOLLOW_SUMMARY;
			}
			return payload;
		} catch {
			return EMPTY_FOLLOW_SUMMARY;
		}
	}

	async function readBookmarkSyncStatus(): Promise<BookmarkSyncStatusResponseSuccess> {
		try {
			const response = await fetch("/api/me/bookmark-sync", {
				method: "GET",
				headers: {
					"content-type": "application/json",
				},
			});
			const payload = (await response.json()) as BookmarkSyncStatusResponseSuccess;
			if (!response.ok || !payload) {
				return {};
			}
			return payload;
		} catch {
			return {};
		}
	}

	async function readBookmarks(): Promise<SavedBookmark[]> {
		const response = await fetch("/api/bookmarks", {
			method: "GET",
			headers: {
				"content-type": "application/json",
			},
		});
		const payload = (await response.json()) as BookmarksResponseSuccess | BookmarksResponseError;
		if (!response.ok) {
			const fallbackMessage = "Unable to load bookmarks right now.";
			throw new Error("error" in payload && payload.error?.message ? payload.error.message : fallbackMessage);
		}
		if (!("bookmarks" in payload)) {
			throw new Error("Unexpected bookmarks response.");
		}

		return payload.bookmarks;
	}

	useEffect(() => {
		let isCancelled = false;

		async function loadBookmarks(): Promise<void> {
			setIsLoading(true);
			setErrorMessage(null);
			try {
				const nextBookmarks = await readBookmarks();
				if (!isCancelled) {
					setBookmarks(dedupeBookmarks(nextBookmarks));
				}
			} catch (error) {
				if (!isCancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while loading bookmarks.");
					setBookmarks([]);
				}
			} finally {
				if (!isCancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadBookmarks();
		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		let isCancelled = false;

		async function loadFollowSummary(): Promise<void> {
			const [summary, syncStatus] = await Promise.all([readFollowSummary(), readBookmarkSyncStatus()]);
			if (!isCancelled) {
				setFollowSummary(summary);
				setBookmarkSyncState(syncStatus.state);
				setBookmarkSyncRequiresReconnect(syncStatus.requiresReconnect ?? false);
			}
		}

		void loadFollowSummary();
		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!selectedBookmark) {
			return;
		}

		const activeBookmark = bookmarks.find((bookmark) => bookmark.id === selectedBookmark.id);
		if (activeBookmark) {
			setSelectedBookmark(activeBookmark);
			return;
		}
		if (!activeBookmark) {
			setSelectedBookmark(null);
		}
	}, [bookmarks, selectedBookmark]);

	useEffect(() => {
		if (!selectedBookmark) {
			setPanelTagsInput("");
			setPanelErrorMessage(null);
			setPanelSuccessMessage(null);
			return;
		}
		setPanelTagsInput(selectedBookmark.tags.join(", "));
		setPanelErrorMessage(null);
		setPanelSuccessMessage(null);
	}, [selectedBookmark]);

	useEffect(() => {
		if (!selectedBookmark) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSelectedBookmark(null);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [selectedBookmark]);

	useEffect(() => {
		if (!selectedBookmark || typeof document === "undefined") {
			return;
		}

		const { body, documentElement } = document;
		const previousBodyOverflow = body.style.overflow;
		const previousHtmlOverflow = documentElement.style.overflow;
		body.style.overflow = "hidden";
		documentElement.style.overflow = "hidden";

		return () => {
			body.style.overflow = previousBodyOverflow;
			documentElement.style.overflow = previousHtmlOverflow;
		};
	}, [selectedBookmark]);

	const listContainerClass = useMemo(() => {
		if (viewMode === "tile") {
			return "grid grid-cols-1 gap-4 md:grid-cols-2";
		}
		return "flex flex-col gap-3";
	}, [viewMode]);

	const tagFilterOptions = useMemo(() => buildTagFilterOptions(bookmarks), [bookmarks]);
	const orderedTagFilterOptions = useMemo(
		() => sortTagFilterOptionsForDisplay(tagFilterOptions, activeTagFilters),
		[tagFilterOptions, activeTagFilters],
	);
	const visibleTagFilterOptions = useMemo(() => {
		if (isTagFiltersExpanded) {
			return orderedTagFilterOptions;
		}
		return buildCollapsedTagFilterOptions(orderedTagFilterOptions, activeTagFilters);
	}, [activeTagFilters, isTagFiltersExpanded, orderedTagFilterOptions]);
	const hiddenTagFilterCount = Math.max(tagFilterOptions.length - visibleTagFilterOptions.length, 0);
	const followActionOptions = useMemo(() => {
		if (activeTagFilters.length > 0) {
			const activeKeys = new Set(activeTagFilters);
			return orderedTagFilterOptions.filter((option) => activeKeys.has(option.key));
		}
		return [];
	}, [activeTagFilters, orderedTagFilterOptions]);

	const searchedBookmarks = useMemo(() => filterBookmarksBySearch(bookmarks, searchQuery), [bookmarks, searchQuery]);
	const filteredBookmarks = useMemo(
		() => filterBookmarksByTags(searchedBookmarks, activeTagFilters),
		[searchedBookmarks, activeTagFilters],
	);
	const selectedBookmarkUrl = selectedBookmark ? buildBookmarkCanonicalUrl(selectedBookmark) : "";
	const hasActiveSearch = normalizeBookmarkSearchQuery(searchQuery).length > 0;
	const hasActiveTagFilters = activeTagFilters.length > 0;
	const emptyStateMessage =
		hasActiveSearch && hasActiveTagFilters
			? "No bookmarks match the current search and selected tags."
			: hasActiveSearch
				? "No bookmarks match the current search."
				: "No bookmarks match the selected tags.";

	useEffect(() => {
		const availableTagKeys = new Set(tagFilterOptions.map((option) => option.key));
		setActiveTagFilters((current) => current.filter((tagKey) => availableTagKeys.has(tagKey)));
	}, [tagFilterOptions]);

	function toggleTagFilter(tagKey: string): void {
		setActiveTagFilters((current) => {
			if (current.includes(tagKey)) {
				return current.filter((entry) => entry !== tagKey);
			}
			return [...current, tagKey];
		});
	}

	async function exportVisibleBookmarks(): Promise<void> {
		if (filteredBookmarks.length === 0 || typeof window === "undefined") {
			return;
		}

		setIsExporting(true);
		setExportMessage(null);
		try {
			const archive = buildBookmarksMarkdownArchive(filteredBookmarks);
			const fileName = buildBookmarksArchiveFileName(activeTagFilters);
			const blobBytes = Uint8Array.from(archive);
			const blob = new Blob([blobBytes.buffer], { type: "application/zip" });
			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = downloadUrl;
			link.download = fileName;
			document.body.append(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(downloadUrl);
			setExportMessage(`Exported ${filteredBookmarks.length} bookmark${filteredBookmarks.length === 1 ? "" : "s"} as Markdown.`);
		} catch (error) {
			setExportMessage(error instanceof Error ? error.message : "Unexpected export failure.");
		} finally {
			setIsExporting(false);
		}
	}

	async function syncBookmarksNow(): Promise<void> {
		setIsSyncingBookmarks(true);
		setBookmarkSyncMessage(null);
		try {
			const response = await fetch("/api/me/bookmark-sync", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
			});
			const payload = await readJsonResponse<BookmarkSyncManualResponse | BookmarkSyncErrorResponse>(response);
			if (!response.ok) {
				if (payload && "requiresReconnect" in payload) {
					setBookmarkSyncRequiresReconnect(payload.requiresReconnect ?? false);
				}
				throw new Error(readResponseErrorMessage(payload, "Unable to sync X bookmarks right now."));
			}
			if (!payload || !("importedCount" in payload)) {
				throw new Error("Unexpected bookmark sync response.");
			}

			const [nextBookmarks, nextSyncStatus] = await Promise.all([readBookmarks(), readBookmarkSyncStatus()]);
			setBookmarks(dedupeBookmarks(nextBookmarks));
			setBookmarkSyncState(nextSyncStatus.state ?? payload.state);
			setBookmarkSyncRequiresReconnect(nextSyncStatus.requiresReconnect ?? payload.requiresReconnect ?? false);
			setBookmarkSyncMessage(
				`Synced X bookmarks. Imported ${payload.importedCount} new bookmark${payload.importedCount === 1 ? "" : "s"}.`,
			);
		} catch (error) {
			setBookmarkSyncMessage(error instanceof Error ? error.message : "Unexpected network failure while syncing bookmarks.");
		} finally {
			setIsSyncingBookmarks(false);
		}
	}

	async function updateSelectedBookmarkTags(): Promise<void> {
		if (!selectedBookmark) {
			return;
		}

		const parsedTags = parseBookmarkTags(panelTagsInput);
		const validationError = validateBookmarkTags(parsedTags);
		if (validationError) {
			setPanelErrorMessage(validationError);
			setPanelSuccessMessage(null);
			return;
		}

		setIsUpdatingTags(true);
		setPanelErrorMessage(null);
		setPanelSuccessMessage(null);
		try {
			const response = await fetch("/api/bookmarks", {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					bookmarkId: selectedBookmark.id,
					tags: parsedTags,
				}),
			});
			const payload = (await response.json()) as SavedBookmark | BookmarksResponseError;
			if (!response.ok) {
				const fallbackMessage = "Unable to update tags right now.";
				const message = "error" in payload && payload.error?.message ? payload.error.message : fallbackMessage;
				setPanelErrorMessage(message);
				return;
			}

			if (!("id" in payload)) {
				setPanelErrorMessage("Unexpected response while updating tags.");
				return;
			}

			setBookmarks((current) =>
				dedupeBookmarks(current.map((bookmark) => (bookmark.id === payload.id ? payload : bookmark))),
			);
			setSelectedBookmark(payload);
			setPanelTagsInput(payload.tags.join(", "));
			setPanelSuccessMessage("Tags updated.");
		} catch (error) {
			setPanelErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while updating tags.");
		} finally {
			setIsUpdatingTags(false);
		}
	}

	async function deleteSelectedBookmark(): Promise<void> {
		if (!selectedBookmark) {
			return;
		}
		if (typeof window !== "undefined") {
			const approved = window.confirm("Delete this bookmarked tweet?");
			if (!approved) {
				return;
			}
		}

		setIsDeletingBookmark(true);
		setPanelErrorMessage(null);
		setPanelSuccessMessage(null);
		try {
			const response = await fetch("/api/bookmarks", {
				method: "DELETE",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					bookmarkId: selectedBookmark.id,
				}),
			});
			const payload = (await response.json()) as DeleteBookmarkResponseSuccess | BookmarksResponseError;
			if (!response.ok) {
				const fallbackMessage = "Unable to delete bookmark right now.";
				const message = "error" in payload && payload.error?.message ? payload.error.message : fallbackMessage;
				setPanelErrorMessage(message);
				return;
			}
			if (!("bookmarkId" in payload)) {
				setPanelErrorMessage("Unexpected response while deleting bookmark.");
				return;
			}

			setBookmarks((current) => current.filter((bookmark) => bookmark.id !== payload.bookmarkId));
			setSelectedBookmark(null);
		} catch (error) {
			setPanelErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while deleting bookmark.");
		} finally {
			setIsDeletingBookmark(false);
		}
	}

	async function createFollow(input: CreateFollowInput, successMessage: string): Promise<void> {
		setIsCreatingFollow(true);
		setFollowMessage(null);
		setPanelErrorMessage(null);
		setPanelSuccessMessage(null);
		try {
			const response = await fetch("/api/me/follows", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(input),
			});
			const payload = await readJsonResponse<BookmarksResponseError>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to save follow right now."));
			}
			setFollowSummary(await readFollowSummary());
			setFollowMessage(successMessage);
			setPanelSuccessMessage(successMessage);
		} catch (error) {
			setPanelErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while saving follow.");
		} finally {
			setIsCreatingFollow(false);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-4 border border-outline-variant/10 bg-surface md:grid-cols-[1fr_auto] md:items-end">
				<div className="p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-secondary/70">
						Open any record to inspect the full tweet, retag it, or convert it into a follow rule.
					</p>
				</div>
				<div className="grid gap-px bg-outline-variant/10 sm:grid-cols-[minmax(280px,1fr)_auto_auto]">
					<div className="bg-surface-container-low p-4">
						<label htmlFor="bookmarks-search-input" className="sr-only">
							Search bookmarks
						</label>
						<input
							id="bookmarks-search-input"
							type="search"
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="Search tweets, authors, and tags"
							className="w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-on-surface placeholder:text-secondary/35 focus:border-primary focus:outline-none"
						/>
					</div>
					<button
						id="bookmarks-export-button"
						type="button"
						disabled={isLoading || filteredBookmarks.length === 0 || isExporting}
						onClick={() => {
							void exportVisibleBookmarks();
						}}
						className="bg-surface-container-low px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isExporting ? "Exporting..." : "Export Markdown"}
					</button>
					<div className="grid grid-cols-2 gap-px bg-outline-variant/10">
						<button
							id="bookmarks-view-tile"
							type="button"
							aria-pressed={viewMode === "tile"}
							onClick={() => setViewMode("tile")}
							className={`px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] transition-colors ${
								viewMode === "tile"
									? "bg-primary-container text-on-primary-container"
									: "bg-surface-container-low text-secondary hover:text-primary"
							}`}
						>
							Tile
						</button>
						<button
							id="bookmarks-view-row"
							type="button"
							aria-pressed={viewMode === "row"}
							onClick={() => setViewMode("row")}
							className={`px-5 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] transition-colors ${
								viewMode === "row"
									? "bg-primary-container text-on-primary-container"
									: "bg-surface-container-low text-secondary hover:text-primary"
							}`}
						>
							Row
						</button>
					</div>
				</div>
			</div>

			{exportMessage ? <p className="font-body text-sm text-secondary/70">{exportMessage}</p> : null}
			{followMessage ? <p className="font-body text-sm text-on-surface-variant">{followMessage}</p> : null}
			<div className="border border-outline-variant/10 bg-surface-container-low p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">X bookmark sync</p>
						<p className="mt-2 font-body text-sm text-secondary/70">
							{bookmarkSyncRequiresReconnect
								? "Reconnect X to grant bookmark access before syncing."
								: bookmarkSyncState?.lastSyncedAt
								? `Last synced ${formatBookmarkDate(bookmarkSyncState.lastSyncedAt)} • Imported ${bookmarkSyncState.importedCount} new bookmark${
										bookmarkSyncState.importedCount === 1 ? "" : "s"
									}`
								: "Waiting for the first X bookmark sync."}
						</p>
					</div>
					<button
						id="bookmarks-sync-now-button"
						type="button"
						disabled={isSyncingBookmarks || bookmarkSyncRequiresReconnect}
						onClick={() => {
							void syncBookmarksNow();
						}}
						className="border border-outline-variant/20 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isSyncingBookmarks ? "Syncing..." : "Sync now"}
					</button>
					{bookmarkSyncRequiresReconnect ? (
						<a
							id="bookmarks-reconnect-x-link"
							href={BOOKMARK_SYNC_RECONNECT_PATH}
							className="border border-primary/30 px-4 py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary-container hover:text-on-primary-container"
						>
							Reconnect X
						</a>
					) : null}
				</div>
				{bookmarkSyncState?.mode === "initial_backfill" && bookmarkSyncState.backfillComplete === false ? (
					<p className="mt-2 font-body text-sm text-secondary/70">Backfilling older X bookmarks over future syncs.</p>
				) : null}
				{bookmarkSyncMessage ? <p className="mt-2 font-body text-sm text-secondary/70">{bookmarkSyncMessage}</p> : null}
				{bookmarkSyncState?.lastError ? (
					<p className="mt-2 font-body text-sm text-primary">{bookmarkSyncState.lastError}</p>
				) : null}
			</div>

			{tagFilterOptions.length > 0 ? (
				<div className="border border-outline-variant/10 bg-surface-container-low p-4">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div>
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">
									Tag filters
								</p>
								<p className="mt-1 font-body text-sm text-secondary/70">
									{tagFilterOptions.length} indexed tag{tagFilterOptions.length === 1 ? "" : "s"}
									{activeTagFilters.length > 0 ? ` • ${activeTagFilters.length} selected` : ""}
								</p>
							</div>
							{hiddenTagFilterCount > 0 ? (
								<button
									id="bookmarks-tag-toggle"
									type="button"
									aria-controls="bookmarks-tag-filters"
									aria-expanded={isTagFiltersExpanded}
									onClick={() => setIsTagFiltersExpanded((current) => !current)}
									className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
								>
									{isTagFiltersExpanded
										? "Show fewer tags"
										: `Show all ${tagFilterOptions.length} tags`}
								</button>
							) : null}
						</div>

						<div id="bookmarks-tag-filters" className="flex flex-wrap items-center gap-2">
							<button
								id="bookmarks-filter-all"
								type="button"
								aria-pressed={activeTagFilters.length === 0}
								onClick={() => setActiveTagFilters([])}
								className={`border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] transition-colors ${
									activeTagFilters.length === 0
										? "border-primary bg-primary/10 text-primary"
										: "border-outline-variant/20 text-secondary/80 hover:border-primary/40 hover:text-primary"
								}`}
							>
								All tags
							</button>
							{visibleTagFilterOptions.map((option) => {
								const isActive = activeTagFilters.includes(option.key);
								return (
									<button
										key={option.key}
										type="button"
										aria-pressed={isActive}
										onClick={() => {
											toggleTagFilter(option.key);
										}}
										className={`border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] transition-colors ${
											isActive
												? "border-primary bg-primary/10 text-primary"
												: "border-outline-variant/20 text-secondary/80 hover:border-primary/40 hover:text-primary"
										}`}
									>
										{option.label} ({option.count})
									</button>
								);
							})}
						</div>

						{hiddenTagFilterCount > 0 && !isTagFiltersExpanded ? (
							<p className="font-body text-sm text-secondary/60">
								+{hiddenTagFilterCount} more tag{hiddenTagFilterCount === 1 ? "" : "s"} hidden until expanded.
							</p>
						) : null}

						{followActionOptions.length > 0 ? (
							<div className="border-t border-outline-variant/10 pt-4">
								<div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
									<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">
										Follow selected tags
									</p>
									<p className="font-body text-sm text-secondary/60">
										Create subject follows only for the tags you have selected above.
									</p>
								</div>

								<div className="mt-3 flex flex-wrap items-center gap-2">
									{followActionOptions.map((option) => {
										const followed = isSubjectFollowed(followSummary, option.label);
										if (followed) {
											return (
												<span
													key={`follow-${option.key}`}
													className="border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary"
												>
													Following {option.label}
												</span>
											);
										}

										return (
											<button
												key={`follow-${option.key}`}
												type="button"
												disabled={isCreatingFollow}
												onClick={() => {
													void createFollow(
														{
															kind: "subject",
															subjectTag: option.label,
														},
														`Now following ${option.label}.`,
													);
												}}
												className="border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
											>
												Follow {option.label}
											</button>
										);
									})}
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}

			{isLoading ? (
				<div className="border border-outline-variant/10 bg-surface-container-low p-6">
					<p className="font-body text-sm text-secondary/70">Loading bookmarks...</p>
				</div>
			) : errorMessage ? (
				<p role="alert" className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface">
					{errorMessage}
				</p>
			) : bookmarks.length === 0 ? (
				<div className="border border-outline-variant/10 bg-surface-container-low p-6">
					<p className="font-body text-sm text-secondary/70">
						No bookmarks yet. Analyze a tweet and save it with tags from the dashboard.
					</p>
				</div>
			) : filteredBookmarks.length === 0 ? (
				<div className="border border-outline-variant/10 bg-surface-container-low p-6">
					<p className="font-body text-sm text-secondary/70">{emptyStateMessage}</p>
					<button
						type="button"
						onClick={() => {
							setSearchQuery("");
							setActiveTagFilters([]);
						}}
						className="mt-3 inline-flex border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
					>
						Clear Search and Filters
					</button>
				</div>
			) : (
				<div id="bookmarks-list" className={listContainerClass}>
					{filteredBookmarks.map((bookmark) => {
						const followState = buildBookmarkFollowState(bookmark, followSummary);

						return (
							<article
								key={bookmark.id}
								className={`border border-outline-variant/10 bg-surface-container-low p-5 text-left transition-colors hover:border-primary/30 hover:bg-surface-container-high ${
									viewMode === "row" ? "w-full" : ""
								}`}
							>
								<button
									type="button"
									onClick={() => setSelectedBookmark(bookmark)}
									className="w-full text-left"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex flex-wrap gap-2">
											{describeBookmarkSource(bookmark) ? (
												<span className="border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-secondary/75">
													{describeBookmarkSource(bookmark)}
												</span>
											) : null}
											{bookmark.tags.map((tag) => (
												<span
													key={tag}
													className="border border-primary/35 bg-primary/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-primary"
												>
													{tag}
												</span>
											))}
										</div>
										<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/55">
											{formatBookmarkDate(bookmark.updatedAt)}
										</span>
									</div>
									<div className="mt-4 flex items-center gap-3">
										{bookmark.authorAvatarUrl ? (
											<img
												src={bookmark.authorAvatarUrl}
												alt={`${bookmark.authorUsername} avatar`}
												className="h-9 w-9 border border-outline-variant/20 object-cover"
											/>
										) : (
											<div className="flex h-9 w-9 items-center justify-center border border-outline-variant/20 bg-surface-container-lowest font-mono text-sm font-semibold text-primary">
												{bookmarkAvatarLabel(bookmark)}
											</div>
										)}
										<p className="font-mono text-sm uppercase tracking-[0.2em] text-on-surface">@{bookmark.authorUsername}</p>
									</div>
									<p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">{truncateForPreview(bookmark.tweetText)}</p>
								</button>
								<div className="mt-4 flex flex-wrap gap-2 border-t border-outline-variant/10 pt-4">
									{followState.isCreatorFeedFollowed ? (
										<span className="border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
											Following creator
										</span>
									) : (
										<button
											type="button"
											disabled={isCreatingFollow}
											onClick={() => {
												void createFollow(
													{
														kind: "creator",
														creatorUsername: bookmark.authorUsername,
														creatorName: bookmark.authorName,
														creatorAvatarUrl: bookmark.authorAvatarUrl,
														scope: "all_feed",
													},
													`Now following @${bookmark.authorUsername}'s saved feed.`,
												);
											}}
											className="bg-primary-container px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
										>
											Follow creator
										</button>
									)}
									{bookmark.tags.slice(0, 2).map((tag) =>
										isCreatorSubjectCovered(followState, tag) ? (
											<span
												key={`${bookmark.id}-${tag}`}
												className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary/75"
											>
												Following {tag}
											</span>
										) : (
											<button
												key={`${bookmark.id}-${tag}`}
												type="button"
												disabled={isCreatingFollow}
												onClick={() => {
													void createFollow(
														{
															kind: "creator",
															creatorUsername: bookmark.authorUsername,
															creatorName: bookmark.authorName,
															creatorAvatarUrl: bookmark.authorAvatarUrl,
															scope: "subject",
															subjectTag: tag,
														},
														`Now following @${bookmark.authorUsername} for ${tag}.`,
													);
												}}
												className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-surface transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
											>
												Follow {tag}
											</button>
										),
									)}
									{bookmark.tags.length > 2 ? (
										<span className="self-center font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/50">
											+{bookmark.tags.length - 2} more tags in details
										</span>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			)}

			{selectedBookmark && typeof document !== "undefined"
				? createPortal(
					<div className="fixed inset-0 z-50 overflow-hidden">
						<button
							type="button"
							aria-label="Close bookmark details"
							onClick={() => setSelectedBookmark(null)}
							className="absolute inset-0 z-0 bg-black/70"
						/>
						<aside
							className={BOOKMARK_DETAILS_PANEL_CLASS}
							style={{ WebkitOverflowScrolling: "touch" }}
						>
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Saved tweet</p>
								<p className="mt-2 font-body text-sm text-secondary/70">Updated {formatBookmarkDate(selectedBookmark.updatedAt)}</p>
								{selectedBookmarkUrl ? (
									<a
										id="bookmark-original-link"
										href={selectedBookmarkUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="mt-3 inline-flex font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-primary underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary/80"
									>
										Original Tweet
									</a>
								) : null}
							</div>
							<button
								id="bookmark-panel-close"
								type="button"
								onClick={() => setSelectedBookmark(null)}
								className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
							>
								Close
							</button>
						</div>
						<div className="mt-6 flex items-center gap-3">
							{selectedBookmark.authorAvatarUrl ? (
								<img
									src={selectedBookmark.authorAvatarUrl}
									alt={`${selectedBookmark.authorUsername} avatar`}
									className="h-10 w-10 border border-outline-variant/20 object-cover"
								/>
							) : (
								<div className="flex h-10 w-10 items-center justify-center border border-outline-variant/20 bg-surface-container-lowest font-mono text-sm font-semibold text-primary">
									{bookmarkAvatarLabel(selectedBookmark)}
								</div>
							)}
							<div>
								<p className="font-mono text-sm uppercase tracking-[0.2em] text-on-surface">
									{selectedBookmark.authorName ?? selectedBookmark.authorUsername}
								</p>
								<p className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/60">@{selectedBookmark.authorUsername}</p>
							</div>
						</div>
						<p className="mt-5 whitespace-pre-wrap font-body text-sm leading-7 text-on-surface-variant">{selectedBookmark.tweetText}</p>
						{selectedBookmark.thread && selectedBookmark.thread.tweets.length > 1 ? (
							<div className="mt-6 border border-outline-variant/10 bg-surface-container-low p-4">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">
									Thread ({selectedBookmark.thread.tweets.length} posts)
								</p>
								<div className="mt-4 flex flex-col gap-4">
									{selectedBookmark.thread.tweets.map((tweet, index) => (
										<div
											key={`${selectedBookmark.id}-thread-${tweet.id}`}
											className="border border-outline-variant/10 bg-surface-container-lowest p-4"
										>
											<p className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/60">
												Post {index + 1}
											</p>
											<p className="mt-3 whitespace-pre-wrap font-body text-sm leading-7 text-on-surface-variant">
												{tweet.text}
											</p>
										</div>
									))}
								</div>
							</div>
						) : null}
						<div className="mt-5 flex flex-wrap gap-2">
							{selectedBookmark.tags.map((tag) => (
								<span key={tag} className="border border-primary/35 bg-primary/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
									{tag}
								</span>
							))}
						</div>
						{(() => {
							const selectedBookmarkFollowState = buildBookmarkFollowState(selectedBookmark, followSummary);
							return (
								<div className="mt-6 border border-outline-variant/10 bg-surface-container-low p-4">
									<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">Follow from this bookmark</p>
									<div className="mt-3 flex flex-wrap gap-2">
										{selectedBookmarkFollowState.isCreatorFeedFollowed ? (
											<span
												id="bookmark-follow-creator-button"
												className="inline-flex items-center justify-center border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary"
											>
												Following creator feed
											</span>
										) : (
											<button
												id="bookmark-follow-creator-button"
												type="button"
												disabled={isCreatingFollow || isUpdatingTags || isDeletingBookmark}
												onClick={() => {
													void createFollow(
														{
															kind: "creator",
															creatorUsername: selectedBookmark.authorUsername,
															creatorName: selectedBookmark.authorName,
															creatorAvatarUrl: selectedBookmark.authorAvatarUrl,
															scope: "all_feed",
														},
														`Now following @${selectedBookmark.authorUsername}'s saved feed.`,
													);
												}}
												className="inline-flex items-center justify-center bg-primary-container px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
											>
												{isCreatingFollow ? "Saving..." : "Follow Creator Feed"}
											</button>
										)}
										{selectedBookmark.tags.map((tag) =>
											isCreatorSubjectCovered(selectedBookmarkFollowState, tag) ? (
												<span
													key={`bookmark-follow-creator-${tag}`}
													className="inline-flex items-center justify-center border border-outline-variant/20 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary/75"
												>
													Following @{selectedBookmark.authorUsername} for {tag}
												</span>
											) : (
												<button
													key={`bookmark-follow-creator-${tag}`}
													type="button"
													disabled={isCreatingFollow || isUpdatingTags || isDeletingBookmark}
													onClick={() => {
														void createFollow(
															{
																kind: "creator",
																creatorUsername: selectedBookmark.authorUsername,
																creatorName: selectedBookmark.authorName,
																creatorAvatarUrl: selectedBookmark.authorAvatarUrl,
																scope: "subject",
																subjectTag: tag,
															},
															`Now following @${selectedBookmark.authorUsername} for ${tag}.`,
														);
													}}
													className="inline-flex items-center justify-center border border-outline-variant/20 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-surface transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
												>
													Follow @{selectedBookmark.authorUsername} for {tag}
												</button>
											),
										)}
										{selectedBookmark.tags.map((tag) =>
											isSubjectFollowed(followSummary, tag) ? (
												<span
													key={`bookmark-follow-subject-${tag}`}
													className="inline-flex items-center justify-center border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary"
												>
													Following Subject {tag}
												</span>
											) : (
												<button
													key={`bookmark-follow-subject-${tag}`}
													type="button"
													disabled={isCreatingFollow || isUpdatingTags || isDeletingBookmark}
													onClick={() => {
														void createFollow(
															{
																kind: "subject",
																subjectTag: tag,
															},
															`Now following ${tag}.`,
														);
													}}
													className="inline-flex items-center justify-center border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
												>
													Follow Subject {tag}
												</button>
											),
										)}
									</div>
								</div>
							);
						})()}
						<div id="bookmark-tags-editor" className="mt-6 border border-outline-variant/10 bg-surface-container-low p-4">
							<label htmlFor="bookmark-tags-edit-input" className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
								Edit Tags
							</label>
							<input
								id="bookmark-tags-edit-input"
								type="text"
								value={panelTagsInput}
								onChange={(event) => {
									setPanelTagsInput(event.target.value);
									setPanelSuccessMessage(null);
								}}
								placeholder="strategy, growth, writing"
								className="mt-3 w-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-on-surface placeholder:text-secondary/35 focus:border-primary focus:outline-none"
							/>
							<div className="mt-3 flex flex-col gap-2 sm:flex-row">
								<button
									id="bookmark-update-tags-button"
									type="button"
									onClick={() => {
										void updateSelectedBookmarkTags();
									}}
									disabled={isUpdatingTags || isDeletingBookmark || isCreatingFollow}
									className="inline-flex items-center justify-center bg-primary-container px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{isUpdatingTags ? "Saving..." : "Save Tags"}
								</button>
								<button
									id="bookmark-delete-button"
									type="button"
									onClick={() => {
										void deleteSelectedBookmark();
									}}
									disabled={isDeletingBookmark || isUpdatingTags || isCreatingFollow}
									className="inline-flex items-center justify-center border border-outline-variant/20 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-surface transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
								>
									{isDeletingBookmark ? "Deleting..." : "Delete Tweet"}
								</button>
							</div>
							{panelErrorMessage ? (
								<p role="alert" className="mt-3 border border-primary/30 bg-primary/10 px-3 py-2 font-body text-xs text-on-surface">
									{panelErrorMessage}
								</p>
							) : null}
							{panelSuccessMessage ? <p className="mt-3 font-body text-xs text-on-surface-variant">{panelSuccessMessage}</p> : null}
						</div>
						<a
							href={selectedBookmarkUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-7 inline-flex bg-primary-container px-5 py-3 font-mono text-sm font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110"
						>
							Open on X
						</a>
						</aside>
					</div>,
					document.body,
				)
				: null}
		</div>
	);
}
