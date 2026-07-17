import type { Concept, ConceptRating } from "./schemas.js";

export type { Concept, ConceptRating };

export interface Post {
  id: string;
  externalId: string | null;
  url: string | null;
  authorUsername: string | null;
  authorName: string | null;
  text: string;
  postedAt: string | null;
  raw: unknown;
  createdAt: string;
}

export interface Analysis {
  id: string;
  postId: string;
  provider: string;
  model: string;
  topic: string;
  summary: string;
  intent: string;
  concepts: Concept[];
  mock: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  username: string;
  name: string | null;
  followedAt: string;
  lastRefreshedAt: string | null;
}

export interface TakeawaySnapshot {
  id: string;
  accountId: string;
  provider: string;
  model: string;
  summary: string;
  takeaways: string[];
  sourcePostIds: string[];
  postCount: number;
  mock: boolean;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  postId: string;
  tags: string[];
  note: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type SuggestionStatus = "pending" | "saved" | "dismissed";

export interface Suggestion {
  id: string;
  postId: string;
  reason: string;
  score: number;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LearningDay {
  day: number;
  concept: string;
  learn: string;
  explain: string;
  check: string;
}

export interface TrackDayProgress {
  day: number;
  notes: string | null;
  completedAt: string;
}

export interface LearningTrack {
  id: string;
  analysisId: string;
  minutesPerDay: number;
  ratings: ConceptRating[];
  days: LearningDay[];
  progress: TrackDayProgress[];
  createdAt: string;
}
