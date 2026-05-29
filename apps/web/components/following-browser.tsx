"use client";

import type {
	CreateFollowInput,
	CreatorFollow,
	FollowSuggestionsResponse,
	FollowSummary,
	FollowingFeedItem,
	FollowingFeedResponse,
	SubjectFollow,
	SuggestedCreator,
} from "@tenbrains/contracts";
import React, { useEffect, useState } from "react";
import {
	type ApiErrorPayload,
	readJsonResponse,
	readResponseErrorMessage,
} from "../src/http/read-json-response.js";

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function avatarLabel(name: string | undefined, username: string): string {
	const firstCharacter = (name ?? username).trim().charAt(0);
	return firstCharacter.length > 0 ? firstCharacter.toUpperCase() : "X";
}

function buildAvailableSubjects(creatorFollows: CreatorFollow[], subjectFollows: SubjectFollow[]): string[] {
	const byKey = new Map<string, string>();
	for (const follow of subjectFollows) {
		byKey.set(follow.subjectTag.trim().toLowerCase(), follow.subjectTag);
	}
	for (const follow of creatorFollows) {
		if (!follow.subjectTag) {
			continue;
		}
		const key = follow.subjectTag.trim().toLowerCase();
		if (!byKey.has(key)) {
			byKey.set(key, follow.subjectTag);
		}
	}
	return Array.from(byKey.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function describeMatch(item: FollowingFeedItem): string {
	const labels = item.matches.map((match) => {
		if (match.type === "creator_all_feed") {
			return `Creator @${match.creatorUsername}`;
		}
		if (match.type === "creator_subject") {
			return `Creator @${match.creatorUsername} + ${match.subjectTag}`;
		}
		return `Subject ${match.subjectTag}`;
	});
	return labels.join(" • ");
}

function bookmarkUrl(item: FollowingFeedItem): string {
	return item.tweetUrlOrId.startsWith("http") ? item.tweetUrlOrId : `https://x.com/i/web/status/${item.tweetId}`;
}

export function FollowingBrowser() {
	const [creatorFollows, setCreatorFollows] = useState<CreatorFollow[]>([]);
	const [subjectFollows, setSubjectFollows] = useState<SubjectFollow[]>([]);
	const [feedItems, setFeedItems] = useState<FollowingFeedItem[]>([]);
	const [selectedSubject, setSelectedSubject] = useState("");
	const [suggestions, setSuggestions] = useState<SuggestedCreator[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
	const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	const availableSubjects = buildAvailableSubjects(creatorFollows, subjectFollows);

	async function loadWorkspace(): Promise<void> {
		setIsLoading(true);
		setErrorMessage(null);
		try {
			const [followsResponse, feedResponse] = await Promise.all([
				fetch("/api/me/follows", { method: "GET", headers: { "content-type": "application/json" } }),
				fetch("/api/me/following-feed", { method: "GET", headers: { "content-type": "application/json" } }),
			]);
			const [followsPayload, feedPayload] = await Promise.all([
				readJsonResponse<FollowSummary | ApiErrorPayload>(followsResponse),
				readJsonResponse<FollowingFeedResponse | ApiErrorPayload>(feedResponse),
			]);

			if (!followsResponse.ok) {
				throw new Error(readResponseErrorMessage(followsPayload, "Unable to load follows."));
			}
			if (!feedResponse.ok) {
				throw new Error(readResponseErrorMessage(feedPayload, "Unable to load following feed."));
			}
			if (
				!followsPayload ||
				!("creatorFollows" in followsPayload) ||
				!feedPayload ||
				!("bookmarks" in feedPayload)
			) {
				throw new Error("Unexpected follow response.");
			}

			setCreatorFollows(followsPayload.creatorFollows);
			setSubjectFollows(followsPayload.subjectFollows);
			setFeedItems(feedPayload.bookmarks);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected follow load failure.");
			setCreatorFollows([]);
			setSubjectFollows([]);
			setFeedItems([]);
		} finally {
			setIsLoading(false);
		}
	}

	async function saveFollow(input: CreateFollowInput, successMessage: string, actionKey: string): Promise<void> {
		setPendingActionKey(actionKey);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			const response = await fetch("/api/me/follows", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			});
			const payload = await readJsonResponse<ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to save follow."));
			}
			setStatusMessage(successMessage);
			await loadWorkspace();
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected follow save failure.");
		} finally {
			setPendingActionKey(null);
		}
	}

	async function removeFollow(
		input: { kind: "creator" | "subject"; followId: string },
		successMessage: string,
		actionKey: string,
	): Promise<void> {
		setPendingActionKey(actionKey);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			const response = await fetch("/api/me/follows", {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(input),
			});
			const payload = await readJsonResponse<ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to delete follow."));
			}
			setStatusMessage(successMessage);
			await loadWorkspace();
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected follow delete failure.");
		} finally {
			setPendingActionKey(null);
		}
	}

	useEffect(() => {
		void loadWorkspace();
	}, []);

	useEffect(() => {
		if (availableSubjects.includes(selectedSubject)) {
			return;
		}
		setSelectedSubject(availableSubjects[0] ?? "");
	}, [availableSubjects, selectedSubject]);

	useEffect(() => {
		if (!selectedSubject) {
			setSuggestions([]);
			return;
		}

		let isCancelled = false;
		async function loadSuggestions(): Promise<void> {
			setIsSuggestionsLoading(true);
			try {
				const url = new URL("/api/me/follows/suggestions", window.location.origin);
				url.searchParams.set("subjectTag", selectedSubject);
				const response = await fetch(url.toString(), {
					method: "GET",
					headers: { "content-type": "application/json" },
				});
				const payload = await readJsonResponse<FollowSuggestionsResponse | ApiErrorPayload>(response);
				if (!response.ok) {
					throw new Error(readResponseErrorMessage(payload, "Unable to load creator suggestions."));
				}
				if (!payload || !("suggestions" in payload)) {
					throw new Error("Unexpected suggestions response.");
				}
				if (!isCancelled) {
					setSuggestions(payload.suggestions);
				}
			} catch (error) {
				if (!isCancelled) {
					setSuggestions([]);
					setErrorMessage(error instanceof Error ? error.message : "Unexpected suggestions failure.");
				}
			} finally {
				if (!isCancelled) {
					setIsSuggestionsLoading(false);
				}
			}
		}

		void loadSuggestions();
		return () => {
			isCancelled = true;
		};
	}, [selectedSubject]);

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-px border border-outline-variant/10 bg-outline-variant/10 lg:grid-cols-3">
				<div className="bg-surface p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">Creator follows</p>
					<p className="mt-4 font-headline text-5xl uppercase tracking-[-0.04em] text-on-surface">{creatorFollows.length}</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						Blend whole-creator follows with subject-specific creator threads.
					</p>
				</div>
				<div className="bg-surface-container-low p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">Subjects</p>
					<p className="mt-4 font-headline text-5xl uppercase tracking-[-0.04em] text-on-surface">{subjectFollows.length}</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						Subjects reuse your bookmark tags as the follow taxonomy.
					</p>
				</div>
				<div className="bg-surface p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">Matched posts</p>
					<p className="mt-4 font-headline text-5xl uppercase tracking-[-0.04em] text-on-surface">{feedItems.length}</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						The feed is assembled from saved bookmarks and the follow rules active right now.
					</p>
				</div>
			</div>

			{errorMessage ? (
				<p
					role="alert"
					className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface"
				>
					{errorMessage}
				</p>
			) : null}
			{statusMessage ? (
				<p className="border border-outline-variant/10 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
					{statusMessage}
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
				<section className="border border-outline-variant/10 bg-surface p-6">
					<div className="border-b border-outline-variant/10 pb-4">
						<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Subjects</p>
						<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">Followed subjects</h2>
					</div>
					{isLoading ? (
						<p className="mt-6 font-body text-sm text-on-surface-variant">Loading follows...</p>
					) : availableSubjects.length === 0 ? (
						<div className="mt-6 border border-outline-variant/10 bg-surface-container-low p-5">
							<p className="font-body text-sm leading-7 text-on-surface-variant">
								Follow a subject from a bookmark tag to unlock creator suggestions for that thread.
							</p>
							<a
								href="/app/bookmarks"
								className="mt-4 inline-flex bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container transition-transform hover:scale-[1.02]"
							>
								Open bookmarks
							</a>
						</div>
					) : (
						<div className="mt-6 grid gap-3 md:grid-cols-2">
							{availableSubjects.map((subjectTag) => {
								const active = subjectTag === selectedSubject;
								const directSubjectFollow = subjectFollows.find(
									(follow) => follow.subjectTag.trim().toLowerCase() === subjectTag.trim().toLowerCase(),
								);
								const actionKey = directSubjectFollow
									? `delete-subject-${directSubjectFollow.id}`
									: `select-subject-${subjectTag}`;

								return (
									<div
										key={subjectTag}
										className={`border p-4 transition-colors ${
											active
												? "border-primary bg-primary/10"
												: "border-outline-variant/10 bg-surface-container-low hover:border-primary/30"
										}`}
									>
										<button
											type="button"
											onClick={() => setSelectedSubject(subjectTag)}
											className="font-headline text-left text-xl uppercase tracking-[-0.02em] text-on-surface"
										>
											{subjectTag}
										</button>
										<p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
											{directSubjectFollow ? "Direct subject follow" : "Referenced by creator-specific follow"}
										</p>
										<div className="mt-4 flex items-center gap-3">
											<span className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">
												{active ? "Selected" : "Available"}
											</span>
											{directSubjectFollow ? (
												<button
													type="button"
													disabled={pendingActionKey === actionKey}
													onClick={() => {
														void removeFollow(
															{ kind: "subject", followId: directSubjectFollow.id },
															`Removed ${subjectTag} subject follow.`,
															actionKey,
														);
													}}
													className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
												>
													{pendingActionKey === actionKey ? "Removing..." : "Remove"}
												</button>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				<section className="border border-outline-variant/10 bg-surface-container-low p-6">
					<div className="border-b border-outline-variant/10 pb-4">
						<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Suggestions</p>
						<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">
							{selectedSubject ? `Creator suggestions for ${selectedSubject}` : "Creator suggestions"}
						</h2>
					</div>
					{!selectedSubject ? (
						<div className="mt-6 border border-outline-variant/10 bg-surface p-5">
							<p className="font-body text-sm leading-7 text-on-surface-variant">
								Select a followed subject to see recommended creators.
							</p>
							<a
								href="/app/bookmarks"
								className="mt-4 inline-flex border border-outline-variant/20 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
							>
								Follow from bookmarks
							</a>
						</div>
					) : isSuggestionsLoading ? (
						<p className="mt-6 font-body text-sm text-on-surface-variant">Loading suggestions...</p>
					) : suggestions.length === 0 ? (
						<div className="mt-6 border border-outline-variant/10 bg-surface p-5">
							<p className="font-body text-sm leading-7 text-on-surface-variant">
								No suggestion candidates yet. Save more bookmarks for {selectedSubject} or follow creators directly from bookmarks.
							</p>
							<a
								href="/app/bookmarks"
								className="mt-4 inline-flex border border-outline-variant/20 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
							>
								Review tagged bookmarks
							</a>
						</div>
					) : (
						<div className="mt-6 space-y-3">
							{suggestions.map((suggestion) => {
								const actionKey = `suggestion-${suggestion.creatorUsername}-${suggestion.subjectTag}`;
								return (
									<div key={actionKey} className="border border-outline-variant/10 bg-surface p-4">
										<div className="flex items-start justify-between gap-4">
											<div>
												<p className="font-headline text-2xl uppercase tracking-[-0.03em] text-on-surface">
													@{suggestion.creatorUsername}
												</p>
												<p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
													{suggestion.creatorName ?? "Saved creator"} • {suggestion.bookmarkCount} matching bookmark
													{suggestion.bookmarkCount === 1 ? "" : "s"}
												</p>
											</div>
											<button
												type="button"
												disabled={pendingActionKey === actionKey}
												onClick={() => {
													void saveFollow(
														{
															kind: "creator",
															creatorUsername: suggestion.creatorUsername,
															creatorName: suggestion.creatorName,
															creatorAvatarUrl: suggestion.creatorAvatarUrl,
															scope: "subject",
															subjectTag: suggestion.subjectTag,
														},
														`Now following @${suggestion.creatorUsername} for ${suggestion.subjectTag}.`,
														actionKey,
													);
												}}
												className="bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
											>
												{pendingActionKey === actionKey ? "Saving..." : "Follow subject"}
											</button>
										</div>
										<p className="mt-4 font-mono text-[11px] uppercase tracking-[0.26em] text-secondary/70">
											Most recent match: {formatDate(suggestion.latestBookmarkAt)}
										</p>
									</div>
								);
							})}
						</div>
					)}
				</section>
			</div>

			<section className="border border-outline-variant/10 bg-surface p-6">
				<div className="border-b border-outline-variant/10 pb-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Creator follows</p>
					<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">Creator follows</h2>
				</div>
				{isLoading ? (
					<p className="mt-6 font-body text-sm text-on-surface-variant">Loading creator follows...</p>
				) : creatorFollows.length === 0 ? (
					<div className="mt-6 border border-outline-variant/10 bg-surface-container-low p-5">
						<p className="font-body text-sm leading-7 text-on-surface-variant">
							No creator follows yet. Start from a bookmark and follow the creator feed or a specific subject thread.
						</p>
						<a
							href="/app/bookmarks"
							className="mt-4 inline-flex bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container transition-transform hover:scale-[1.02]"
						>
							Find creators in bookmarks
						</a>
					</div>
				) : (
					<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
						{creatorFollows.map((follow) => {
							const actionKey = `creator-follow-${follow.id}`;
							return (
								<div key={follow.id} className="border border-outline-variant/10 bg-surface-container-low p-5">
									<div className="flex items-center gap-4">
										{follow.creatorAvatarUrl ? (
											<img
												src={follow.creatorAvatarUrl}
												alt={`${follow.creatorUsername} avatar`}
												className="h-12 w-12 border border-outline-variant/20 object-cover"
											/>
										) : (
											<div className="flex h-12 w-12 items-center justify-center border border-outline-variant/20 bg-surface font-mono text-sm font-semibold uppercase text-primary">
												{avatarLabel(follow.creatorName, follow.creatorUsername)}
											</div>
										)}
										<div className="min-w-0">
											<p className="font-headline text-2xl uppercase tracking-[-0.03em] text-on-surface">
												@{follow.creatorUsername}
											</p>
											<p className="mt-1 font-body text-sm leading-6 text-on-surface-variant">
												{follow.creatorName ?? "Saved creator"} •{" "}
												{follow.scope === "all_feed" ? "Entire saved feed" : `Subject: ${follow.subjectTag}`}
											</p>
										</div>
									</div>
									<div className="mt-4 flex flex-wrap items-center justify-between gap-4">
										<p className="font-mono text-[11px] uppercase tracking-[0.26em] text-secondary/70">
											Updated {formatDate(follow.updatedAt)}
										</p>
										<button
											type="button"
											disabled={pendingActionKey === actionKey}
											onClick={() => {
												void removeFollow(
													{ kind: "creator", followId: follow.id },
													`Removed @${follow.creatorUsername} from following.`,
													actionKey,
												);
											}}
											className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
										>
											{pendingActionKey === actionKey ? "Removing..." : "Remove follow"}
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</section>

			<section className="border border-outline-variant/10 bg-surface-container-low p-6">
				<div className="border-b border-outline-variant/10 pb-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Feed</p>
					<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">Matched saved posts</h2>
				</div>
				{isLoading ? (
					<p className="mt-6 font-body text-sm text-on-surface-variant">Loading following feed...</p>
				) : feedItems.length === 0 ? (
					<div className="mt-6 border border-outline-variant/10 bg-surface p-5">
						<p className="font-body text-sm leading-7 text-on-surface-variant">
							No saved posts match your current follows yet. Save more bookmarks or broaden a creator to the full feed.
						</p>
						<a
							href="/app/bookmarks"
							className="mt-4 inline-flex border border-outline-variant/20 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
						>
							Add more bookmarks
						</a>
					</div>
				) : (
					<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
						{feedItems.map((item) => (
							<article key={item.id} className="border border-outline-variant/10 bg-surface p-5">
								<div className="flex flex-wrap items-center gap-2">
									{item.tags.map((tag) => (
										<span
											key={tag}
											className="border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-primary"
										>
											{tag}
										</span>
									))}
								</div>
								<div className="mt-4 flex items-start justify-between gap-4">
									<div>
										<p className="font-headline text-2xl uppercase tracking-[-0.03em] text-on-surface">
											@{item.authorUsername}
										</p>
										<p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">{describeMatch(item)}</p>
									</div>
									<p className="font-mono text-[11px] uppercase tracking-[0.24em] text-secondary/60">
										{formatDate(item.updatedAt)}
									</p>
								</div>
								<p className="mt-5 font-body text-sm leading-7 text-on-surface">{item.tweetText}</p>
								<a
									href={bookmarkUrl(item)}
									target="_blank"
									rel="noopener noreferrer"
									className="mt-5 inline-flex border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
								>
									Open on X
								</a>
							</article>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
