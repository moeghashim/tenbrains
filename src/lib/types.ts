export type Level = "Noob" | "Rookie" | "Pro" | "Ninja";
export type Account = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  avatar?: string;
  followers: number;
  following: number;
  tags: string[];
};
export type Media = {
  type: "image" | "video";
  url: string;
  poster?: string;
  duration?: number;
  captions?: boolean;
};
export type Analysis = {
  title: string;
  summary: string;
  tags: string[];
  sourceNote: string;
  concepts: string[];
  isTeachable: boolean;
};
export type Post = {
  id: string;
  accountId: string;
  text: string;
  createdAt: string;
  media: Media[];
  tags: string[];
  threadId?: string;
  position?: number;
  analysis?: Analysis;
};
export type Feedback = {
  kind: "ok" | "gap" | "jargon" | "example" | "length";
  text: string;
  sourceRef?: string;
};
export type Explanation = {
  id: string;
  /** Zero-based index into the path's days. */
  day: number;
  text: string;
  score: number;
  feedback: Feedback[];
  createdAt: string;
};
export type Lesson = {
  concept: string;
  lesson: string;
  sourcePostIds: string[];
};
export type Suggestion = { postId: string; minLevel: Level };
export type LearnPath = {
  id: string;
  title: string;
  tag: string;
  sourceLabel: string;
  days: Lesson[];
  /** Zero-based index into days. */
  currentDay: number;
  explanations: Explanation[];
  suggestions: Suggestion[];
};
export type Capture = {
  id: string;
  url: string;
  detectedType: "profile" | "post" | "thread" | "import";
  postIds: string[];
  accountId?: string;
  analysis?: Analysis;
  decision: "follow" | "learn" | "none";
  status: "ready" | "error";
};
export type AppState = {
  user: { id: string; name: string; handle: string };
  accounts: Account[];
  posts: Post[];
  paths: LearnPath[];
  captures: Capture[];
  followedAccounts: string[];
  followedTags: string[];
  lastRefreshed?: string;
};
export type Action =
  | { type: "capture"; url: string }
  | { type: "import"; cursor?: string }
  | { type: "followAccount"; accountId: string; follow: boolean }
  | { type: "followTag"; tag: string; follow: boolean }
  | { type: "analyze"; postId: string }
  | { type: "learn"; postIds?: string[]; tag?: string; captureId?: string }
  | { type: "grade"; pathId: string; day: number; text: string }
  | { type: "decide"; captureId: string; decision: "follow" | "learn" }
  | { type: "refresh" };
export type ProgressEvent =
  | { stage: string; message: string }
  | { state: AppState; nextCursor?: string }
  | { error: string };
