import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { CliError } from "../core/errors.js";

/**
 * Parsers for the official X (Twitter) account archive — the free bulk path
 * to your own data. Users request it at Settings → "Download an archive of
 * your data" and extract the zip; this module reads the extracted directory.
 * Each data file is JavaScript of the form `window.YTD.<kind>.partN = [...]`.
 */

export interface ArchiveLike {
  text: string;
  externalId: string;
  url?: string | undefined;
}

export interface ArchiveTweet {
  text: string;
  externalId: string;
  postedAt?: string | undefined;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

/** Strip the `window.YTD.<kind>.partN = ` prefix and parse the JSON array. */
export function parseArchiveJs(content: string): unknown[] {
  let body = content.trim();
  if (!body.startsWith("[")) {
    // Plain JSON arrays are tolerated; everything else must carry the prefix.
    const match = body.match(/^window\.YTD\.[\w.]+\.part\d+\s*=\s*/);
    if (!match) {
      throw new CliError("VALIDATION", "Not an X archive data file (missing window.YTD prefix).");
    }
    body = body.slice(match[0].length);
  }
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      throw new Error("expected an array");
    }
    return parsed;
  } catch (error) {
    throw new CliError("VALIDATION", "Could not parse X archive data file.", { cause: error });
  }
}

/** Twitter's archive date format ("Wed Oct 10 20:19:24 +0000 2018") to ISO. */
function toIso(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function extractLikes(entries: unknown[]): ArchiveLike[] {
  return entries
    .map((entry) => {
      const like = asRecord(asRecord(entry).like);
      const text = typeof like.fullText === "string" ? like.fullText : "";
      const externalId = typeof like.tweetId === "string" ? like.tweetId : "";
      return {
        text,
        externalId,
        url: typeof like.expandedUrl === "string" ? like.expandedUrl : undefined,
      };
    })
    .filter((like) => like.text.length > 0 && like.externalId.length > 0);
}

export function extractTweets(entries: unknown[]): ArchiveTweet[] {
  return entries
    .map((entry) => {
      const tweet = asRecord(asRecord(entry).tweet);
      const text =
        typeof tweet.full_text === "string"
          ? tweet.full_text
          : typeof tweet.text === "string"
            ? tweet.text
            : "";
      const externalId = typeof tweet.id_str === "string" ? tweet.id_str : "";
      return { text, externalId, postedAt: toIso(tweet.created_at) };
    })
    .filter((tweet) => tweet.text.length > 0 && tweet.externalId.length > 0);
}

export function extractUsername(entries: unknown[]): string | undefined {
  const account = asRecord(asRecord(entries[0]).account);
  return typeof account.username === "string" ? account.username : undefined;
}

export interface ArchiveContents {
  username: string | undefined;
  likes: ArchiveLike[];
  tweets: ArchiveTweet[];
}

/** Files for one archive kind, including multi-part exports (tweets-part1.js). */
function kindFiles(dir: string, kind: string): string[] {
  return readdirSync(dir)
    .filter((name) => new RegExp(`^${kind}(-part\\d+)?\\.js$`).test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * Read an extracted X archive. `root` is the archive directory (containing
 * `data/`) or the `data/` directory itself.
 */
export function readArchive(root: string): ArchiveContents {
  let dir: string;
  try {
    dir = statSync(path.join(root, "data")).isDirectory() ? path.join(root, "data") : root;
  } catch {
    dir = root;
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    throw new CliError("NOT_FOUND", `Cannot read archive directory ${root}.`, { cause: error });
  }
  if (!names.some((n) => /^(like|tweets?|account)(-part\d+)?\.js$/.test(n))) {
    throw new CliError(
      "VALIDATION",
      `${dir} does not look like an extracted X archive (no like.js / tweets.js / account.js). Extract the archive zip first.`,
    );
  }

  const parseAll = (files: string[]): unknown[] =>
    files.flatMap((file) => parseArchiveJs(readFileSync(file, "utf8")));

  const accountEntries = parseAll(kindFiles(dir, "account"));
  // Older archives name the file `tweet.js`, newer ones `tweets.js`.
  const tweetFiles = [...kindFiles(dir, "tweets"), ...kindFiles(dir, "tweet")];
  return {
    username: extractUsername(accountEntries),
    likes: extractLikes(parseAll(kindFiles(dir, "like"))),
    tweets: extractTweets(parseAll(tweetFiles)),
  };
}
