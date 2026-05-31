import { z } from "zod";

export const SearchSourceTypeSchema = z.enum(["bookmark", "analysis", "takeaway"]);

export const SearchRequestSchema = z.object({
	query: z.string().trim().min(1).max(256),
	sourceTypes: z.array(SearchSourceTypeSchema).optional(),
	limit: z.number().int().min(1).max(50).optional(),
});

export const SearchResultSchema = z.object({
	sourceType: SearchSourceTypeSchema,
	sourceId: z.string(),
	text: z.string(),
	score: z.number(),
	createdAt: z.number(),
	updatedAt: z.number(),
});

export const SearchResponseSchema = z.object({
	query: z.string(),
	needsKey: z.boolean().optional(),
	results: z.array(SearchResultSchema),
});

export type SearchSourceType = z.infer<typeof SearchSourceTypeSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
