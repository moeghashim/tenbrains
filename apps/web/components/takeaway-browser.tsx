"use client";

import type {
	AccountTakeawaySnapshot,
	TakeawayFollow,
	TakeawayHistoryResponse,
	TakeawayWorkspaceResponse,
} from "@tenbrains/contracts";
import React, { useEffect, useState } from "react";

import {
	type ApiErrorPayload,
	readJsonResponse,
	readResponseErrorMessage,
} from "../src/http/read-json-response.js";

function formatDate(timestamp: number | undefined): string {
	if (!timestamp) {
		return "Not refreshed yet";
	}
	return new Date(timestamp).toLocaleString();
}

function accountLabel(follow: TakeawayFollow): string {
	return follow.accountName?.trim() || `@${follow.accountUsername}`;
}

function buildPostUrl(snapshot: AccountTakeawaySnapshot, post: AccountTakeawaySnapshot["posts"][number]): string {
	return `https://x.com/${snapshot.accountUsername}/status/${post.id}`;
}

export function TakeawayBrowser() {
	const [follows, setFollows] = useState<TakeawayFollow[]>([]);
	const [selectedFollowId, setSelectedFollowId] = useState("");
	const [history, setHistory] = useState<TakeawayHistoryResponse | null>(null);
	const [accountInput, setAccountInput] = useState("");
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
	const [isHistoryLoading, setIsHistoryLoading] = useState(false);
	const [isSavingFollow, setIsSavingFollow] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	const selectedFollow = follows.find((follow) => follow.id === selectedFollowId) ?? null;
	const latestSnapshot = history?.latest;

	async function loadWorkspace(preferredFollowId?: string): Promise<void> {
		setIsWorkspaceLoading(true);
		setErrorMessage(null);
		try {
			const response = await fetch("/api/me/takeaway-follows", {
				method: "GET",
				headers: { "content-type": "application/json" },
			});
			const payload = await readJsonResponse<TakeawayWorkspaceResponse | ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to load takeaway follows."));
			}
			if (!payload || !("follows" in payload)) {
				throw new Error("Unexpected takeaway follow response.");
			}

			setFollows(payload.follows);
			const nextSelected =
				payload.follows.find((follow) => follow.id === preferredFollowId)?.id ??
				payload.follows.find((follow) => follow.id === selectedFollowId)?.id ??
				payload.follows[0]?.id ??
				"";
			setSelectedFollowId(nextSelected);
			if (!nextSelected) {
				setHistory(null);
			}
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected takeaway workspace failure.");
			setFollows([]);
			setSelectedFollowId("");
			setHistory(null);
		} finally {
			setIsWorkspaceLoading(false);
		}
	}

	async function loadHistory(followId: string): Promise<void> {
		if (!followId) {
			setHistory(null);
			return;
		}
		setIsHistoryLoading(true);
		setErrorMessage(null);
		try {
			const url = new URL("/api/me/takeaways", window.location.origin);
			url.searchParams.set("followId", followId);
			const response = await fetch(url.toString(), {
				method: "GET",
				headers: { "content-type": "application/json" },
			});
			const payload = await readJsonResponse<TakeawayHistoryResponse | ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to load takeaway history."));
			}
			if (!payload || !("history" in payload)) {
				throw new Error("Unexpected takeaway history response.");
			}
			setHistory(payload);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected takeaway history failure.");
			setHistory(null);
		} finally {
			setIsHistoryLoading(false);
		}
	}

	async function refreshFollow(followId: string): Promise<void> {
		if (!followId) {
			return;
		}
		setIsRefreshing(true);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			const response = await fetch("/api/me/takeaways", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ followId }),
			});
			const payload = await readJsonResponse<{ deduped: boolean } | ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to refresh takeaway."));
			}
			setStatusMessage("Takeaway refreshed.");
			await Promise.all([loadWorkspace(followId), loadHistory(followId)]);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected takeaway refresh failure.");
		} finally {
			setIsRefreshing(false);
		}
	}

	async function submitFollow(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		setIsSavingFollow(true);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			const response = await fetch("/api/me/takeaway-follows", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ accountUsername: accountInput }),
			});
			const payload = await readJsonResponse<TakeawayFollow | ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to follow account."));
			}
			if (!payload || !("id" in payload)) {
				throw new Error("Unexpected takeaway follow response.");
			}
			setAccountInput("");
			setStatusMessage(`Now following @${payload.accountUsername}.`);
			await loadWorkspace(payload.id);
			await refreshFollow(payload.id);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected takeaway follow failure.");
		} finally {
			setIsSavingFollow(false);
		}
	}

	async function deleteFollow(followId: string): Promise<void> {
		setPendingDeleteId(followId);
		setErrorMessage(null);
		setStatusMessage(null);
		try {
			const response = await fetch("/api/me/takeaway-follows", {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ followId }),
			});
			const payload = await readJsonResponse<ApiErrorPayload>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to delete takeaway follow."));
			}
			setStatusMessage("Takeaway follow removed.");
			await loadWorkspace(selectedFollowId === followId ? undefined : selectedFollowId);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected takeaway delete failure.");
		} finally {
			setPendingDeleteId(null);
		}
	}

	useEffect(() => {
		void loadWorkspace();
	}, []);

	useEffect(() => {
		if (!selectedFollowId) {
			setHistory(null);
			return;
		}
		void loadHistory(selectedFollowId);
	}, [selectedFollowId]);

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-px border border-outline-variant/10 bg-outline-variant/10 lg:grid-cols-3">
				<div className="bg-surface p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">Tracked accounts</p>
					<p className="mt-4 font-headline text-5xl uppercase tracking-[-0.04em] text-on-surface">{follows.length}</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						Each followed account gets one takeaway snapshot per day.
					</p>
				</div>
				<div className="bg-surface-container-low p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">History</p>
					<p className="mt-4 font-headline text-5xl uppercase tracking-[-0.04em] text-on-surface">
						{history?.history.length ?? 0}
					</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						The latest snapshot is default, with older daily snapshots available below.
					</p>
				</div>
				<div className="bg-surface p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-secondary/70">Latest refresh</p>
					<p className="mt-4 font-headline text-2xl uppercase tracking-[-0.04em] text-on-surface">
						{selectedFollow ? formatDate(selectedFollow.lastRefreshedAt) : "Select an account"}
					</p>
					<p className="mt-3 max-w-sm font-body text-sm leading-7 text-on-surface-variant">
						Refreshes dedupe within the same UTC day to keep history clean.
					</p>
				</div>
			</div>

			{errorMessage ? (
				<p role="alert" className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface">
					{errorMessage}
				</p>
			) : null}
			{statusMessage ? (
				<p className="border border-outline-variant/10 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
					{statusMessage}
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
				<section className="border border-outline-variant/10 bg-surface p-6">
					<div className="border-b border-outline-variant/10 pb-4">
						<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Account intake</p>
						<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">Follow account</h2>
					</div>
					<form onSubmit={(event) => void submitFollow(event)} className="mt-6 flex flex-col gap-3">
						<label htmlFor="takeaway-account-input" className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">
							X username
						</label>
						<input
							id="takeaway-account-input"
							value={accountInput}
							onChange={(event) => setAccountInput(event.target.value)}
							placeholder="@ctatedev"
							className="border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface outline-none transition-colors focus:border-primary"
						/>
						<button
							type="submit"
							disabled={isSavingFollow || accountInput.trim().length === 0}
							className="inline-flex justify-center bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isSavingFollow ? "Saving..." : "Follow and refresh"}
						</button>
					</form>

					<div className="mt-8 border-t border-outline-variant/10 pt-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Accounts</p>
						{isWorkspaceLoading ? (
							<p className="mt-4 font-body text-sm text-on-surface-variant">Loading tracked accounts...</p>
						) : follows.length === 0 ? (
							<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
								Follow an account to start generating daily takeaways from recent posts.
							</p>
						) : (
							<div className="mt-4 flex flex-col gap-3">
								{follows.map((follow) => {
									const isActive = follow.id === selectedFollowId;
									return (
										<div
											key={follow.id}
											className={`border p-4 transition-colors ${
												isActive
													? "border-primary bg-primary/10"
													: "border-outline-variant/10 bg-surface-container-low hover:border-primary/30"
											}`}
										>
											<button
												type="button"
												onClick={() => setSelectedFollowId(follow.id)}
												className="w-full text-left"
											>
												<p className="font-headline text-xl uppercase tracking-[-0.03em] text-on-surface">
													{accountLabel(follow)}
												</p>
												<p className="mt-2 font-body text-sm text-on-surface-variant">@{follow.accountUsername}</p>
												<p className="mt-2 font-body text-xs uppercase tracking-[0.18em] text-secondary/70">
													{follow.lastRefreshStatus} • {formatDate(follow.lastRefreshedAt)}
												</p>
											</button>
											<div className="mt-4 flex items-center gap-3">
												<button
													type="button"
													onClick={() => void refreshFollow(follow.id)}
													disabled={isRefreshing && isActive}
													className="bg-primary-container px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container disabled:cursor-not-allowed disabled:opacity-60"
												>
													{isRefreshing && isActive ? "Refreshing..." : "Refresh"}
												</button>
												<button
													type="button"
													onClick={() => void deleteFollow(follow.id)}
													disabled={pendingDeleteId === follow.id}
													className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-60"
												>
													{pendingDeleteId === follow.id ? "Deleting..." : "Delete"}
												</button>
											</div>
											{follow.lastRefreshError ? (
												<p className="mt-3 font-body text-xs leading-6 text-primary">{follow.lastRefreshError}</p>
											) : null}
										</div>
									);
								})}
							</div>
						)}
					</div>
				</section>

				<section className="border border-outline-variant/10 bg-surface p-6">
					<div className="border-b border-outline-variant/10 pb-4">
						<p className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">Takeaway</p>
						<h2 className="mt-3 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">
							{selectedFollow ? `@${selectedFollow.accountUsername}` : "Select an account"}
						</h2>
					</div>

					{isHistoryLoading ? (
						<p className="mt-6 font-body text-sm text-on-surface-variant">Loading takeaway history...</p>
					) : !selectedFollow ? (
						<p className="mt-6 font-body text-sm leading-7 text-on-surface-variant">
							Choose a followed account to inspect its latest takeaway and evidence posts.
						</p>
					) : !latestSnapshot ? (
						<div className="mt-6 border border-outline-variant/10 bg-surface-container-low p-5">
							<p className="font-body text-sm leading-7 text-on-surface-variant">
								No takeaway snapshot exists yet for @{selectedFollow.accountUsername}.
							</p>
							<button
								type="button"
								onClick={() => void refreshFollow(selectedFollow.id)}
								disabled={isRefreshing}
								className="mt-4 bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isRefreshing ? "Refreshing..." : "Create first takeaway"}
							</button>
						</div>
					) : (
						<div className="mt-6 flex flex-col gap-6">
							<div className="border border-outline-variant/10 bg-surface-container-low p-5">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">
									{latestSnapshot.snapshotDateKey} • {latestSnapshot.sampleSize} posts
								</p>
								<p className="mt-4 font-body text-sm leading-7 text-on-surface">{latestSnapshot.summary}</p>
								<ul className="mt-4 space-y-3">
									{latestSnapshot.takeaways.map((takeaway) => (
										<li key={takeaway} className="border-l border-primary pl-4 font-body text-sm leading-7 text-on-surface-variant">
											{takeaway}
										</li>
									))}
								</ul>
							</div>

							<div>
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">Source posts</p>
								<div className="mt-4 grid gap-3">
									{latestSnapshot.posts.map((post) => (
										<a
											key={post.id}
											href={buildPostUrl(latestSnapshot, post)}
											target="_blank"
											rel="noreferrer"
											className="border border-outline-variant/10 bg-surface-container-low p-4 transition-colors hover:border-primary/30"
										>
											<p className="font-body text-sm leading-7 text-on-surface">{post.text}</p>
											<p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-secondary/70">
												{post.createdAt ? new Date(post.createdAt).toLocaleString() : `Post ${post.id}`}
											</p>
										</a>
									))}
								</div>
							</div>

							<div>
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">History</p>
								<div className="mt-4 grid gap-3 md:grid-cols-2">
									{history?.history.map((snapshot) => (
										<div key={snapshot.id} className="border border-outline-variant/10 bg-surface-container-low p-4">
											<p className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary/70">
												{snapshot.snapshotDateKey}
											</p>
											<p className="mt-3 font-body text-sm leading-7 text-on-surface-variant">{snapshot.summary}</p>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
