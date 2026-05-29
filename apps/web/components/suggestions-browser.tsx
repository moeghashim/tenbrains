"use client";

import type { Suggestion } from "@tenbrains/contracts";
import React, { useEffect, useState } from "react";

import { readJsonResponse, readResponseErrorMessage, type ApiErrorPayload } from "../src/http/read-json-response.js";

interface SuggestionsResponseSuccess {
	suggestions: Suggestion[];
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

export function SuggestionsBrowser() {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function loadSuggestions(): Promise<void> {
		setIsLoading(true);
		setErrorMessage(null);
		try {
			const response = await fetch("/api/me/suggestions", {
				method: "GET",
				headers: {
					"content-type": "application/json",
				},
			});
			const payload = await readJsonResponse<SuggestionsResponseSuccess | ApiErrorPayload>(response);
			if (!response.ok || !payload || !("suggestions" in payload)) {
				throw new Error(readResponseErrorMessage(payload, "Unable to load suggestions."));
			}
			setSuggestions(payload.suggestions);
		} catch (error) {
			setSuggestions([]);
			setErrorMessage(error instanceof Error ? error.message : "Unexpected suggestions load failure.");
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		void loadSuggestions();
	}, []);

	async function actOnSuggestion(suggestionId: string, mode: "save" | "dismiss"): Promise<void> {
		setPendingSuggestionId(suggestionId);
		setErrorMessage(null);
		try {
			const response = await fetch(`/api/me/suggestions/${mode}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ suggestionId }),
			});
			const payload = await readJsonResponse<SuggestionsResponseSuccess | ApiErrorPayload>(response);
			if (!response.ok || !payload || !("suggestions" in payload)) {
				throw new Error(readResponseErrorMessage(payload, `Unable to ${mode} suggestion.`));
			}
			setSuggestions(payload.suggestions);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : `Unexpected ${mode} failure.`);
		} finally {
			setPendingSuggestionId(null);
		}
	}

	if (isLoading) {
		return (
			<div className="border border-outline-variant/10 bg-surface-container-low p-6">
				<p className="font-body text-sm text-secondary/70">Loading suggestions...</p>
			</div>
		);
	}

	if (errorMessage) {
		return (
			<p role="alert" className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface">
				{errorMessage}
			</p>
		);
	}

	if (suggestions.length === 0) {
		return (
			<div className="border border-outline-variant/10 bg-surface-container-low p-6">
				<p className="font-body text-sm text-secondary/70">
					No suggestions yet. Tenbrains will surface new posts once enough bookmark, follow, and takeaway signal is available.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{suggestions.map((suggestion) => (
				<article key={suggestion.id} className="border border-outline-variant/10 bg-surface p-5">
					<div className="flex flex-wrap gap-2">
						{suggestion.reasons.map((reason) => (
							<span
								key={`${suggestion.id}-${reason.code}-${reason.label}`}
								className="border border-primary/35 bg-primary/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-primary"
							>
								{reason.label}
							</span>
						))}
					</div>
					<div className="mt-4 flex items-center justify-between gap-4">
						<div>
							<p className="font-headline text-2xl uppercase tracking-[-0.03em] text-on-surface">@{suggestion.authorUsername}</p>
							<p className="mt-1 font-body text-sm text-secondary/70">
								Score {Math.round(suggestion.score)} • Updated {formatDate(suggestion.updatedAt)}
							</p>
						</div>
					</div>
					<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">{suggestion.tweetText}</p>
					<div className="mt-4 flex flex-wrap gap-2">
						{suggestion.suggestedTags.map((tag) => (
							<span
								key={`${suggestion.id}-tag-${tag}`}
								className="border border-outline-variant/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-secondary/80"
							>
								{tag}
							</span>
						))}
					</div>
					<div className="mt-5 flex flex-wrap gap-2">
						<button
							type="button"
							disabled={pendingSuggestionId === suggestion.id}
							onClick={() => {
								void actOnSuggestion(suggestion.id, "save");
							}}
							className="bg-primary-container px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container disabled:cursor-not-allowed disabled:opacity-60"
						>
							{pendingSuggestionId === suggestion.id ? "Working..." : "Save"}
						</button>
						<button
							type="button"
							disabled={pendingSuggestionId === suggestion.id}
							onClick={() => {
								void actOnSuggestion(suggestion.id, "dismiss");
							}}
							className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
						>
							Dismiss
						</button>
						<a
							href={suggestion.tweetUrlOrId}
							target="_blank"
							rel="noreferrer"
							className="border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary"
						>
							Open on X
						</a>
					</div>
				</article>
			))}
		</div>
	);
}
