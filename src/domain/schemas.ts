import { z } from "zod";

/** A novel concept extracted from a post (mirrors the original tenbrains shape). */
export const ConceptSchema = z.object({
  name: z.string().min(1),
  whyItMattersInTweet: z.string().min(1),
});

/**
 * AI analysis output. The prompt asks for exactly 5 concepts; we accept 1-10 so
 * a slightly off-spec provider response still persists rather than hard-failing.
 */
export const AnalysisResultSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  intent: z.string().min(1),
  novelConcepts: z.array(ConceptSchema).min(1).max(10),
});

/** AI account-takeaway output. */
export const TakeawayResultSchema = z.object({
  summary: z.string().min(1),
  takeaways: z.array(z.string().min(1)).min(1).max(8),
});

const RatingValue = z.coerce.number().int().min(1).max(5);

/** A user/agent rating of one concept, used to prioritize a learning track. */
export const ConceptRatingSchema = z.object({
  concept: z.string().min(1),
  familiarity: RatingValue,
  interest: RatingValue,
});

export const RatingsInputSchema = z.array(ConceptRatingSchema);

/** Input shape for ingesting a single post (`analyze`, `bookmark add`). */
export const PostInputSchema = z.object({
  text: z.string().min(1, "post text is required"),
  url: z.string().url().optional(),
  externalId: z.string().min(1).optional(),
  authorUsername: z.string().min(1).optional(),
  authorName: z.string().min(1).optional(),
  postedAt: z.string().min(1).optional(),
});

/** Input shape for one of the recent posts fed into `takeaway refresh`. */
export const TakeawayPostInputSchema = z.object({
  text: z.string().min(1),
  externalId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  postedAt: z.string().min(1).optional(),
});

export const TakeawayPostsInputSchema = z.array(TakeawayPostInputSchema).min(1);

export type Concept = z.infer<typeof ConceptSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type TakeawayResult = z.infer<typeof TakeawayResultSchema>;
export type ConceptRating = z.infer<typeof ConceptRatingSchema>;
export type PostInput = z.infer<typeof PostInputSchema>;
export type TakeawayPostInput = z.infer<typeof TakeawayPostInputSchema>;
