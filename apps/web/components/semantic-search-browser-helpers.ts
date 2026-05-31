import type { SearchResult, SearchSourceType } from "@tenbrains/contracts";

export interface GroupedSearchResults {
	bookmark: SearchResult[];
	analysis: SearchResult[];
	takeaway: SearchResult[];
}

export interface SearchResultLink {
	href: string;
	label: string;
	external: boolean;
}

export const SEARCH_SOURCE_TYPE_ORDER = ["bookmark", "analysis", "takeaway"] as const satisfies readonly SearchSourceType[];

const SOURCE_TYPE_LABELS = {
	bookmark: "Bookmarks",
	analysis: "Analyses",
	takeaway: "Takeaways",
} as const satisfies Record<SearchSourceType, string>;

export function getSourceTypeLabel(sourceType: SearchSourceType): string {
	return SOURCE_TYPE_LABELS[sourceType];
}

export function groupResultsBySourceType(results: SearchResult[]): GroupedSearchResults {
	const grouped: GroupedSearchResults = {
		bookmark: [],
		analysis: [],
		takeaway: [],
	};

	for (const result of results) {
		grouped[result.sourceType].push(result);
	}

	return grouped;
}

export function buildResultLink(result: SearchResult): SearchResultLink {
	if (result.sourceType === "bookmark") {
		return {
			href: `https://x.com/i/web/status/${encodeURIComponent(result.sourceId)}`,
			label: "View on X",
			external: true,
		};
	}

	if (result.sourceType === "analysis") {
		return {
			href: "/app",
			label: "View in analyses",
			external: false,
		};
	}

	return {
		href: "/app/takeaway",
		label: "View in takeaways",
		external: false,
	};
}

export function formatScoreLabel(score: number): string {
	return `${Math.round(score * 100)}%`;
}

export function truncateSnippet(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	if (max <= 3) {
		return ".".repeat(Math.max(0, max));
	}
	return `${text.slice(0, max - 3).trimEnd()}...`;
}
