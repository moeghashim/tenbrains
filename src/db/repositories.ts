import type { DatabaseSync } from "node:sqlite";
import { CliError } from "../core/errors.js";
import { slugify } from "../core/text.js";
import type {
  Account,
  Analysis,
  Bookmark,
  Concept,
  ConceptRating,
  LearningDay,
  LearningTrack,
  Objective,
  ObjectiveLink,
  ObjectiveRecordType,
  ObjectiveStatus,
  ObjectiveWithCount,
  Post,
  Suggestion,
  SuggestionStatus,
  TakeawaySnapshot,
  TrackDayProgress,
} from "../domain/types.js";
import { type Database, newId, nowIso } from "./database.js";

/** Coerce undefined to null; SQLite bindings reject undefined. */
function nn<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- row shapes --------------------------------------------------------------

interface PostRow {
  id: string;
  external_id: string | null;
  url: string | null;
  author_username: string | null;
  author_name: string | null;
  text: string;
  posted_at: string | null;
  raw_json: string | null;
  created_at: string;
}

interface AnalysisRow {
  id: string;
  post_id: string;
  provider: string;
  model: string;
  topic: string;
  summary: string;
  intent: string;
  concepts_json: string;
  mock: number;
  created_at: string;
}

interface AccountRow {
  id: string;
  username: string;
  name: string | null;
  followed_at: string;
  last_refreshed_at: string | null;
}

interface SnapshotRow {
  id: string;
  account_id: string;
  provider: string;
  model: string;
  summary: string;
  takeaways_json: string;
  source_post_ids_json: string;
  post_count: number;
  mock: number;
  created_at: string;
}

interface BookmarkRow {
  id: string;
  post_id: string;
  tags_json: string;
  note: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface SuggestionRow {
  id: string;
  post_id: string;
  reason: string;
  score: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TrackRow {
  id: string;
  analysis_id: string;
  minutes_per_day: number;
  ratings_json: string;
  days_json: string;
  created_at: string;
}

interface ProgressRow {
  day: number;
  notes: string | null;
  completed_at: string;
}

interface ObjectiveRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  is_focus: number;
  created_at: string;
  updated_at: string;
  link_count?: number | undefined;
}

interface ObjectiveLinkRow {
  objective_id: string;
  record_type: string;
  record_id: string;
  created_at: string;
}

// --- mappers -----------------------------------------------------------------

function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    externalId: row.external_id,
    url: row.url,
    authorUsername: row.author_username,
    authorName: row.author_name,
    text: row.text,
    postedAt: row.posted_at,
    raw: parseJson(row.raw_json),
    createdAt: row.created_at,
  };
}

function mapAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    postId: row.post_id,
    provider: row.provider,
    model: row.model,
    topic: row.topic,
    summary: row.summary,
    intent: row.intent,
    concepts: parseJsonArray<Concept>(row.concepts_json),
    mock: row.mock === 1,
    createdAt: row.created_at,
  };
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    followedAt: row.followed_at,
    lastRefreshedAt: row.last_refreshed_at,
  };
}

function mapSnapshot(row: SnapshotRow): TakeawaySnapshot {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    model: row.model,
    summary: row.summary,
    takeaways: parseJsonArray<string>(row.takeaways_json),
    sourcePostIds: parseJsonArray<string>(row.source_post_ids_json),
    postCount: row.post_count,
    mock: row.mock === 1,
    createdAt: row.created_at,
  };
}

function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    postId: row.post_id,
    tags: parseJsonArray<string>(row.tags_json),
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    postId: row.post_id,
    reason: row.reason,
    score: row.score,
    status: row.status as SuggestionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrack(row: TrackRow, progress: TrackDayProgress[]): LearningTrack {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    minutesPerDay: row.minutes_per_day,
    ratings: parseJsonArray<ConceptRating>(row.ratings_json),
    days: parseJsonArray<LearningDay>(row.days_json),
    progress,
    createdAt: row.created_at,
  };
}

function mapObjective(row: ObjectiveRow): Objective {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status as ObjectiveStatus,
    isFocus: row.is_focus === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapObjectiveLink(row: ObjectiveLinkRow): ObjectiveLink {
  return {
    objectiveId: row.objective_id,
    recordType: row.record_type as ObjectiveRecordType,
    recordId: row.record_id,
    createdAt: row.created_at,
  };
}

export interface NewPost {
  text: string;
  externalId?: string | undefined;
  url?: string | undefined;
  authorUsername?: string | undefined;
  authorName?: string | undefined;
  postedAt?: string | undefined;
  raw?: unknown;
}

// --- repositories ------------------------------------------------------------

export class PostsRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: NewPost): Post {
    const id = newId("post");
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO posts (id, external_id, url, author_username, author_name, text, posted_at, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        nn(data.externalId),
        nn(data.url),
        nn(data.authorUsername),
        nn(data.authorName),
        data.text,
        nn(data.postedAt),
        data.raw === undefined ? null : JSON.stringify(data.raw),
        createdAt,
      );
    return this.findById(id) as Post;
  }

  /** Insert, or return the existing post when externalId already present. */
  ingest(data: NewPost): { post: Post; deduped: boolean } {
    if (data.externalId) {
      const existing = this.findByExternalId(data.externalId);
      if (existing) {
        return { post: existing, deduped: true };
      }
    }
    return { post: this.create(data), deduped: false };
  }

  findById(id: string): Post | null {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as PostRow | undefined;
    return row ? mapPost(row) : null;
  }

  findByExternalId(externalId: string): Post | null {
    const row = this.db.prepare("SELECT * FROM posts WHERE external_id = ?").get(externalId) as
      | PostRow
      | undefined;
    return row ? mapPost(row) : null;
  }

  list(limit: number, offset: number): Post[] {
    const rows = this.db
      .prepare("SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as unknown as PostRow[];
    return rows.map(mapPost);
  }

  all(): Post[] {
    const rows = this.db.prepare("SELECT * FROM posts").all() as unknown as PostRow[];
    return rows.map(mapPost);
  }

  mergeRaw(id: string, patch: Record<string, unknown>): Post {
    const post = this.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found.`);
    }
    const current =
      typeof post.raw === "object" && post.raw !== null && !Array.isArray(post.raw)
        ? (post.raw as Record<string, unknown>)
        : {};
    this.db
      .prepare("UPDATE posts SET raw_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...current, ...patch }), id);
    return this.findById(id) as Post;
  }
}

export class AnalysesRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: {
    postId: string;
    provider: string;
    model: string;
    topic: string;
    summary: string;
    intent: string;
    concepts: Concept[];
    mock: boolean;
  }): Analysis {
    const id = newId("ana");
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO analyses (id, post_id, provider, model, topic, summary, intent, concepts_json, mock, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.postId,
        data.provider,
        data.model,
        data.topic,
        data.summary,
        data.intent,
        JSON.stringify(data.concepts),
        data.mock ? 1 : 0,
        createdAt,
      );
    return this.findById(id) as Analysis;
  }

  findById(id: string): Analysis | null {
    const row = this.db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as
      | AnalysisRow
      | undefined;
    return row ? mapAnalysis(row) : null;
  }

  latestForPost(postId: string): Analysis | null {
    const row = this.db
      .prepare("SELECT * FROM analyses WHERE post_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(postId) as AnalysisRow | undefined;
    return row ? mapAnalysis(row) : null;
  }

  list(limit: number, offset: number, author?: string): Analysis[] {
    if (author) {
      const rows = this.db
        .prepare(
          `SELECT a.* FROM analyses a JOIN posts p ON p.id = a.post_id
           WHERE p.author_username = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(author, limit, offset) as unknown as AnalysisRow[];
      return rows.map(mapAnalysis);
    }
    const rows = this.db
      .prepare("SELECT * FROM analyses ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as unknown as AnalysisRow[];
    return rows.map(mapAnalysis);
  }

  all(): Analysis[] {
    const rows = this.db.prepare("SELECT * FROM analyses").all() as unknown as AnalysisRow[];
    return rows.map(mapAnalysis);
  }
}

export class AccountsRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(username: string, name?: string): Account {
    const id = newId("acc");
    this.db
      .prepare("INSERT INTO accounts (id, username, name, followed_at) VALUES (?, ?, ?, ?)")
      .run(id, username, nn(name), nowIso());
    return this.findById(id) as Account;
  }

  findById(id: string): Account | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
      | AccountRow
      | undefined;
    return row ? mapAccount(row) : null;
  }

  findByUsername(username: string): Account | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE username = ?").get(username) as
      | AccountRow
      | undefined;
    return row ? mapAccount(row) : null;
  }

  list(): Account[] {
    const rows = this.db
      .prepare("SELECT * FROM accounts ORDER BY username ASC")
      .all() as unknown as AccountRow[];
    return rows.map(mapAccount);
  }

  touch(id: string): void {
    this.db.prepare("UPDATE accounts SET last_refreshed_at = ? WHERE id = ?").run(nowIso(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  }
}

export class SnapshotsRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: {
    accountId: string;
    provider: string;
    model: string;
    summary: string;
    takeaways: string[];
    sourcePostIds: string[];
    mock: boolean;
  }): TakeawaySnapshot {
    const id = newId("snap");
    this.db
      .prepare(
        `INSERT INTO takeaway_snapshots
         (id, account_id, provider, model, summary, takeaways_json, source_post_ids_json, post_count, mock, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.accountId,
        data.provider,
        data.model,
        data.summary,
        JSON.stringify(data.takeaways),
        JSON.stringify(data.sourcePostIds),
        data.sourcePostIds.length,
        data.mock ? 1 : 0,
        nowIso(),
      );
    return this.findById(id) as TakeawaySnapshot;
  }

  findById(id: string): TakeawaySnapshot | null {
    const row = this.db.prepare("SELECT * FROM takeaway_snapshots WHERE id = ?").get(id) as
      | SnapshotRow
      | undefined;
    return row ? mapSnapshot(row) : null;
  }

  latestByAccount(accountId: string): TakeawaySnapshot | null {
    const row = this.db
      .prepare(
        "SELECT * FROM takeaway_snapshots WHERE account_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(accountId) as SnapshotRow | undefined;
    return row ? mapSnapshot(row) : null;
  }

  listByAccount(accountId: string, limit: number): TakeawaySnapshot[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM takeaway_snapshots WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(accountId, limit) as unknown as SnapshotRow[];
    return rows.map(mapSnapshot);
  }

  all(): TakeawaySnapshot[] {
    const rows = this.db
      .prepare("SELECT * FROM takeaway_snapshots")
      .all() as unknown as SnapshotRow[];
    return rows.map(mapSnapshot);
  }
}

export class BookmarksRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: { postId: string; tags: string[]; note?: string; source: string }): Bookmark {
    const id = newId("bm");
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO bookmarks (id, post_id, tags_json, note, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, data.postId, JSON.stringify(data.tags), nn(data.note), data.source, ts, ts);
    return this.findById(id) as Bookmark;
  }

  findById(id: string): Bookmark | null {
    const row = this.db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id) as
      | BookmarkRow
      | undefined;
    return row ? mapBookmark(row) : null;
  }

  findByPostId(postId: string): Bookmark | null {
    const row = this.db.prepare("SELECT * FROM bookmarks WHERE post_id = ?").get(postId) as
      | BookmarkRow
      | undefined;
    return row ? mapBookmark(row) : null;
  }

  list(limit: number, offset: number): Bookmark[] {
    const rows = this.db
      .prepare("SELECT * FROM bookmarks ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as unknown as BookmarkRow[];
    return rows.map(mapBookmark);
  }

  all(): Bookmark[] {
    const rows = this.db.prepare("SELECT * FROM bookmarks").all() as unknown as BookmarkRow[];
    return rows.map(mapBookmark);
  }

  updateTags(id: string, tags: string[]): Bookmark {
    this.db
      .prepare("UPDATE bookmarks SET tags_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(tags), nowIso(), id);
    return this.findById(id) as Bookmark;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
  }
}

export class SuggestionsRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** Insert a pending suggestion or refresh score/reason if one exists for the post. */
  upsert(data: { postId: string; reason: string; score: number }): Suggestion {
    const existing = this.findByPostId(data.postId);
    const ts = nowIso();
    if (existing) {
      if (existing.status === "pending") {
        this.db
          .prepare("UPDATE suggestions SET reason = ?, score = ?, updated_at = ? WHERE id = ?")
          .run(data.reason, data.score, ts, existing.id);
      }
      return this.findById(existing.id) as Suggestion;
    }
    const id = newId("sug");
    this.db
      .prepare(
        `INSERT INTO suggestions (id, post_id, reason, score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, data.postId, data.reason, data.score, ts, ts);
    return this.findById(id) as Suggestion;
  }

  findById(id: string): Suggestion | null {
    const row = this.db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id) as
      | SuggestionRow
      | undefined;
    return row ? mapSuggestion(row) : null;
  }

  findByPostId(postId: string): Suggestion | null {
    const row = this.db.prepare("SELECT * FROM suggestions WHERE post_id = ?").get(postId) as
      | SuggestionRow
      | undefined;
    return row ? mapSuggestion(row) : null;
  }

  list(status: SuggestionStatus | "all", limit: number): Suggestion[] {
    if (status === "all") {
      const rows = this.db
        .prepare("SELECT * FROM suggestions ORDER BY score DESC, created_at DESC LIMIT ?")
        .all(limit) as unknown as SuggestionRow[];
      return rows.map(mapSuggestion);
    }
    const rows = this.db
      .prepare(
        "SELECT * FROM suggestions WHERE status = ? ORDER BY score DESC, created_at DESC LIMIT ?",
      )
      .all(status, limit) as unknown as SuggestionRow[];
    return rows.map(mapSuggestion);
  }

  setStatus(id: string, status: SuggestionStatus): Suggestion {
    this.db
      .prepare("UPDATE suggestions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, nowIso(), id);
    return this.findById(id) as Suggestion;
  }
}

export class TracksRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: {
    analysisId: string;
    minutesPerDay: number;
    ratings: ConceptRating[];
    days: LearningDay[];
  }): LearningTrack {
    const id = newId("trk");
    this.db
      .prepare(
        `INSERT INTO learning_tracks (id, analysis_id, minutes_per_day, ratings_json, days_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.analysisId,
        data.minutesPerDay,
        JSON.stringify(data.ratings),
        JSON.stringify(data.days),
        nowIso(),
      );
    return this.findById(id) as LearningTrack;
  }

  findById(id: string): LearningTrack | null {
    const row = this.db.prepare("SELECT * FROM learning_tracks WHERE id = ?").get(id) as
      | TrackRow
      | undefined;
    return row ? mapTrack(row, this.progressFor(row.id)) : null;
  }

  list(limit: number, analysisId?: string): LearningTrack[] {
    if (analysisId) {
      const rows = this.db
        .prepare(
          "SELECT * FROM learning_tracks WHERE analysis_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .all(analysisId, limit) as unknown as TrackRow[];
      return rows.map((row) => mapTrack(row, this.progressFor(row.id)));
    }
    const rows = this.db
      .prepare("SELECT * FROM learning_tracks ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as TrackRow[];
    return rows.map((row) => mapTrack(row, this.progressFor(row.id)));
  }

  progressFor(trackId: string): TrackDayProgress[] {
    const rows = this.db
      .prepare(
        "SELECT day, notes, completed_at FROM track_progress WHERE track_id = ? ORDER BY day",
      )
      .all(trackId) as unknown as ProgressRow[];
    return rows.map((row) => ({ day: row.day, notes: row.notes, completedAt: row.completed_at }));
  }

  /** Record a day as done. Caller guards against duplicates (PK would throw). */
  markDone(trackId: string, day: number, notes?: string): LearningTrack {
    this.db
      .prepare(
        "INSERT INTO track_progress (track_id, day, notes, completed_at) VALUES (?, ?, ?, ?)",
      )
      .run(trackId, day, nn(notes), nowIso());
    return this.findById(trackId) as LearningTrack;
  }
}

const OBJECTIVE_RECORD_TYPES = ["post", "account", "bookmark", "track"] as const;

function isObjectiveRecordType(value: string): value is ObjectiveRecordType {
  return OBJECTIVE_RECORD_TYPES.some((type) => type === value);
}

export class ObjectivesRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(data: { name: string; description?: string | undefined; focus?: boolean }): Objective {
    const name = data.name.trim();
    const slug = slugify(name);
    if (!name || !slug) {
      throw new CliError("VALIDATION", "Objective name must contain letters or numbers.");
    }
    if (this.get(slug)) {
      throw new CliError("CONFLICT", `Objective "${slug}" already exists.`, {
        details: { slug },
      });
    }

    const id = newId("obj");
    const timestamp = nowIso();
    this.db.exec("BEGIN");
    try {
      if (data.focus) {
        this.db
          .prepare("UPDATE objectives SET is_focus = 0, updated_at = ? WHERE is_focus = 1")
          .run(timestamp);
      }
      this.db
        .prepare(
          `INSERT INTO objectives
           (id, slug, name, description, status, is_focus, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          id,
          slug,
          name,
          nn(data.description?.trim() || undefined),
          data.focus ? 1 : 0,
          timestamp,
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(id) as Objective;
  }

  get(ref: string): Objective | null {
    const row = (
      ref.startsWith("obj_")
        ? this.db.prepare("SELECT * FROM objectives WHERE id = ?")
        : this.db.prepare("SELECT * FROM objectives WHERE slug = ?")
    ).get(ref) as ObjectiveRow | undefined;
    return row ? mapObjective(row) : null;
  }

  list(status: ObjectiveStatus | "all" = "active"): ObjectiveWithCount[] {
    const where = status === "all" ? "" : "WHERE o.status = ?";
    const statement = this.db.prepare(
      `SELECT o.*, COUNT(l.objective_id) AS link_count
       FROM objectives o
       LEFT JOIN objective_links l ON l.objective_id = o.id
       ${where}
       GROUP BY o.id
       ORDER BY o.is_focus DESC, o.name COLLATE NOCASE ASC`,
    );
    const rows = (status === "all"
      ? statement.all()
      : statement.all(status)) as unknown as ObjectiveRow[];
    return rows.map((row) => ({ ...mapObjective(row), linkCount: Number(row.link_count ?? 0) }));
  }

  focus(): Objective | null {
    const row = this.db.prepare("SELECT * FROM objectives WHERE is_focus = 1 LIMIT 1").get() as
      | ObjectiveRow
      | undefined;
    return row ? mapObjective(row) : null;
  }

  setFocus(ref: string | null): Objective | null {
    const objective = ref === null ? null : this.get(ref);
    if (ref !== null && !objective) {
      throw new CliError("NOT_FOUND", `No objective with slug or id "${ref}".`, {
        details: { objective: ref },
      });
    }
    if (objective?.status === "archived") {
      throw new CliError("CONFLICT", `Archived objective "${objective.slug}" cannot be focused.`, {
        details: { slug: objective.slug },
      });
    }

    const timestamp = nowIso();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE objectives SET is_focus = 0, updated_at = ? WHERE is_focus = 1")
        .run(timestamp);
      if (objective) {
        this.db
          .prepare("UPDATE objectives SET is_focus = 1, updated_at = ? WHERE id = ?")
          .run(timestamp, objective.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return objective ? (this.get(objective.id) as Objective) : null;
  }

  archive(ref: string): Objective {
    const objective = this.get(ref);
    if (!objective) {
      throw new CliError("NOT_FOUND", `No objective with slug or id "${ref}".`, {
        details: { objective: ref },
      });
    }
    this.db
      .prepare(
        "UPDATE objectives SET status = 'archived', is_focus = 0, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), objective.id);
    return this.get(objective.id) as Objective;
  }

  link(ref: string, recordType: ObjectiveRecordType, recordId: string): boolean {
    const objective = this.get(ref);
    if (!objective) {
      throw new CliError("NOT_FOUND", `No objective with slug or id "${ref}".`, {
        details: { objective: ref },
      });
    }
    if (!isObjectiveRecordType(recordType)) {
      throw new CliError("VALIDATION", `Unsupported objective record type "${recordType}".`);
    }
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO objective_links
         (objective_id, record_type, record_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(objective.id, recordType, recordId, nowIso());
    return Number(result.changes) > 0;
  }

  unlink(ref: string, recordType: ObjectiveRecordType, recordId: string): boolean {
    const objective = this.get(ref);
    if (!objective) {
      throw new CliError("NOT_FOUND", `No objective with slug or id "${ref}".`, {
        details: { objective: ref },
      });
    }
    const result = this.db
      .prepare(
        `DELETE FROM objective_links
         WHERE objective_id = ? AND record_type = ? AND record_id = ?`,
      )
      .run(objective.id, recordType, recordId);
    return Number(result.changes) > 0;
  }

  links(ref: string): ObjectiveLink[] {
    const objective = this.get(ref);
    if (!objective) {
      throw new CliError("NOT_FOUND", `No objective with slug or id "${ref}".`, {
        details: { objective: ref },
      });
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM objective_links
         WHERE objective_id = ? ORDER BY record_type, created_at, record_id`,
      )
      .all(objective.id) as unknown as ObjectiveLinkRow[];
    return rows.map(mapObjectiveLink);
  }

  forRecord(recordType: ObjectiveRecordType, recordId: string): Objective[] {
    const rows = this.db
      .prepare(
        `SELECT o.* FROM objectives o
         JOIN objective_links l ON l.objective_id = o.id
         WHERE l.record_type = ? AND l.record_id = ?
         ORDER BY o.is_focus DESC, o.name COLLATE NOCASE ASC`,
      )
      .all(recordType, recordId) as unknown as ObjectiveRow[];
    return rows.map(mapObjective);
  }
}

/** Facade exposing every repository over a single Database. */
export class Store {
  readonly posts: PostsRepo;
  readonly analyses: AnalysesRepo;
  readonly accounts: AccountsRepo;
  readonly snapshots: SnapshotsRepo;
  readonly bookmarks: BookmarksRepo;
  readonly suggestions: SuggestionsRepo;
  readonly tracks: TracksRepo;
  readonly objectives: ObjectivesRepo;

  constructor(readonly database: Database) {
    const handle = database.handle;
    this.posts = new PostsRepo(handle);
    this.analyses = new AnalysesRepo(handle);
    this.accounts = new AccountsRepo(handle);
    this.snapshots = new SnapshotsRepo(handle);
    this.bookmarks = new BookmarksRepo(handle);
    this.suggestions = new SuggestionsRepo(handle);
    this.tracks = new TracksRepo(handle);
    this.objectives = new ObjectivesRepo(handle);
  }

  transaction<T>(fn: () => T): T {
    return this.database.transaction(fn);
  }
}
