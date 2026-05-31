"use client";

import type { SearchResult } from "@tenbrains/contracts";
import { SearchResponseSchema } from "@tenbrains/contracts";
import { ExternalLink, KeyRound, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

import {
	buildResultLink,
	formatScoreLabel,
	getSourceTypeLabel,
	groupResultsBySourceType,
	SEARCH_SOURCE_TYPE_ORDER,
	truncateSnippet,
} from "./semantic-search-browser-helpers.js";

type SearchBrowserState =
	| { status: "idle" }
	| { status: "loading"; query: string }
	| { status: "error"; query: string; message: string }
	| { status: "results"; query: string; needsKey: boolean; results: SearchResult[] };

const SEARCH_DEBOUNCE_MS = 250;
const SNIPPET_MAX_LENGTH = 280;

function readErrorMessage(payload: unknown, fallback: string): string {
	if (typeof payload !== "object" || payload === null || !("error" in payload)) {
		return fallback;
	}
	const error = payload.error;
	if (typeof error !== "object" || error === null || !("message" in error)) {
		return fallback;
	}
	return typeof error.message === "string" && error.message.trim().length > 0 ? error.message : fallback;
}

async function readResponsePayload(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text.trim()) {
		return null;
	}
	return JSON.parse(text) as unknown;
}

function SearchLoadingSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Loading search results">
			{["bookmark", "analysis", "takeaway"].map((item) => (
				<div key={item} className="border border-outline-variant/10 bg-surface p-5">
					<div className="h-3 w-24 animate-pulse bg-outline-variant/20" />
					<div className="mt-5 h-4 w-11/12 animate-pulse bg-outline-variant/20" />
					<div className="mt-3 h-4 w-8/12 animate-pulse bg-outline-variant/20" />
					<div className="mt-6 h-8 w-28 animate-pulse bg-outline-variant/20" />
				</div>
			))}
		</div>
	);
}

function ResultLink({ result }: Readonly<{ result: SearchResult }>) {
	const link = buildResultLink(result);
	const className =
		"inline-flex items-center gap-2 border border-outline-variant/20 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-secondary transition-colors hover:border-primary/40 hover:text-primary";

	if (link.external) {
		return (
			<a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
				<span>{link.label}</span>
				<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
			</a>
		);
	}

	return (
		<Link href={link.href} className={className}>
			{link.label}
		</Link>
	);
}

function SearchResults({ query, needsKey, results }: Readonly<{ query: string; needsKey: boolean; results: SearchResult[] }>) {
	if (needsKey) {
		return (
			<div className="border border-primary/30 bg-primary/10 p-6">
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div>
						<div className="flex items-center gap-3">
							<KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
							<h2 className="font-headline text-xl uppercase tracking-[-0.02em] text-on-surface">OpenAI key needed</h2>
						</div>
						<p className="mt-3 max-w-3xl font-body text-sm leading-7 text-on-surface-variant">
							Semantic search needs an OpenAI key before Tenbrains can embed your query. Add your OpenAI provider key in account settings, then try this search again.
						</p>
					</div>
					<Link
						href="/account"
						className="inline-flex items-center justify-center bg-primary-container px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-transform hover:scale-[1.02]"
					>
						Account settings
					</Link>
				</div>
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="border border-outline-variant/10 bg-surface p-6">
				<p className="font-body text-sm text-secondary/70">No matches found for {query}.</p>
			</div>
		);
	}

	const grouped = groupResultsBySourceType(results);

	return (
		<div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
			{SEARCH_SOURCE_TYPE_ORDER.map((sourceType) => {
				const groupResults = grouped[sourceType];
				return (
					<section key={sourceType} className="border border-outline-variant/10 bg-surface p-5">
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-mono text-[11px] uppercase tracking-[0.32em] text-primary">{getSourceTypeLabel(sourceType)}</h2>
							<span className="font-mono text-[11px] uppercase tracking-[0.2em] text-secondary/60">{groupResults.length}</span>
						</div>
						<div className="mt-5 flex flex-col gap-4">
							{groupResults.length === 0 ? (
								<p className="font-body text-sm text-secondary/70">No matches in this workspace.</p>
							) : (
								groupResults.map((result) => (
									<article key={`${result.sourceType}-${result.sourceId}`} className="border border-outline-variant/10 bg-surface-container-low p-4">
										<div className="flex items-center justify-between gap-3">
											<span className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary/70">{result.sourceType}</span>
											<span className="border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
												{formatScoreLabel(result.score)}
											</span>
										</div>
										<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">{truncateSnippet(result.text, SNIPPET_MAX_LENGTH)}</p>
										<div className="mt-4">
											<ResultLink result={result} />
										</div>
									</article>
								))
							)}
						</div>
					</section>
				);
			})}
		</div>
	);
}

export function SemanticSearchBrowser() {
	const [query, setQuery] = useState("");
	const [state, setState] = useState<SearchBrowserState>({ status: "idle" });
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestSequenceRef = useRef(0);

	function clearDebounce(): void {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
	}

	async function runSearch(rawQuery: string): Promise<void> {
		clearDebounce();
		const trimmedQuery = rawQuery.trim();
		if (!trimmedQuery) {
			setState({ status: "idle" });
			return;
		}

		const requestSequence = requestSequenceRef.current + 1;
		requestSequenceRef.current = requestSequence;
		setState({ status: "loading", query: trimmedQuery });

		try {
			const response = await fetch("/api/me/search", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ query: trimmedQuery }),
			});
			const rawPayload = await readResponsePayload(response);
			if (!response.ok) {
				throw new Error(readErrorMessage(rawPayload, "Unable to search."));
			}
			const payload = SearchResponseSchema.parse(rawPayload);
			if (requestSequenceRef.current !== requestSequence) {
				return;
			}
			setState({
				status: "results",
				query: payload.query,
				needsKey: payload.needsKey === true,
				results: payload.results,
			});
		} catch (error) {
			if (requestSequenceRef.current !== requestSequence) {
				return;
			}
			setState({
				status: "error",
				query: trimmedQuery,
				message: error instanceof Error ? error.message : "Unexpected search failure.",
			});
		}
	}

	function scheduleSearch(nextQuery: string): void {
		clearDebounce();
		const trimmedQuery = nextQuery.trim();
		if (!trimmedQuery) {
			setState({ status: "idle" });
			return;
		}
		debounceTimerRef.current = setTimeout(() => {
			void runSearch(trimmedQuery);
		}, SEARCH_DEBOUNCE_MS);
	}

	useEffect(() => {
		return () => {
			clearDebounce();
		};
	}, []);

	return (
		<div className="flex flex-col gap-6">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void runSearch(query);
				}}
				className="flex flex-col gap-3 border border-outline-variant/10 bg-surface p-4 md:flex-row md:items-center"
			>
				<label htmlFor="semantic-search-input" className="sr-only">
					Search your saved knowledge
				</label>
				<div className="flex min-w-0 flex-1 items-center gap-3 border border-outline-variant/20 bg-surface-container-low px-4 py-3">
					<Search className="h-4 w-4 shrink-0 text-secondary/70" aria-hidden="true" />
					<input
						id="semantic-search-input"
						type="search"
						value={query}
						onChange={(event) => {
							const nextQuery = event.currentTarget.value;
							setQuery(nextQuery);
							scheduleSearch(nextQuery);
						}}
						placeholder="Search bookmarks, analyses, and takeaways"
						className="min-w-0 flex-1 bg-transparent font-body text-base text-on-surface outline-none placeholder:text-secondary/50"
					/>
				</div>
				<button
					type="submit"
					disabled={state.status === "loading"}
					className="inline-flex items-center justify-center gap-2 bg-primary-container px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-on-primary-container transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
				>
					<Search className="h-4 w-4" aria-hidden="true" />
					<span>{state.status === "loading" ? "Searching" : "Search"}</span>
				</button>
			</form>

			{state.status === "idle" ? (
				<div className="border border-outline-variant/10 bg-surface p-6">
					<p className="font-body text-sm leading-7 text-secondary/70">Enter a query to search across bookmarks, analyses, and takeaway snapshots.</p>
				</div>
			) : null}

			{state.status === "loading" ? <SearchLoadingSkeleton /> : null}

			{state.status === "error" ? (
				<div role="alert" className="border border-primary/30 bg-primary/10 p-6">
					<p className="font-body text-sm text-on-surface">{state.message}</p>
					<button
						type="button"
						onClick={() => {
							void runSearch(state.query);
						}}
						className="mt-4 inline-flex items-center gap-2 border border-primary/40 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary/10"
					>
						<RefreshCw className="h-4 w-4" aria-hidden="true" />
						<span>Try again</span>
					</button>
				</div>
			) : null}

			{state.status === "results" ? <SearchResults query={state.query} needsKey={state.needsKey} results={state.results} /> : null}
		</div>
	);
}
