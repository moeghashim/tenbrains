import type {
	AnalyzeTweetResponse,
	SaveBookmarkInput,
} from "@tenbrains/contracts";
import { renderAnalyzeTweetMarkdown } from "@tenbrains/contracts";
import React, { useEffect, useState } from "react";

import type { TweetActionController } from "./controller.js";
import { registerTweetActionController } from "./controller.js";
import { analyzeTweet, saveBookmark } from "./runtime.js";
import { TweetActionPanel } from "./TweetActionPanel.js";
import type { PendingAuthAction } from "../shared/messages.js";
import { parseBookmarkTags, validateBookmarkTags } from "../shared/tag-utils.js";

const BOOKMARK_ALREADY_EXISTS_ERROR_CODE = "BOOKMARK_ALREADY_EXISTS";
type CopyStatus = {
	kind: "success" | "error";
	message: string;
};

function buildDefaultTags(analysisResult: AnalyzeTweetResponse): string {
	return analysisResult.analysis.novelConcepts.map((concept) => concept.name).join(", ");
}

function toggleTag(currentInput: string, conceptName: string): string {
	const existingTags = parseBookmarkTags(currentInput);
	const normalizedConcept = conceptName.trim().toLowerCase();
	if (normalizedConcept.length === 0) {
		return existingTags.join(", ");
	}

	const nextTags = existingTags.some((tag) => tag.toLowerCase() === normalizedConcept)
		? existingTags.filter((tag) => tag.toLowerCase() !== normalizedConcept)
		: [...existingTags, conceptName.trim()];
	return nextTags.join(", ");
}

function buildBookmarkPayload(analysisResult: AnalyzeTweetResponse, tags: string[]): SaveBookmarkInput {
	return {
		tweetId: analysisResult.tweet.id,
		tweetText: analysisResult.tweet.text,
		tweetUrlOrId: analysisResult.tweet.authorUsername
			? `https://x.com/${analysisResult.tweet.authorUsername.replace(/^@/, "")}/status/${analysisResult.tweet.id}`
			: `https://x.com/i/web/status/${analysisResult.tweet.id}`,
		authorUsername: analysisResult.tweet.authorUsername?.replace(/^@/, "") ?? "unknown",
		authorName: analysisResult.tweet.authorName,
		authorAvatarUrl: analysisResult.tweet.authorAvatarUrl,
		thread: analysisResult.thread,
		tags,
	};
}

export interface TweetActionAppProps {
	tweetUrl: string;
}

export function TweetActionApp({ tweetUrl }: Readonly<TweetActionAppProps>) {
	const [status, setStatus] = useState<"idle" | "loading" | "auth-pending" | "error" | "success">("idle");
	const [analysisResult, setAnalysisResult] = useState<AnalyzeTweetResponse | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const [tagsInput, setTagsInput] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

	async function runAnalyze() {
		setStatus("loading");
		setErrorMessage(null);
		setAuthMessage(null);
		setSaveMessage(null);
		setCopyStatus(null);

		const response = await analyzeTweet(tweetUrl);
		if (!response.ok) {
			if (response.code === "AUTH_REQUIRED") {
				setStatus("auth-pending");
				setAuthMessage(response.message);
				return;
			}
			setStatus("error");
			setErrorMessage(response.message);
			return;
		}

		setAnalysisResult(response.data);
		setTagsInput((currentInput) => (currentInput.trim().length > 0 ? currentInput : buildDefaultTags(response.data)));
		setStatus("success");
	}

	async function runSaveBookmark(resumeTags?: string[]) {
		if (!analysisResult) {
			return;
		}

		const parsedTags = resumeTags ?? parseBookmarkTags(tagsInput);
		const validationError = validateBookmarkTags(parsedTags);
		if (validationError) {
			setErrorMessage(validationError);
			setSaveMessage(null);
			return;
		}

		setIsSaving(true);
		setErrorMessage(null);
		setAuthMessage(null);
		setSaveMessage(null);

		const response = await saveBookmark(buildBookmarkPayload(analysisResult, parsedTags), parsedTags);
		if (!response.ok) {
			if (response.code === "AUTH_REQUIRED") {
				setStatus("auth-pending");
				setAuthMessage(response.message);
				setIsSaving(false);
				return;
			}
			if (response.code === BOOKMARK_ALREADY_EXISTS_ERROR_CODE) {
				setTagsInput(parsedTags.join(", "));
				setSaveMessage(response.message);
				setStatus("success");
				setIsSaving(false);
				return;
			}
			setErrorMessage(response.message);
			setIsSaving(false);
			return;
		}

		setTagsInput(parsedTags.join(", "));
		setSaveMessage("Saved to Tenbrains bookmarks.");
		setStatus("success");
		setIsSaving(false);
	}

	async function runCopyMarkdown() {
		if (!analysisResult) {
			return;
		}

		try {
			if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
				throw new Error("Clipboard is unavailable in this browser.");
			}

			await navigator.clipboard.writeText(renderAnalyzeTweetMarkdown(analysisResult));
			setCopyStatus({
				kind: "success",
				message:
					analysisResult.thread && analysisResult.thread.tweets.length > 1
						? "Copied thread and analysis as Markdown."
						: "Copied tweet and analysis as Markdown.",
			});
		} catch (error) {
			setCopyStatus({
				kind: "error",
				message: error instanceof Error ? error.message : "Unable to copy Markdown right now.",
			});
		}
	}

	useEffect(() => {
		const controller: TweetActionController = {
			resumePendingAction(pendingAction: PendingAuthAction) {
				if (pendingAction.type === "analyze") {
					void runAnalyze();
					return;
				}
				void runSaveBookmark(pendingAction.tags);
			},
		};

		return registerTweetActionController(tweetUrl, controller);
	}, [tweetUrl, analysisResult, tagsInput]);

	useEffect(() => {
		if (!copyStatus) {
			return;
		}

		const timerId = window.setTimeout(() => {
			setCopyStatus(null);
		}, 3000);

		return () => {
			window.clearTimeout(timerId);
		};
	}, [copyStatus]);

	return (
		<TweetActionPanel
			status={status}
			tweetUrl={tweetUrl}
			analysisResult={analysisResult}
			tagsInput={tagsInput}
			errorMessage={errorMessage}
			authMessage={authMessage}
			saveMessage={saveMessage}
			copyStatus={copyStatus}
			isSaving={isSaving}
			onAnalyze={() => {
				void runAnalyze();
			}}
			onCopyMarkdown={() => {
				void runCopyMarkdown();
			}}
			onToggleConcept={(conceptName) => {
				setTagsInput((currentInput) => toggleTag(currentInput, conceptName));
				setSaveMessage(null);
			}}
			onChangeTagsInput={(value) => {
				setTagsInput(value);
				setErrorMessage(null);
				setSaveMessage(null);
			}}
			onSaveBookmark={() => {
				void runSaveBookmark();
			}}
		/>
	);
}
