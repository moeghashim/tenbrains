"use client";

import { PROVIDER_OPTIONS, getProviderCatalogEntry, resolveProviderCatalogModel } from "@tenbrains/ai";
import { parseBookmarkTags, validateBookmarkTags } from "@tenbrains/contracts/bookmark-tags";
import { renderAnalyzeTweetMarkdown } from "@tenbrains/contracts";
import type {
	AnalyzeTweetResult,
	CreateFollowInput,
	FollowSummary,
	ProviderId,
	SavedBookmark,
} from "@tenbrains/contracts";
import type { TweetMedia, TweetPublicMetrics } from "@tenbrains/x-client";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { buildTwitterAuthStartPath, startTwitterPopupAuth } from "../src/auth/popup-client.js";
import { BOOKMARK_ALREADY_EXISTS_ERROR_CODE } from "../src/bookmarks/errors.js";
import {
	buildBookmarkFollowStateForItem,
	EMPTY_FOLLOW_SUMMARY,
	isCreatorSubjectCovered,
	isSubjectFollowed,
} from "../src/follows/bookmark-follow-state.js";
import {
	readJsonResponse,
	readResponseErrorMessage,
} from "../src/http/read-json-response.js";

export { parseBookmarkTags, validateBookmarkTags };

export interface TweetPreview {
	id: string;
	text: string;
	authorId?: string;
	authorUsername?: string;
	authorName?: string;
	authorAvatarUrl?: string;
	createdAt?: string;
	conversationId?: string;
	inReplyToTweetId?: string;
	media?: TweetMedia[];
	publicMetrics?: TweetPublicMetrics;
}

export interface ThreadPreview {
	rootTweetId: string;
	tweets: TweetPreview[];
}

interface AnalyzeResponseSuccess {
	tweet: TweetPreview;
	thread?: ThreadPreview;
	analysis: AnalyzeTweetResult;
	provider?: ProviderId;
	model?: string;
}

interface AnalyzeResponseError {
	error?: {
		code?: string;
		message?: string;
	};
	redirectTo?: string;
}

interface SaveBookmarkResponseError {
	error?: {
		code?: string;
		message?: string;
	};
}

interface FollowsResponseSuccess extends FollowSummary {}

export interface HeroTweetAnalyzerProps {
	initialTweetUrlOrId?: string;
	autoAnalyze?: boolean;
	initialProvider?: ProviderId;
	initialModel?: string;
	showProviderSelector?: boolean;
	showModelSelector?: boolean;
	theme?: "editorial" | "obsidian";
}

type HeroTweetAnalyzerTheme = NonNullable<HeroTweetAnalyzerProps["theme"]>;
export type CopyFeedback = {
	kind: "success" | "error";
	message: string;
};

function cleanAnalyzeFlagInUrl(): void {
	if (typeof window === "undefined") {
		return;
	}
	const nextUrl = new URL(window.location.href);
	nextUrl.searchParams.delete("analyze");
	window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

function buildResumePath(tweetUrlOrId: string): string {
	const params = new URLSearchParams({
		tweetUrlOrId,
		analyze: "1",
	});
	return `/?${params.toString()}`;
}

function extractCallbackUrlFromRedirectPath(redirectPath: string, fallbackPath: string): string {
	try {
		const redirectUrl = new URL(redirectPath, window.location.origin);
		const callbackUrl = redirectUrl.searchParams.get("redirect_url");
		if (callbackUrl && callbackUrl.startsWith("/")) {
			return callbackUrl;
		}
		return fallbackPath;
	} catch {
		return fallbackPath;
	}
}

function defaultAvatarLabel(tweet: TweetPreview): string {
	if (tweet.authorName && tweet.authorName.trim().length > 0) {
		return tweet.authorName.trim().charAt(0).toUpperCase();
	}
	if (tweet.authorUsername && tweet.authorUsername.trim().length > 0) {
		return tweet.authorUsername.trim().charAt(0).toUpperCase();
	}
	return "X";
}

function normalizeUsername(username?: string): string | undefined {
	if (!username) {
		return undefined;
	}
	const trimmed = username.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export function buildTweetCanonicalUrl(tweet: TweetPreview): string {
	const username = normalizeUsername(tweet.authorUsername);
	if (username) {
		return `https://x.com/${username}/status/${tweet.id}`;
	}
	return `https://x.com/i/web/status/${tweet.id}`;
}

export function selectLeadTweetMedia(tweet: TweetPreview): TweetMedia | undefined {
	return tweet.media?.[0];
}

function normalizeFollowTags(bookmarkTagsInput: string): string[] {
	return parseBookmarkTags(bookmarkTagsInput);
}

function splitTrailingUrlPunctuation(value: string): { url: string; trailing: string } {
	const match = value.match(/[),.!?:;]+$/);
	if (!match) {
		return {
			url: value,
			trailing: "",
		};
	}

	const trailing = match[0];
	return {
		url: value.slice(0, -trailing.length),
		trailing,
	};
}

function renderTweetTextContent(text: string, isObsidian: boolean): React.ReactNode {
	const segments = text.split(/(https?:\/\/\S+)/g);
	return segments.map((segment, index) => {
		if (!segment) {
			return null;
		}

		if (!/^https?:\/\/\S+$/.test(segment)) {
			return <React.Fragment key={`tweet-text-${index}`}>{segment}</React.Fragment>;
		}

		const { url, trailing } = splitTrailingUrlPunctuation(segment);
		if (!url) {
			return <React.Fragment key={`tweet-text-${index}`}>{segment}</React.Fragment>;
		}

		return (
			<React.Fragment key={`tweet-text-${index}`}>
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className={
						isObsidian
							? "font-label text-[11px] uppercase tracking-[0.16em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-surface"
							: "font-semibold text-coral underline decoration-coral/50 underline-offset-4 transition-colors hover:text-white"
					}
				>
					{url}
				</a>
				{trailing}
			</React.Fragment>
		);
	});
}

function renderLeadTweetMedia(tweet: TweetPreview): React.ReactNode {
	const media = selectLeadTweetMedia(tweet);
	if (!media) {
		return null;
	}

	if (media.type === "photo") {
		const imageUrl = media.url ?? media.previewImageUrl;
		if (!imageUrl) {
			return null;
		}

		return (
			<img
				src={imageUrl}
				alt={media.altText ?? "Tweet media"}
				className="mt-4 w-full rounded-3xl border border-white/10 object-cover"
			/>
		);
	}

	const previewUrl = media.previewImageUrl ?? media.url;
	const tweetUrl = buildTweetCanonicalUrl(tweet);
	const mediaLabel = media.type === "animated_gif" ? "GIF" : "Video";

	if (previewUrl) {
		return (
			<a
				href={tweetUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="group relative mt-4 block overflow-hidden rounded-3xl border border-white/10"
			>
				<img
					src={previewUrl}
					alt={media.altText ?? `${mediaLabel} preview`}
					className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
				/>
				<div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/65 via-black/15 to-transparent p-4">
					<span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-surface/80 text-sm text-primary">
						▶
					</span>
					<span className="text-xs font-semibold uppercase tracking-wider text-secondary">
						{mediaLabel} - Open on X
					</span>
				</div>
			</a>
		);
	}

	return (
		<a
			href={tweetUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="mt-4 inline-flex items-center rounded-3xl border border-white/20 bg-charcoal px-4 py-3 text-xs font-semibold uppercase tracking-widest text-peach/80 transition-colors hover:bg-white/10 hover:text-white"
		>
			{mediaLabel} - View on X
		</a>
	);
}

function formatInteractionCount(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export interface TweetPreviewCardProps {
	tweet: TweetPreview;
	analysis: AnalyzeTweetResult;
	selectedConceptTagKeys?: ReadonlySet<string>;
	onToggleConceptTag?: (tag: string) => void;
	theme?: HeroTweetAnalyzerTheme;
}

export function TweetPreviewCard({
	tweet,
	analysis,
	selectedConceptTagKeys,
	onToggleConceptTag,
	theme = "editorial",
}: Readonly<TweetPreviewCardProps>) {
	const isObsidian = theme === "obsidian";
	const interactionItems = [
		{
			label: "Replies",
			value: tweet.publicMetrics?.replyCount,
		},
		{
			label: "Reposts",
			value: tweet.publicMetrics?.repostCount,
		},
		{
			label: "Likes",
			value: tweet.publicMetrics?.likeCount,
		},
		{
			label: "Quotes",
			value: tweet.publicMetrics?.quoteCount,
		},
	].filter((item): item is { label: string; value: number } => typeof item.value === "number");

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<section className={isObsidian ? "bg-surface-container-lowest p-6" : "rounded-4xl border border-white/10 bg-ink/70 p-5"}>
				<div className="mb-5 flex items-start gap-3">
					{tweet.authorAvatarUrl ? (
						<img
							src={tweet.authorAvatarUrl}
							alt={tweet.authorName ? `${tweet.authorName} avatar` : "Tweet author avatar"}
							className={
								isObsidian ? "h-10 w-10 border border-outline-variant/30 object-cover" : "h-10 w-10 rounded-full border border-white/20 object-cover"
							}
						/>
					) : (
						<div
							className={
								isObsidian
									? "flex h-10 w-10 items-center justify-center border border-outline-variant/30 bg-surface-container-low font-label text-sm font-semibold text-primary"
									: "flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-charcoal text-sm font-semibold text-white"
							}
						>
							{defaultAvatarLabel(tweet)}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<p className={isObsidian ? "font-label text-sm uppercase tracking-[0.18em] text-on-surface" : "text-sm font-semibold uppercase tracking-[0.12em] text-white"}>
							{tweet.authorName ?? "Unknown author"}
						</p>
						<p className={isObsidian ? "font-label text-[10px] uppercase tracking-[0.3em] text-secondary/60" : "text-xs text-peach/60"}>
							@{tweet.authorUsername ?? "unknown"}
						</p>
					</div>
				</div>
				<div
					id="tweet-text-content"
					className={
						isObsidian
							? "whitespace-pre-wrap border-y border-outline-variant/10 py-5 font-body text-[1.06rem] leading-8 text-on-surface"
							: "whitespace-pre-wrap border-y border-white/10 py-4 text-base leading-8 text-white"
					}
				>
					{renderTweetTextContent(tweet.text, isObsidian)}
				</div>
				{renderLeadTweetMedia(tweet)}
				{interactionItems.length > 0 ? (
					<div id="tweet-interaction-metrics" className="mt-4 flex flex-wrap gap-2">
						{interactionItems.map((item) => (
							<span
								key={item.label}
								className={
									isObsidian
										? "border border-outline-variant/20 bg-surface px-3 py-2 font-label text-[10px] uppercase tracking-[0.24em] text-secondary/55"
										: "rounded-full border border-white/15 bg-charcoal/50 px-3 py-1 text-xs text-peach/70"
								}
							>
								<span className={isObsidian ? "text-primary" : "font-semibold text-white"}>{formatInteractionCount(item.value)}</span> {item.label}
							</span>
						))}
					</div>
				) : null}
				<p className={isObsidian ? "mt-4 font-label text-[10px] uppercase tracking-[0.3em] text-secondary/50" : "mt-4 text-xs uppercase tracking-widest text-peach/50"}>
					Tweet ID: {tweet.id}
				</p>
			</section>
			<section className={isObsidian ? "emerald-glow bg-surface-container-high p-6" : "rounded-4xl border border-coral/30 bg-coral/10 p-5"}>
				<p className={isObsidian ? "font-label text-[10px] uppercase tracking-[0.35em] text-primary" : "text-xs font-semibold uppercase tracking-[0.2em] text-coral"}>
					Analysis
				</p>
				<h3 className={isObsidian ? "mt-3 font-headline text-2xl italic text-on-surface" : "mt-3 font-serif text-2xl text-white"}>
					{analysis.topic}
				</h3>
				<p className={isObsidian ? "mt-3 font-body text-sm leading-7 text-on-surface-variant" : "mt-3 text-sm leading-relaxed text-peach/90"}>
					{analysis.summary}
				</p>
				<p className={isObsidian ? "mt-4 font-label text-[11px] uppercase tracking-[0.24em] text-secondary/70" : "mt-4 text-sm text-peach/70"}>
					<span className={isObsidian ? "text-primary" : "font-semibold text-white"}>Intent:</span> {analysis.intent}
				</p>
				<div id="analysis-concept-tags" className="mt-4 flex flex-wrap gap-2">
					{analysis.novelConcepts.map((concept, index) => {
						const normalizedTag = concept.name.trim().toLowerCase();
						const isSelected = selectedConceptTagKeys?.has(normalizedTag) ?? false;
						const className = isObsidian
							? isSelected
								? "border border-primary/50 bg-primary/10 px-3 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-primary"
								: "border border-outline-variant/20 bg-surface px-3 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-on-surface"
							: isSelected
								? "rounded-full border border-coral bg-coral/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-coral"
								: "rounded-full border border-white/15 bg-ink/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white";

						if (!onToggleConceptTag) {
							return (
								<span key={`${concept.name}-${index}`} className={className}>
									{concept.name}
								</span>
							);
						}

						return (
							<button
								key={`${concept.name}-${index}`}
								type="button"
								aria-pressed={isSelected}
								onClick={() => {
									onToggleConceptTag(concept.name);
								}}
								className={
									isObsidian
										? `${className} transition-colors hover:border-primary/60 hover:text-primary`
										: `${className} transition-colors hover:border-coral/60 hover:text-coral`
								}
							>
								{concept.name}
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}

interface ThreadReplyCardProps {
	tweet: TweetPreview;
	index: number;
	total: number;
	theme?: HeroTweetAnalyzerTheme;
}

function ThreadReplyCard({
	tweet,
	index,
	total,
	theme = "editorial",
}: Readonly<ThreadReplyCardProps>) {
	const isObsidian = theme === "obsidian";

	return (
		<section
			className={
				isObsidian
					? "border border-outline-variant/20 bg-surface-container-lowest p-5"
					: "rounded-4xl border border-white/10 bg-ink/60 p-5"
			}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p
						className={
							isObsidian
								? "font-label text-[10px] uppercase tracking-[0.3em] text-primary"
								: "text-xs font-semibold uppercase tracking-[0.2em] text-coral"
						}
					>
						Thread {index + 1}/{total}
					</p>
					<p
						className={
							isObsidian
								? "mt-2 font-label text-sm uppercase tracking-[0.16em] text-on-surface"
								: "mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-white"
						}
					>
						{tweet.authorName ?? "Unknown author"}
					</p>
					<p
						className={
							isObsidian
								? "font-label text-[10px] uppercase tracking-[0.3em] text-secondary/60"
								: "text-xs text-peach/60"
						}
					>
						@{tweet.authorUsername ?? "unknown"}
					</p>
				</div>
				<a
					href={buildTweetCanonicalUrl(tweet)}
					target="_blank"
					rel="noopener noreferrer"
					className={
						isObsidian
							? "font-label text-[10px] uppercase tracking-[0.24em] text-primary transition-colors hover:text-on-surface"
							: "text-xs font-semibold uppercase tracking-wider text-coral transition-colors hover:text-white"
					}
				>
					Open on X
				</a>
			</div>
			<div
				className={
					isObsidian
						? "mt-4 whitespace-pre-wrap border-t border-outline-variant/10 pt-4 font-body text-sm leading-7 text-on-surface"
						: "mt-4 whitespace-pre-wrap border-t border-white/10 pt-4 text-sm leading-7 text-white"
				}
			>
				{renderTweetTextContent(tweet.text, isObsidian)}
			</div>
		</section>
	);
}

export interface ThreadPreviewSectionProps {
	rootTweet: TweetPreview;
	thread: ThreadPreview;
	analysis: AnalyzeTweetResult;
	selectedConceptTagKeys?: ReadonlySet<string>;
	onToggleConceptTag?: (tag: string) => void;
	theme?: HeroTweetAnalyzerTheme;
}

export function ThreadPreviewSection({
	rootTweet,
	thread,
	analysis,
	selectedConceptTagKeys,
	onToggleConceptTag,
	theme = "editorial",
}: Readonly<ThreadPreviewSectionProps>) {
	const isObsidian = theme === "obsidian";
	const replies = thread.tweets.filter((tweet) => tweet.id !== thread.rootTweetId);

	return (
		<section id="thread-preview-section" className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<p
					className={
						isObsidian
							? "font-label text-[10px] uppercase tracking-[0.35em] text-primary"
							: "text-xs font-semibold uppercase tracking-[0.2em] text-coral"
					}
				>
					Thread
				</p>
				<p
					className={
						isObsidian
							? "font-body text-sm leading-7 text-on-surface-variant"
							: "text-sm text-peach/70"
					}
				>
					Showing all {thread.tweets.length} posts in this thread. Analysis is based on the combined thread text.
				</p>
			</div>
			<TweetPreviewCard
				tweet={rootTweet}
				analysis={analysis}
				selectedConceptTagKeys={selectedConceptTagKeys}
				onToggleConceptTag={onToggleConceptTag}
				theme={theme}
			/>
			{replies.length > 0 ? (
				<div className="flex flex-col gap-3">
					{replies.map((reply, index) => (
						<ThreadReplyCard
							key={reply.id}
							tweet={reply}
							index={index + 1}
							total={thread.tweets.length}
							theme={theme}
						/>
					))}
				</div>
			) : null}
		</section>
	);
}

export interface AnalyzerFollowControlsProps {
	tweet: TweetPreview;
	activeTags: string[];
	followSummary: FollowSummary;
	isCreatingFollow?: boolean;
	onCreateFollow?: (input: CreateFollowInput, successMessage: string) => void;
	theme?: HeroTweetAnalyzerTheme;
}

export function AnalyzerFollowControls({
	tweet,
	activeTags,
	followSummary,
	isCreatingFollow = false,
	onCreateFollow,
	theme = "editorial",
}: Readonly<AnalyzerFollowControlsProps>) {
	const isObsidian = theme === "obsidian";
	const normalizedUsername = normalizeUsername(tweet.authorUsername);
	if (!normalizedUsername) {
		return null;
	}

	const followState = buildBookmarkFollowStateForItem(
		{
			authorUsername: normalizedUsername,
			tags: activeTags,
		},
		followSummary,
	);

	return (
		<section id="analyzer-follow-controls" className={isObsidian ? "bg-surface-container-low p-6" : "rounded-4xl border border-white/10 bg-ink/70 p-5"}>
			<div className="flex flex-col gap-4">
				<div>
					<p className={isObsidian ? "font-label text-[10px] uppercase tracking-[0.35em] text-primary" : "text-xs font-semibold uppercase tracking-[0.2em] text-coral"}>
						Follow
					</p>
					<p className={isObsidian ? "mt-2 font-body text-sm leading-7 text-on-surface-variant" : "mt-2 text-sm text-peach/70"}>
						Follow @{normalizedUsername} or follow the current topics selected on this analysis card.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{followState.isCreatorFeedFollowed ? (
						<span
							className={
								isObsidian
									? "border border-primary/40 bg-primary/10 px-4 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-primary"
									: "rounded-full border border-coral/30 bg-coral/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-coral"
							}
						>
							Following @{normalizedUsername}
						</span>
					) : (
						<button
							id="analyzer-follow-creator-button"
							type="button"
							disabled={isCreatingFollow || !onCreateFollow}
							onClick={() => {
								onCreateFollow?.(
									{
										kind: "creator",
										creatorUsername: normalizedUsername,
										creatorName: tweet.authorName?.trim() ? tweet.authorName.trim() : undefined,
										creatorAvatarUrl: tweet.authorAvatarUrl?.trim() ? tweet.authorAvatarUrl.trim() : undefined,
										scope: "all_feed",
									},
									`Now following @${normalizedUsername}'s saved feed.`,
								);
							}}
							className={
								isObsidian
									? "inline-flex items-center justify-center bg-primary-container px-4 py-3 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
									: "inline-flex items-center justify-center rounded-[16px] bg-coral px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-coral-hover disabled:cursor-not-allowed disabled:opacity-60"
							}
						>
							{isCreatingFollow ? "Saving..." : "Follow account"}
						</button>
					)}
					{activeTags.map((tag) =>
						isCreatorSubjectCovered(followState, tag) ? (
							<span
								key={`analyzer-follow-creator-${tag}`}
								className={
									isObsidian
										? "border border-outline-variant/20 px-4 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-secondary/70"
										: "rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-peach/70"
								}
							>
								Following @{normalizedUsername} for {tag}
							</span>
						) : (
							<button
								key={`analyzer-follow-creator-${tag}`}
								type="button"
								disabled={isCreatingFollow || !onCreateFollow}
								onClick={() => {
									onCreateFollow?.(
										{
											kind: "creator",
											creatorUsername: normalizedUsername,
											creatorName: tweet.authorName?.trim() ? tweet.authorName.trim() : undefined,
											creatorAvatarUrl: tweet.authorAvatarUrl?.trim() ? tweet.authorAvatarUrl.trim() : undefined,
											scope: "subject",
											subjectTag: tag,
										},
										`Now following @${normalizedUsername} for ${tag}.`,
									);
								}}
								className={
									isObsidian
										? "inline-flex items-center justify-center border border-outline-variant/20 px-4 py-3 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-on-surface transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
										: "inline-flex items-center justify-center rounded-[16px] border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
								}
							>
								Follow @{normalizedUsername} for {tag}
							</button>
						),
					)}
					{activeTags.map((tag) =>
						isSubjectFollowed(followSummary, tag) ? (
							<span
								key={`analyzer-follow-subject-${tag}`}
								className={
									isObsidian
										? "border border-primary/40 bg-primary/10 px-4 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-primary"
										: "rounded-full border border-coral/30 bg-coral/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-coral"
								}
							>
								Following Topic {tag}
							</span>
						) : (
							<button
								key={`analyzer-follow-subject-${tag}`}
								type="button"
								disabled={isCreatingFollow || !onCreateFollow}
								onClick={() => {
									onCreateFollow?.(
										{
											kind: "subject",
											subjectTag: tag,
										},
										`Now following ${tag}.`,
									);
								}}
								className={
									isObsidian
										? "inline-flex items-center justify-center border border-primary/40 bg-primary/10 px-4 py-3 font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-primary transition-colors hover:border-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
										: "inline-flex items-center justify-center rounded-[16px] border border-coral/30 bg-coral/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-coral transition-colors hover:bg-coral/20 disabled:cursor-not-allowed disabled:opacity-60"
								}
							>
								Follow topic {tag}
							</button>
						),
					)}
				</div>
				{activeTags.length === 0 ? (
					<p className={isObsidian ? "font-body text-xs leading-6 text-secondary/60" : "text-xs text-peach/60"}>
						Select concept tags or type topics above to unlock topic follow actions.
					</p>
				) : null}
			</div>
		</section>
	);
}

export interface AnalysisMarkdownCopyControlsProps {
	onCopyMarkdown?: () => void;
	feedback?: CopyFeedback | null;
	tweetCount?: number;
	theme?: HeroTweetAnalyzerTheme;
}

export function AnalysisMarkdownCopyControls({
	onCopyMarkdown,
	feedback = null,
	tweetCount = 1,
	theme = "editorial",
}: Readonly<AnalysisMarkdownCopyControlsProps>) {
	const isObsidian = theme === "obsidian";
	const isThread = tweetCount > 1;
	const title = isThread ? "Copy Thread" : "Copy Post";
	const description = isThread
		? "Copy the full analyzed thread, plus the generated analysis, as Markdown."
		: "Copy the analyzed post and analysis as Markdown.";
	const buttonLabel = isThread ? "Copy Thread Markdown" : "Copy Post Markdown";
	const sectionClassName = isObsidian
		? "bg-surface-container-low p-6"
		: "rounded-4xl border border-white/10 bg-ink/70 p-5";
	const buttonClassName = isObsidian
		? "inline-flex min-w-[220px] items-center justify-center border border-outline-variant/20 bg-surface-container-lowest px-7 py-4 font-label text-xs font-semibold uppercase tracking-[0.24em] text-on-surface transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
		: "inline-flex min-w-[190px] items-center justify-center rounded-[20px] border border-white/20 bg-charcoal/70 px-7 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-coral/50 hover:text-coral disabled:cursor-not-allowed disabled:opacity-60";
	const errorClassName = isObsidian
		? "mt-4 border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface"
		: "mt-4 rounded-3xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-peach";
	const successClassName = isObsidian ? "mt-4 font-body text-sm text-on-surface-variant" : "mt-4 text-sm text-peach/80";

	return (
		<section id="analysis-copy-controls" className={sectionClassName}>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className={isObsidian ? "font-label text-[10px] uppercase tracking-[0.35em] text-primary" : "text-xs font-semibold uppercase tracking-[0.2em] text-coral"}>
							{title}
						</p>
						<p className={isObsidian ? "mt-2 font-body text-sm leading-7 text-on-surface-variant" : "mt-2 text-sm text-peach/70"}>
							{description}
						</p>
					</div>
				<button
					id="analysis-copy-markdown-button"
					type="button"
					onClick={onCopyMarkdown}
					disabled={!onCopyMarkdown}
					className={buttonClassName}
				>
					{buttonLabel}
				</button>
			</div>
			{feedback ? (
				<p
					id={`analysis-copy-${feedback.kind}`}
					role={feedback.kind === "error" ? "alert" : "status"}
					className={feedback.kind === "error" ? errorClassName : successClassName}
				>
					{feedback.message}
				</p>
			) : null}
		</section>
	);
}

export function HeroTweetAnalyzer({
	initialTweetUrlOrId = "",
	autoAnalyze = false,
	initialProvider = "openai",
	initialModel,
	showProviderSelector = true,
	showModelSelector = true,
	theme = "editorial",
}: Readonly<HeroTweetAnalyzerProps>) {
	const isObsidian = theme === "obsidian";
	const [tweetUrlOrId, setTweetUrlOrId] = useState(initialTweetUrlOrId);
	const [provider, setProvider] = useState<ProviderId>(initialProvider);
	const [model, setModel] = useState(resolveProviderCatalogModel(initialProvider, initialModel));
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [tweet, setTweet] = useState<TweetPreview | null>(null);
	const [thread, setThread] = useState<ThreadPreview | null>(null);
	const [analysis, setAnalysis] = useState<AnalyzeTweetResult | null>(null);
	const [bookmarkTagsInput, setBookmarkTagsInput] = useState("");
	const [isSavingBookmark, setIsSavingBookmark] = useState(false);
	const [isCreatingFollow, setIsCreatingFollow] = useState(false);
	const [bookmarkErrorMessage, setBookmarkErrorMessage] = useState<string | null>(null);
	const [bookmarkSuccessMessage, setBookmarkSuccessMessage] = useState<string | null>(null);
	const [followErrorMessage, setFollowErrorMessage] = useState<string | null>(null);
	const [followSuccessMessage, setFollowSuccessMessage] = useState<string | null>(null);
	const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
	const [followSummary, setFollowSummary] = useState<FollowSummary>(
		EMPTY_FOLLOW_SUMMARY,
	);
	const hasAutoRunRef = useRef(false);
	const authPopupCleanupRef = useRef<(() => void) | null>(null);
	const hasLoadedPreferencesRef = useRef(false);

	const modelOptions = useMemo(() => getProviderCatalogEntry(provider).models, [provider]);
	const canSubmit = useMemo(
		() => tweetUrlOrId.trim().length > 0 && model.trim().length > 0 && !isLoading,
		[isLoading, model, tweetUrlOrId],
	);
	const canSaveBookmark = useMemo(
		() => Boolean(tweet && analysis) && !isSavingBookmark,
		[analysis, isSavingBookmark, tweet],
	);
	const selectedBookmarkTagKeys = useMemo(
		() => new Set(normalizeFollowTags(bookmarkTagsInput).map((tag) => tag.toLowerCase())),
		[bookmarkTagsInput],
	);
	const activeFollowTags = useMemo(
		() => normalizeFollowTags(bookmarkTagsInput),
		[bookmarkTagsInput],
	);

	async function readFollowSummary(): Promise<FollowSummary> {
		try {
			const response = await fetch("/api/me/follows", {
				method: "GET",
				headers: {
					"content-type": "application/json",
				},
			});
			const payload = await readJsonResponse<FollowsResponseSuccess | SaveBookmarkResponseError>(response);
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

	function toggleConceptTag(tag: string): void {
		setBookmarkTagsInput((current) => {
			const existingTags = parseBookmarkTags(current);
			const trimmedTag = tag.trim();
			const normalizedTag = trimmedTag.toLowerCase();
			if (normalizedTag.length === 0) {
				return existingTags.join(", ");
			}
			const hasTag = existingTags.some((entry) => entry.toLowerCase() === normalizedTag);
			const nextTags = hasTag
				? existingTags.filter((entry) => entry.toLowerCase() !== normalizedTag)
				: [...existingTags, trimmedTag];
			return nextTags.join(", ");
		});
		setBookmarkSuccessMessage(null);
	}

	async function runAnalysis(value: string, options: { allowAuthPopup?: boolean } = {}): Promise<void> {
		const allowAuthPopup = options.allowAuthPopup ?? true;
		const trimmedValue = value.trim();
		if (trimmedValue.length === 0) {
			setErrorMessage("Enter a tweet URL or tweet ID before analyzing.");
			return;
		}

		setIsLoading(true);
		setErrorMessage(null);
		setBookmarkTagsInput("");
		setBookmarkErrorMessage(null);
		setBookmarkSuccessMessage(null);
		setFollowErrorMessage(null);
		setFollowSuccessMessage(null);
		setCopyFeedback(null);
		setThread(null);

		try {
			const response = await fetch("/api/analyze", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					tweetUrlOrId: trimmedValue,
					provider,
					model,
				}),
			});
			const payload = (await response.json()) as AnalyzeResponseSuccess | AnalyzeResponseError;

			if (response.status === 401) {
				const redirectTo = "redirectTo" in payload ? payload.redirectTo : undefined;
				if (!allowAuthPopup) {
					setErrorMessage("Please sign in with Twitter to analyze tweets.");
					return;
				}
				if (redirectTo && redirectTo.startsWith("/")) {
					const callbackUrl = extractCallbackUrlFromRedirectPath(redirectTo, buildResumePath(trimmedValue));
					const fullPageFallback = () => {
						window.location.assign(buildTwitterAuthStartPath(callbackUrl));
					};
					authPopupCleanupRef.current?.();
					authPopupCleanupRef.current = startTwitterPopupAuth({
						callbackUrl,
						onSuccess: () => {
							setErrorMessage(null);
							void runAnalysis(trimmedValue, { allowAuthPopup: false });
						},
						onPopupBlocked: () => {
							setErrorMessage("Opening full-page Twitter sign-in...");
							fullPageFallback();
						},
						onPopupClosed: fullPageFallback,
						onPopupTimedOut: fullPageFallback,
					});
					return;
				}
				setErrorMessage("Please sign in with Twitter to analyze tweets.");
				return;
			}

			if (!response.ok) {
				const fallbackMessage = "Unable to analyze this tweet right now.";
				const message = "error" in payload && payload.error?.message ? payload.error.message : fallbackMessage;
				setErrorMessage(message);
				return;
			}

			if (!("tweet" in payload) || !("analysis" in payload)) {
				setErrorMessage("Unexpected response while analyzing tweet.");
				return;
			}

			setTweet(payload.tweet);
			setThread(payload.thread ?? null);
			setAnalysis(payload.analysis);
			setTweetUrlOrId(trimmedValue);
			if ("provider" in payload && payload.provider) {
				setProvider(payload.provider);
			}
			if ("model" in payload && payload.model) {
				setModel(resolveProviderCatalogModel(payload.provider ?? provider, payload.model));
			}
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while analyzing tweet.");
		} finally {
			setIsLoading(false);
			cleanAnalyzeFlagInUrl();
		}
	}

	async function saveBookmark(): Promise<void> {
		if (!tweet || !analysis) {
			return;
		}

		const tags = parseBookmarkTags(bookmarkTagsInput);
		const validationError = validateBookmarkTags(tags);
		if (validationError) {
			setBookmarkErrorMessage(validationError);
			setBookmarkSuccessMessage(null);
			return;
		}

		setIsSavingBookmark(true);
		setBookmarkErrorMessage(null);
		setBookmarkSuccessMessage(null);

		try {
			const response = await fetch("/api/bookmarks", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					tweetId: tweet.id,
					tweetText: tweet.text,
					tweetUrlOrId: buildTweetCanonicalUrl(tweet),
					authorUsername: normalizeUsername(tweet.authorUsername) ?? "unknown",
					authorName: tweet.authorName?.trim() ? tweet.authorName.trim() : undefined,
					authorAvatarUrl: tweet.authorAvatarUrl?.trim() ? tweet.authorAvatarUrl.trim() : undefined,
					thread: thread && thread.tweets.length > 1 ? thread : undefined,
					tags,
				}),
			});
			const payload = (await response.json()) as SavedBookmark | SaveBookmarkResponseError;

			if (!response.ok) {
				const fallbackMessage = "Unable to save this bookmark right now.";
				const message = "error" in payload && payload.error?.message ? payload.error.message : fallbackMessage;
				const code = "error" in payload ? payload.error?.code : undefined;
				if (code === BOOKMARK_ALREADY_EXISTS_ERROR_CODE) {
					setBookmarkSuccessMessage(message);
					setBookmarkTagsInput(tags.join(", "));
					return;
				}
				setBookmarkErrorMessage(message);
				return;
			}

			if (!("id" in payload)) {
				setBookmarkErrorMessage("Unexpected response while saving bookmark.");
				return;
			}

			setBookmarkSuccessMessage("Saved to Bookmarks.");
			setBookmarkTagsInput(tags.join(", "));
		} catch (error) {
			setBookmarkErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while saving bookmark.");
		} finally {
			setIsSavingBookmark(false);
		}
	}

	async function copyMarkdown(): Promise<void> {
		if (!tweet || !analysis) {
			return;
		}

		try {
			if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
				throw new Error("Clipboard is unavailable in this browser.");
			}

			const markdown = renderAnalyzeTweetMarkdown({
				tweet,
				thread: thread && thread.tweets.length > 1 ? thread : undefined,
				analysis,
			});
			await navigator.clipboard.writeText(markdown);
			setCopyFeedback({
				kind: "success",
				message: thread && thread.tweets.length > 1 ? "Copied thread and analysis as Markdown." : "Copied tweet and analysis as Markdown.",
			});
		} catch (error) {
			setCopyFeedback({
				kind: "error",
				message: error instanceof Error ? error.message : "Unable to copy Markdown right now.",
			});
		}
	}

	async function createFollow(
		input: CreateFollowInput,
		successMessage: string,
	): Promise<void> {
		setIsCreatingFollow(true);
		setFollowErrorMessage(null);
		setFollowSuccessMessage(null);
		try {
			const response = await fetch("/api/me/follows", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(input),
			});
			const payload = await readJsonResponse<SaveBookmarkResponseError>(response);
			if (!response.ok) {
				throw new Error(readResponseErrorMessage(payload, "Unable to save follow right now."));
			}
			setFollowSummary(await readFollowSummary());
			setFollowSuccessMessage(successMessage);
		} catch (error) {
			setFollowErrorMessage(error instanceof Error ? error.message : "Unexpected network failure while saving follow.");
		} finally {
			setIsCreatingFollow(false);
		}
	}

	useEffect(() => {
		let isCancelled = false;

		async function loadFollowSummary(): Promise<void> {
			const summary = await readFollowSummary();
			if (!isCancelled) {
				setFollowSummary(summary);
			}
		}

		void loadFollowSummary();
		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		if (hasLoadedPreferencesRef.current) {
			return;
		}
		hasLoadedPreferencesRef.current = true;
		void (async () => {
			const response = await fetch("/api/me/preferences", { credentials: "same-origin" });
			if (!response.ok) {
				return;
			}
			const payload = (await response.json()) as {
				preferences?: {
					defaultProvider?: ProviderId;
					defaultModel?: string;
				};
			};
			const defaultProvider = payload.preferences?.defaultProvider;
			const defaultModel = payload.preferences?.defaultModel;
			if (defaultProvider) {
				setProvider(defaultProvider);
				setModel(resolveProviderCatalogModel(defaultProvider, defaultModel));
				return;
			}
			if (defaultModel) {
				setModel(resolveProviderCatalogModel(provider, defaultModel));
			}
		})().catch(() => {});
	}, [provider]);

	useEffect(() => {
		return () => {
			authPopupCleanupRef.current?.();
			authPopupCleanupRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!copyFeedback) {
			return;
		}

		const timerId = window.setTimeout(() => {
			setCopyFeedback(null);
		}, 3000);

		return () => {
			window.clearTimeout(timerId);
		};
	}, [copyFeedback]);

	useEffect(() => {
		if (!autoAnalyze || hasAutoRunRef.current) {
			return;
		}
		if (initialTweetUrlOrId.trim().length === 0) {
			return;
		}

		hasAutoRunRef.current = true;
		void runAnalysis(initialTweetUrlOrId);
	}, [autoAnalyze, initialTweetUrlOrId]);

	const containerClassName = isObsidian
		? "glass-panel flex w-full flex-col gap-6 border border-outline-variant/20 bg-surface-container-high/70 p-6 text-left md:p-8"
		: "flex w-full flex-col gap-6 rounded-5xl border border-white/10 bg-charcoal/70 p-6 text-left shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-8";
	const formClassName = isObsidian ? "flex w-full flex-col gap-0 md:flex-row" : "flex w-full flex-col gap-3 sm:flex-row";
	const selectClassName = isObsidian
		? "appearance-none border border-outline-variant/20 bg-surface-container-lowest px-4 py-5 pr-12 font-label text-xs uppercase tracking-[0.24em] text-on-surface focus:border-primary focus:outline-none md:text-sm"
		: "appearance-none rounded-[20px] border border-white/20 bg-ink/70 px-4 py-4 pr-12 text-sm text-white focus:border-coral focus:outline-none md:text-base";
	const inputClassName = isObsidian
		? "w-full border-x-0 border-b border-t border-outline bg-surface-container-lowest px-6 py-5 font-label text-xs uppercase tracking-[0.24em] text-on-surface placeholder:text-secondary/30 focus:border-primary focus:outline-none md:text-sm"
		: "w-full rounded-[20px] border border-white/20 bg-ink/70 px-5 py-4 text-sm text-white placeholder:text-peach/40 focus:border-coral focus:outline-none md:text-base";
	const buttonClassName = isObsidian
		? "inline-flex min-w-[200px] items-center justify-center bg-primary-container px-8 py-5 font-label text-xs font-bold uppercase tracking-[0.34em] text-on-primary-container transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
		: "inline-flex min-w-[180px] items-center justify-center rounded-[20px] bg-coral px-7 py-4 text-sm font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-coral-hover md:text-base";
	const errorClassName = isObsidian
		? "border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface"
		: "rounded-3xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-peach";
	const bookmarkSectionClassName = isObsidian
		? "bg-surface-container-low p-6"
		: "rounded-4xl border border-white/10 bg-ink/70 p-5";
	const bookmarkInputClassName = isObsidian
		? "w-full border border-outline-variant/20 bg-surface-container-lowest px-5 py-4 font-label text-xs uppercase tracking-[0.24em] text-on-surface placeholder:text-secondary/30 focus:border-primary focus:outline-none md:text-sm"
		: "w-full rounded-[20px] border border-white/20 bg-charcoal/70 px-5 py-3 text-sm text-white placeholder:text-peach/40 focus:border-coral focus:outline-none md:text-base";
	const bookmarkButtonClassName = isObsidian
		? "inline-flex min-w-[220px] items-center justify-center bg-primary-container px-7 py-4 font-label text-xs font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
		: "inline-flex min-w-[190px] items-center justify-center rounded-[20px] bg-coral px-7 py-3 text-sm font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-coral-hover md:text-base";

	return (
		<div className={containerClassName}>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void runAnalysis(tweetUrlOrId);
				}}
				className={formClassName}
			>
				{showProviderSelector ? (
					<>
						<label htmlFor="hero-provider" className="sr-only">
							Model provider
						</label>
						<div className="relative">
							<select
								id="hero-provider"
								name="provider"
								value={provider}
								onChange={(event) => {
									const nextProvider = event.target.value as ProviderId;
									setProvider(nextProvider);
									setModel(getProviderCatalogEntry(nextProvider).defaultModel);
								}}
								className={selectClassName}
							>
								{PROVIDER_OPTIONS.map((option) => (
									<option key={option.id} value={option.id}>
										{option.label}
									</option>
								))}
							</select>
							<ChevronDown
								aria-hidden="true"
								className={isObsidian ? "pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary/70" : "pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-peach/70"}
							/>
						</div>
					</>
				) : null}
				<label htmlFor="hero-tweet-url" className="sr-only">
					Tweet URL
				</label>
				<input
					id="hero-tweet-url"
					name="tweetUrlOrId"
					type="text"
					value={tweetUrlOrId}
					onChange={(event) => setTweetUrlOrId(event.target.value)}
					required
					placeholder={isObsidian ? "PASTE TWEET URL OR RAW DATA STRATUM..." : "https://x.com/username/status/123456789"}
					className={inputClassName}
				/>
				<input type="hidden" name="model" value={model} />
				{showModelSelector ? (
					<>
						<label htmlFor="hero-model" className="sr-only">
							Model
						</label>
						<div className="relative w-full">
							<select
								id="hero-model"
								value={resolveProviderCatalogModel(provider, model)}
								onChange={(event) => {
									setModel(event.target.value);
								}}
								className={selectClassName}
							>
								{modelOptions.map((candidate) => (
									<option key={candidate} value={candidate}>
										{candidate}
									</option>
								))}
							</select>
							<ChevronDown
								aria-hidden="true"
								className={isObsidian ? "pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary/70" : "pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-peach/70"}
							/>
						</div>
					</>
				) : null}
				<button
					id="hero-analyze-button"
					type="submit"
					disabled={!canSubmit}
					className={buttonClassName}
				>
					{isLoading ? "Analyzing..." : isObsidian ? "Capture" : "Analyze Tweet"}
				</button>
			</form>

			{errorMessage ? (
				<p role="alert" className={errorClassName}>
					{errorMessage}
				</p>
			) : null}

			{tweet && analysis ? (
				<>
					<AnalysisMarkdownCopyControls
						onCopyMarkdown={() => {
							void copyMarkdown();
						}}
						feedback={copyFeedback}
						tweetCount={thread?.tweets.length ?? 1}
						theme={theme}
					/>
					{thread && thread.tweets.length > 1 ? (
						<ThreadPreviewSection
							rootTweet={tweet}
							thread={thread}
							analysis={analysis}
							selectedConceptTagKeys={selectedBookmarkTagKeys}
							onToggleConceptTag={toggleConceptTag}
							theme={theme}
						/>
					) : (
						<TweetPreviewCard
							tweet={tweet}
							analysis={analysis}
							selectedConceptTagKeys={selectedBookmarkTagKeys}
							onToggleConceptTag={toggleConceptTag}
							theme={theme}
						/>
					)}
					<section id="bookmark-save-controls" className={bookmarkSectionClassName}>
						<div className="flex flex-col gap-4">
							<div>
								<p className={isObsidian ? "font-label text-[10px] uppercase tracking-[0.35em] text-primary" : "text-xs font-semibold uppercase tracking-[0.2em] text-coral"}>
									Save Tweet
								</p>
								<p className={isObsidian ? "mt-2 font-body text-sm leading-7 text-on-surface-variant" : "mt-2 text-sm text-peach/70"}>
									Click analysis tags or add comma-separated tags, then save this analyzed tweet to your bookmarks.
								</p>
							</div>
							<div className="flex flex-col gap-3 sm:flex-row">
								<label htmlFor="bookmark-tags" className="sr-only">
									Bookmark tags
								</label>
								<input
									id="bookmark-tags"
									name="bookmarkTags"
									type="text"
									value={bookmarkTagsInput}
									onChange={(event) => {
										setBookmarkTagsInput(event.target.value);
										setBookmarkSuccessMessage(null);
									}}
									placeholder={isObsidian ? "strategy, systems, research" : "strategy, writing, growth"}
									className={bookmarkInputClassName}
								/>
								<button
									id="bookmark-save-button"
									type="button"
									disabled={!canSaveBookmark}
									onClick={() => {
										void saveBookmark();
									}}
									className={bookmarkButtonClassName}
								>
									{isSavingBookmark ? "Saving..." : "Save to Bookmarks"}
								</button>
							</div>
							{bookmarkErrorMessage ? (
								<p id="bookmark-save-error" role="alert" className={errorClassName}>
									{bookmarkErrorMessage}
								</p>
							) : null}
							{bookmarkSuccessMessage ? (
								<p className={isObsidian ? "font-body text-sm text-on-surface-variant" : "text-sm text-peach/80"} id="bookmark-save-success">
									{bookmarkSuccessMessage}{" "}
									<Link
										href="/app/bookmarks"
										className={isObsidian ? "font-label text-[11px] uppercase tracking-[0.2em] text-primary transition-colors hover:text-primary/80" : "font-semibold text-coral transition-colors hover:text-coral-hover"}
									>
										Open Bookmarks
									</Link>
								</p>
							) : null}
						</div>
					</section>
					<AnalyzerFollowControls
						tweet={tweet}
						activeTags={activeFollowTags}
						followSummary={followSummary}
						isCreatingFollow={isCreatingFollow}
						onCreateFollow={(input, successMessage) => {
							void createFollow(input, successMessage);
						}}
						theme={theme}
					/>
					{followErrorMessage ? (
						<p id="analyzer-follow-error" role="alert" className={errorClassName}>
							{followErrorMessage}
						</p>
					) : null}
					{followSuccessMessage ? (
						<p
							id="analyzer-follow-success"
							className={isObsidian ? "font-body text-sm text-on-surface-variant" : "text-sm text-peach/80"}
						>
							{followSuccessMessage}
						</p>
					) : null}
				</>
			) : null}
		</div>
	);
}
