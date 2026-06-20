/**
 * Programmatic API. The CLI is the primary surface, but the same building
 * blocks are exported so the analysis/persistence pipeline can be embedded.
 */
export { buildProgram, run } from "./cli.js";
export { Database, newId, nowIso } from "./db/database.js";
export { Store } from "./db/repositories.js";
export { ConfigStore } from "./core/config.js";
export { CliError, type ErrorCode } from "./core/errors.js";
export { searchCorpus } from "./domain/search.js";
export { generateSuggestions } from "./domain/suggest.js";
export { buildFeynmanTrack, prioritizeConcepts } from "./domain/learn.js";
export { suggestTags } from "./domain/tags.js";
export { analyzePost, summarizeAccount } from "./ai/analyzer.js";
export {
  DEFAULT_PROVIDER,
  PROVIDER_CATALOG,
  PROVIDER_IDS,
  type ProviderId,
} from "./ai/providers.js";
export * from "./domain/types.js";
export {
  AnalysisResultSchema,
  ConceptRatingSchema,
  ConceptSchema,
  PostInputSchema,
  RatingsInputSchema,
  TakeawayPostInputSchema,
  TakeawayPostsInputSchema,
  TakeawayResultSchema,
} from "./domain/schemas.js";
export type {
  AnalysisResult,
  PostInput,
  TakeawayPostInput,
  TakeawayResult,
} from "./domain/schemas.js";
