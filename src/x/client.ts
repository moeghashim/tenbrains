import { CliError } from "../core/errors.js";

/**
 * X (Twitter) fetching, designed free-first.
 *
 * - Single tweets default to the public **oEmbed** endpoint
 *   (`publish.twitter.com/oembed`), which needs no API key and no paid tier —
 *   it returns a public tweet's text and author for embedding.
 * - Account **timelines** have no free path, so they use the official X API v2
 *   with a Bearer token. Most accounts need a paid tier (Basic+) to read
 *   timelines; when the tier doesn't permit it the call surfaces a structured
 *   PROVIDER_* error and the caller can fall back to supplying `--posts`.
 */

export interface FetchedTweet {
  text: string;
  externalId?: string | undefined;
  url?: string | undefined;
  authorUsername?: string | undefined;
  authorName?: string | undefined;
  postedAt?: string | undefined;
  conversationId?: string | undefined;
}

export type FetchMode = "auto" | "oembed" | "api";

export function isFetchMode(value: string): value is FetchMode {
  return value === "auto" || value === "oembed" || value === "api";
}

const REQUEST_TIMEOUT_MS = 15_000;
const OEMBED_ENDPOINT = "https://publish.twitter.com/oembed";
const API_BASE = "https://api.twitter.com/2";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

function idFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  const match = url.match(/status(?:es)?\/(\d+)/i);
  return match ? match[1] : undefined;
}

/** Parse a tweet reference: a bare numeric id or any twitter.com / x.com URL. */
export function parseTweetRef(input: string): { id: string | undefined; url: string } {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed, url: `https://twitter.com/i/status/${trimmed}` };
  }
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i);
  if (match) {
    return { id: match[1], url: trimmed.replace(/^http:/i, "https:") };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { id: undefined, url: trimmed };
  }
  throw new CliError("USAGE", `Could not parse a tweet id or URL from "${input}".`, {
    details: { input },
  });
}

// --- oEmbed (free) -----------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const num =
        code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Extract readable tweet text from the oEmbed HTML blockquote. */
function extractTweetText(html: string): string {
  const paragraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const inner = paragraph ? (paragraph[1] ?? "") : html;
  const withBreaks = inner.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeEntities(stripped)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The blockquote's trailing link text is the post date ("June 20, 2026").
 * Day-level precision only, but the free path otherwise has no date at all.
 */
function extractTweetDate(html: string): string | undefined {
  const links = [...html.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
  const last = links[links.length - 1]?.[1];
  if (!last) {
    return undefined;
  }
  const date = new Date(`${decodeEntities(last).trim()} UTC`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Pure parser for an oEmbed payload — unit-testable without network. */
export function parseOembedPayload(payload: unknown, fallbackUrl: string): FetchedTweet {
  const record = asRecord(payload);
  const html = typeof record.html === "string" ? record.html : "";
  const text = extractTweetText(html);
  if (!text) {
    throw new CliError("PROVIDER_BAD_OUTPUT", "Could not extract tweet text from oEmbed response.");
  }
  const url = typeof record.url === "string" ? record.url : fallbackUrl;
  const authorName = typeof record.author_name === "string" ? record.author_name : undefined;
  const authorUrl = typeof record.author_url === "string" ? record.author_url : undefined;
  const authorUsername = authorUrl ? authorUrl.split("/").filter(Boolean).pop() : undefined;
  return {
    text,
    url,
    authorName,
    authorUsername,
    postedAt: extractTweetDate(html),
    externalId: idFromUrl(url) ?? idFromUrl(fallbackUrl),
  };
}

async function fetchTweetOembed(url: string): Promise<FetchedTweet> {
  const endpoint = `${OEMBED_ENDPOINT}?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`;
  const response = await safeFetch(endpoint, {}, "oembed");
  if (response.status === 404) {
    throw new CliError("NOT_FOUND", "Tweet not found, deleted, or not public (oEmbed).", {
      details: { url },
    });
  }
  if (!response.ok) {
    throw mapXStatus(response.status, "oembed", `request failed (${response.status})`);
  }
  return parseOembedPayload(await response.json(), url);
}

// --- official API (Bearer token) ---------------------------------------------

async function fetchTweetApi(id: string, bearer: string): Promise<FetchedTweet> {
  const url = `${API_BASE}/tweets/${id}?expansions=author_id&tweet.fields=created_at,conversation_id&user.fields=username,name`;
  const response = await apiGet(url, bearer);
  const payload = asRecord(await response.json());
  const data = asRecord(payload.data);
  const users = asRecord(payload.includes).users;
  const author = Array.isArray(users) ? asRecord(users[0]) : {};
  const text = typeof data.text === "string" ? data.text : "";
  if (!text) {
    throw new CliError("PROVIDER_BAD_OUTPUT", "X API returned a tweet without text.");
  }
  const username = typeof author.username === "string" ? author.username : undefined;
  const tweetId = typeof data.id === "string" ? data.id : id;
  return {
    text,
    externalId: tweetId,
    url: `https://x.com/${username ?? "i"}/status/${tweetId}`,
    authorUsername: username,
    authorName: typeof author.name === "string" ? author.name : undefined,
    postedAt: typeof data.created_at === "string" ? data.created_at : undefined,
    conversationId: typeof data.conversation_id === "string" ? data.conversation_id : undefined,
  };
}

interface XUser {
  id: string;
  username: string;
  name?: string | undefined;
}

async function fetchUserByUsername(username: string, bearer: string): Promise<XUser> {
  const url = `${API_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=name`;
  const response = await apiGet(url, bearer);
  const data = asRecord(asRecord(await response.json()).data);
  if (typeof data.id !== "string") {
    throw new CliError("NOT_FOUND", `X account @${username} not found.`, { details: { username } });
  }
  return {
    id: data.id,
    username: typeof data.username === "string" ? data.username : username,
    name: typeof data.name === "string" ? data.name : undefined,
  };
}

/**
 * Fetch an account's recent original posts (retweets/replies excluded) via the
 * official API. Requires a Bearer token whose access tier permits timeline reads.
 */
export async function fetchAccountTimeline(
  username: string,
  bearer: string,
  count: number,
): Promise<FetchedTweet[]> {
  const user = await fetchUserByUsername(username, bearer);
  const max = Math.min(100, Math.max(5, count));
  const url = `${API_BASE}/users/${user.id}/tweets?max_results=${max}&exclude=retweets,replies&tweet.fields=created_at`;
  const response = await apiGet(url, bearer);
  const data = asRecord(await response.json()).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((entry) => {
      const record = asRecord(entry);
      const id = typeof record.id === "string" ? record.id : "";
      return {
        text: typeof record.text === "string" ? record.text : "",
        externalId: id,
        url: `https://x.com/${user.username}/status/${id}`,
        postedAt: typeof record.created_at === "string" ? record.created_at : undefined,
      } satisfies FetchedTweet;
    })
    .filter((tweet) => tweet.text.length > 0);
}

// --- threads (official API) ---------------------------------------------------

/** Numeric-string tweet ids (snowflakes) compare by length, then lexically. */
function compareTweetIds(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pure parser for a recent-search payload: the author's replies in a conversation. */
export function parseThreadSearchPayload(
  payload: unknown,
  username: string | undefined,
): FetchedTweet[] {
  const data = asRecord(payload).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((entry) => {
      const record = asRecord(entry);
      const id = typeof record.id === "string" ? record.id : "";
      return {
        text: typeof record.text === "string" ? record.text : "",
        externalId: id,
        url: `https://x.com/${username ?? "i"}/status/${id}`,
        authorUsername: username,
        postedAt: typeof record.created_at === "string" ? record.created_at : undefined,
      } satisfies FetchedTweet;
    })
    .filter((tweet) => tweet.text.length > 0 && tweet.externalId.length > 0);
}

/** Merge the root tweet with its replies, deduped by id and in posting order. */
export function assembleThread(root: FetchedTweet, replies: FetchedTweet[]): FetchedTweet[] {
  const byId = new Map<string, FetchedTweet>();
  for (const tweet of [root, ...replies]) {
    if (tweet.externalId) {
      byId.set(tweet.externalId, tweet);
    }
  }
  if (byId.size === 0) {
    return [root];
  }
  return [...byId.values()].sort((a, b) => compareTweetIds(a.externalId ?? "", b.externalId ?? ""));
}

export interface ThreadFetchResult {
  root: FetchedTweet;
  parts: FetchedTweet[];
  /** False when the reply search was unavailable and only the root was fetched. */
  complete: boolean;
}

/**
 * Fetch a self-thread via the official API: the tweet itself plus the author's
 * own replies in the same conversation. Recent search only covers ~7 days and
 * some access tiers exclude it — in those cases the result degrades to the
 * root tweet with `complete: false` instead of failing.
 */
export async function fetchThread(refInput: string, bearer: string): Promise<ThreadFetchResult> {
  const ref = parseTweetRef(refInput);
  if (!ref.id) {
    throw new CliError("USAGE", "Fetching a thread needs a numeric tweet id or a status URL.");
  }
  const root = await fetchTweetApi(ref.id, bearer);
  const conversationId = root.conversationId ?? ref.id;
  const username = root.authorUsername;

  let replies: FetchedTweet[] = [];
  let complete = false;
  if (username) {
    const query = `conversation_id:${conversationId} from:${username} to:${username}`;
    const url = `${API_BASE}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=100&tweet.fields=created_at`;
    try {
      const response = await apiGet(url, bearer);
      replies = parseThreadSearchPayload(await response.json(), username);
      complete = true;
    } catch (error) {
      // A tier without recent search shouldn't sink the whole command.
      if (!(error instanceof CliError) || error.code !== "PROVIDER_UNAUTHORIZED") {
        throw error;
      }
    }
  }

  return { root, parts: assembleThread(root, replies), complete };
}

// --- orchestration -----------------------------------------------------------

export interface TweetFetchResult {
  tweet: FetchedTweet;
  source: "x:oembed" | "x:api";
}

/**
 * Fetch one tweet, free-first. `auto` tries oEmbed (free) and only falls back to
 * the API when oEmbed fails and a Bearer token is available.
 */
export async function fetchTweet(
  refInput: string,
  mode: FetchMode,
  bearer: string | null,
): Promise<TweetFetchResult> {
  const ref = parseTweetRef(refInput);

  if (mode === "api") {
    if (!bearer) {
      throw new CliError(
        "MISSING_CREDENTIALS",
        "--fetch api needs an X Bearer token. Configure it with `tenbrains setup --x-bearer <token>`.",
      );
    }
    if (!ref.id) {
      throw new CliError("USAGE", "--fetch api needs a numeric tweet id or a status URL.");
    }
    return { tweet: await fetchTweetApi(ref.id, bearer), source: "x:api" };
  }

  if (mode === "oembed") {
    return { tweet: await fetchTweetOembed(ref.url), source: "x:oembed" };
  }

  // auto: free first, fall back to the API only if a token is present.
  try {
    return { tweet: await fetchTweetOembed(ref.url), source: "x:oembed" };
  } catch (error) {
    if (bearer && ref.id) {
      return { tweet: await fetchTweetApi(ref.id, bearer), source: "x:api" };
    }
    throw error;
  }
}

// --- HTTP helpers ------------------------------------------------------------

async function safeFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new CliError(
      "PROVIDER_NETWORK",
      controller.signal.aborted
        ? `x ${label}: request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `x ${label}: ${error instanceof Error ? error.message : "network error"}`,
      { retryable: true, cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function apiGet(url: string, bearer: string): Promise<Response> {
  const response = await safeFetch(url, { headers: { authorization: `Bearer ${bearer}` } }, "api");
  if (response.ok) {
    return response;
  }
  const body = await response.text();
  throw mapXStatus(response.status, "api", body.slice(0, 200));
}

function mapXStatus(status: number, label: string, detail: string): CliError {
  if (status === 401 || status === 403) {
    return new CliError(
      "PROVIDER_UNAUTHORIZED",
      `x ${label}: unauthorized (${status}). The token is invalid or your X API access tier does not permit this read — timeline/tweet reads usually require a paid tier (Basic+).`,
      { details: { status, detail } },
    );
  }
  if (status === 429) {
    return new CliError("PROVIDER_RATE_LIMITED", `x ${label}: rate limited (429).`, {
      details: { status },
      retryable: true,
    });
  }
  if (status === 404) {
    return new CliError("NOT_FOUND", `x ${label}: not found (404).`, { details: { detail } });
  }
  return new CliError("PROVIDER_UPSTREAM", `x ${label}: request failed (${status}).`, {
    details: { status, detail },
    retryable: status >= 500,
  });
}
