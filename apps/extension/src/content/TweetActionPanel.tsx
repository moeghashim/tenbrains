import type { AnalyzeTweetResponse } from "@tenbrains/contracts";
import React from "react";

export type PanelStatus = "idle" | "loading" | "auth-pending" | "error" | "success";

export interface TweetActionPanelProps {
	status: PanelStatus;
	tweetUrl: string;
	analysisResult: AnalyzeTweetResponse | null;
	tagsInput: string;
	errorMessage: string | null;
	authMessage: string | null;
	saveMessage: string | null;
	copyStatus: {
		kind: "success" | "error";
		message: string;
	} | null;
	isSaving: boolean;
	onAnalyze: () => void;
	onCopyMarkdown: () => void;
	onToggleConcept: (conceptName: string) => void;
	onChangeTagsInput: (value: string) => void;
	onSaveBookmark: () => void;
}

function formatInteractionCount(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export function TweetActionPanel({
	status,
	tweetUrl,
	analysisResult,
	tagsInput,
	errorMessage,
	authMessage,
	saveMessage,
	copyStatus,
	isSaving,
	onAnalyze,
	onCopyMarkdown,
	onToggleConcept,
	onChangeTagsInput,
	onSaveBookmark,
}: Readonly<TweetActionPanelProps>) {
	const threadCount = analysisResult?.thread?.tweets.length ?? 1;
	const isThread = threadCount > 1;
	const copyTitle = isThread ? "Copy Thread" : "Copy Post";
	const copyDescription = isThread
		? "Copy the full analyzed thread, plus Tenbrains' structured analysis."
		: "Copy the analyzed post and Tenbrains' structured analysis.";
	const copyButtonLabel = isThread ? "Copy Thread Markdown" : "Copy Post Markdown";

	return (
		<section className="tb-shell">
			<div className="tb-header">
				<div>
					<p className="tb-kicker">Tenbrains for X</p>
					<h3 className="tb-title">Analyze public X posts and save tagged insights to Tenbrains.</h3>
				</div>
				<button type="button" className="tb-button" onClick={onAnalyze} disabled={status === "loading"}>
					{status === "loading" ? "Analyzing..." : "Analyze"}
				</button>
			</div>

			<p className="tb-caption">{tweetUrl}</p>

			{status === "auth-pending" && authMessage ? <p className="tb-banner tb-banner--info">{authMessage}</p> : null}
			{status === "error" && errorMessage ? <p className="tb-banner tb-banner--error">{errorMessage}</p> : null}

			{status === "success" && analysisResult ? (
				<div className="tb-stack">
					<div className="tb-card-grid">
						<section className="tb-card tb-card--tweet">
							<div className="tb-author">
								{analysisResult.tweet.authorAvatarUrl ? (
									<img
										src={analysisResult.tweet.authorAvatarUrl}
										alt={analysisResult.tweet.authorName ? `${analysisResult.tweet.authorName} avatar` : "Tweet author avatar"}
										className="tb-avatar"
									/>
								) : (
									<div className="tb-avatar tb-avatar--fallback">
										{analysisResult.tweet.authorName?.charAt(0) ?? analysisResult.tweet.authorUsername?.charAt(0) ?? "X"}
									</div>
								)}
								<div>
									<p className="tb-author-name">{analysisResult.tweet.authorName ?? "Unknown author"}</p>
									<p className="tb-author-handle">@{analysisResult.tweet.authorUsername ?? "unknown"}</p>
								</div>
							</div>
							<p className="tb-tweet-text">{analysisResult.tweet.text}</p>
							{analysisResult.tweet.publicMetrics ? (
								<div className="tb-chip-row">
									{typeof analysisResult.tweet.publicMetrics.replyCount === "number" ? (
										<span className="tb-chip">
											<strong>{formatInteractionCount(analysisResult.tweet.publicMetrics.replyCount)}</strong> Replies
										</span>
									) : null}
									{typeof analysisResult.tweet.publicMetrics.likeCount === "number" ? (
										<span className="tb-chip">
											<strong>{formatInteractionCount(analysisResult.tweet.publicMetrics.likeCount)}</strong> Likes
										</span>
									) : null}
									{typeof analysisResult.tweet.publicMetrics.repostCount === "number" ? (
										<span className="tb-chip">
											<strong>{formatInteractionCount(analysisResult.tweet.publicMetrics.repostCount)}</strong> Reposts
										</span>
									) : null}
								</div>
							) : null}
						</section>

						<section className="tb-card tb-card--analysis">
							<p className="tb-kicker">Analysis</p>
							<h4 className="tb-analysis-title">{analysisResult.analysis.topic}</h4>
							<p className="tb-analysis-summary">{analysisResult.analysis.summary}</p>
							<p className="tb-analysis-intent">
								<span>Intent:</span> {analysisResult.analysis.intent}
							</p>
							<div className="tb-chip-row">
								{analysisResult.analysis.novelConcepts.map((concept) => (
									<button
										key={concept.name}
										type="button"
										className="tb-chip tb-chip--button"
										onClick={() => {
											onToggleConcept(concept.name);
										}}
									>
										{concept.name}
									</button>
								))}
							</div>
						</section>
						</div>

						<section className="tb-card tb-card--bookmark">
							<div className="tb-bookmark-header">
								<div>
									<p className="tb-kicker">{copyTitle}</p>
									<p className="tb-bookmark-copy">{copyDescription}</p>
								</div>
								<button type="button" className="tb-button" onClick={onCopyMarkdown}>
									{copyButtonLabel}
								</button>
							</div>
							{copyStatus ? (
								<p className={`tb-banner ${copyStatus.kind === "error" ? "tb-banner--error" : "tb-banner--success"}`}>
									{copyStatus.message}
								</p>
							) : null}
						</section>

						{analysisResult.thread && analysisResult.thread.tweets.length > 1 ? (
							<section className="tb-card tb-card--tweet">
								<p className="tb-kicker">Thread</p>
							<p className="tb-bookmark-copy">
								Showing all {analysisResult.thread.tweets.length} posts in the analyzed thread.
							</p>
							<div className="tb-stack">
								{analysisResult.thread.tweets.map((tweet, index) => (
									<div key={tweet.id} className="tb-card tb-card--tweet">
										<p className="tb-caption">Post {index + 1}</p>
										<p className="tb-tweet-text">{tweet.text}</p>
									</div>
								))}
							</div>
						</section>
					) : null}

						<section className="tb-card tb-card--bookmark">
						<div className="tb-bookmark-header">
							<div>
								<p className="tb-kicker">Save Tweet</p>
								<p className="tb-bookmark-copy">Tags are prefilled from the analysis chips and remain editable before saving.</p>
							</div>
							<a className="tb-link" href="https://www.tenbrains.app/app/bookmarks" target="_blank" rel="noreferrer">
								Open Bookmarks
							</a>
						</div>
						<div className="tb-bookmark-controls">
							<input
								type="text"
								value={tagsInput}
								onChange={(event) => {
									onChangeTagsInput(event.target.value);
								}}
								placeholder="strategy, writing, growth"
								className="tb-input"
							/>
							<button type="button" className="tb-button" onClick={onSaveBookmark} disabled={isSaving}>
								{isSaving ? "Saving..." : "Save to Bookmarks"}
							</button>
						</div>
						{errorMessage ? <p className="tb-banner tb-banner--error">{errorMessage}</p> : null}
						{saveMessage ? <p className="tb-banner tb-banner--success">{saveMessage}</p> : null}
					</section>
				</div>
			) : null}
		</section>
	);
}
