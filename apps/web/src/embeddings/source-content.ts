import { createHash } from "node:crypto";

import type { AccountTakeawaySnapshot, AnalyzeTweetResult } from "@tenbrains/contracts";

export function normalizeEmbeddingText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function computeEmbeddingContentHash(text: string): string {
	return createHash("sha256").update(normalizeEmbeddingText(text)).digest("hex");
}

export function buildAnalysisEmbeddingText(analysis: AnalyzeTweetResult): string {
	return [
		analysis.topic,
		analysis.summary,
		analysis.intent,
		...analysis.novelConcepts.map((concept) => concept.name),
	].join("\n");
}

export function buildTakeawayEmbeddingText(snapshot: Pick<AccountTakeawaySnapshot, "summary" | "takeaways">): string {
	return [snapshot.summary, ...snapshot.takeaways].join("\n");
}
