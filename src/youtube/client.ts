import { CliError } from "../core/errors.js";

const REQUEST_TIMEOUT_MS = 15_000;
const WATCH_BASE = "https://www.youtube.com/watch?v=";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

export interface VideoRef {
  id: string;
  url: string;
}

export interface CaptionTrack {
  baseUrl: string;
  lang: string;
  kind: "asr" | "manual";
}

export interface PlayerResponse {
  videoId: string;
  title: string;
  author: string;
  uploadDate?: string | undefined;
  durationSeconds?: number | undefined;
  captionTracks: CaptionTrack[];
}

export interface TranscriptResult extends PlayerResponse {
  text: string;
  captionLang: string;
  captionKind: "asr" | "manual";
  url: string;
}

export function parseVideoRef(input: string): VideoRef {
  const trimmed = input.trim();
  if (VIDEO_ID.test(trimmed)) {
    return { id: trimmed, url: `${WATCH_BASE}${trimmed}` };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CliError("USAGE", `Could not parse a YouTube video URL or id from "${input}".`, {
      details: { input },
    });
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (url.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/)?.[1] ?? null);
  }
  if (!id || !VIDEO_ID.test(id)) {
    throw new CliError("USAGE", `Could not parse a YouTube video URL or id from "${input}".`, {
      details: { input },
    });
  }
  return { id, url: `${WATCH_BASE}${id}` };
}

export function isYouTubeUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

function extractJsonAfter(html: string, marker: string): unknown {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new CliError(
      "PROVIDER_BAD_OUTPUT",
      "YouTube watch page did not contain a player response.",
    );
  }
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) {
    throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube player response was not valid JSON.");
  }
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch (error) {
          throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube player response was not valid JSON.", {
            cause: error,
          });
        }
      }
    }
  }
  throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube player response JSON was incomplete.");
}

function parsePlayerObject(value: unknown): PlayerResponse {
  const player = asRecord(value);
  const details = asRecord(player.videoDetails);
  const microformat = asRecord(asRecord(player.microformat).playerMicroformatRenderer);
  const renderer = asRecord(asRecord(asRecord(player.captions).playerCaptionsTracklistRenderer));
  const rawTracks = renderer.captionTracks;
  const captionTracks = Array.isArray(rawTracks)
    ? rawTracks.flatMap((entry): CaptionTrack[] => {
        const track = asRecord(entry);
        const baseUrl = typeof track.baseUrl === "string" ? track.baseUrl : "";
        const lang = typeof track.languageCode === "string" ? track.languageCode : "";
        if (!baseUrl || !lang) {
          return [];
        }
        return [{ baseUrl, lang, kind: track.kind === "asr" ? "asr" : "manual" }];
      })
    : [];
  const duration = Number(details.lengthSeconds);
  return {
    videoId: typeof details.videoId === "string" ? details.videoId : "",
    title: typeof details.title === "string" ? details.title : "",
    author: typeof details.author === "string" ? details.author : "",
    uploadDate: typeof microformat.uploadDate === "string" ? microformat.uploadDate : undefined,
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
    captionTracks,
  };
}

export function parsePlayerResponse(html: string): PlayerResponse {
  return parsePlayerObject(extractJsonAfter(html, "ytInitialPlayerResponse"));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const value =
        code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function cleanSegment(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTimedText(input: string): string {
  const trimmed = input.trim();
  let segments: string[];
  if (trimmed.startsWith("{")) {
    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch (error) {
      throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube caption JSON was not parseable.", {
        cause: error,
      });
    }
    const events = asRecord(payload).events;
    segments = Array.isArray(events)
      ? events.flatMap((event) => {
          const segs = asRecord(event).segs;
          if (!Array.isArray(segs)) {
            return [];
          }
          return [
            segs
              .map((segment) => asRecord(segment).utf8)
              .filter((value): value is string => typeof value === "string")
              .join(""),
          ];
        })
      : [];
  } else {
    segments = [...trimmed.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/gi)].map(
      (match) => match[1] ?? "",
    );
  }
  const text = segments.map(cleanSegment).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube caption track contained no readable text.");
  }
  return text;
}

function manualFallback(message: string): string {
  return `${message} Supply a transcript manually with \`tenbrains analyze --transcript @file\` (or -).`;
}

function assertPlayable(player: unknown, ref: VideoRef): void {
  const playability = asRecord(asRecord(player).playabilityStatus);
  const status = typeof playability.status === "string" ? playability.status : "";
  const reason = typeof playability.reason === "string" ? playability.reason : "";
  const combined = `${status} ${reason}`.toLowerCase();
  if (
    /(private|age.?restricted|members.?only|not available in your country|region)/.test(combined)
  ) {
    throw new CliError(
      "PROVIDER_UNAUTHORIZED",
      `YouTube video is not publicly accessible: ${reason}`,
      {
        details: { videoId: ref.id, reason },
      },
    );
  }
  if (status && status !== "OK") {
    throw new CliError("NOT_FOUND", manualFallback(`YouTube video was unavailable: ${reason}`), {
      details: { videoId: ref.id, reason },
    });
  }
}

function selectTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack {
  const preferred = lang?.toLowerCase();
  const languageRank = (track: CaptionTrack): number => {
    const code = track.lang.toLowerCase();
    if (preferred && (code === preferred || code.startsWith(`${preferred}-`))) return 0;
    if (code === "en" || code.startsWith("en-")) return 1;
    return 2;
  };
  return [...tracks].sort(
    (a, b) =>
      Number(a.kind === "asr") - Number(b.kind === "asr") || languageRank(a) - languageRank(b),
  )[0] as CaptionTrack;
}

export async function fetchTranscript(
  input: string | VideoRef,
  options: { lang?: string | undefined } = {},
): Promise<TranscriptResult> {
  const ref = typeof input === "string" ? parseVideoRef(input) : input;
  const pageResponse = await safeFetch(ref.url, "watch page");
  if (pageResponse.status === 404) {
    throw new CliError("NOT_FOUND", manualFallback("YouTube video was not found."), {
      details: { videoId: ref.id },
    });
  }
  if (!pageResponse.ok) {
    throw mapStatus(pageResponse.status, "watch page");
  }
  const html = await pageResponse.text();
  const rawPlayer = extractJsonAfter(html, "ytInitialPlayerResponse");
  assertPlayable(rawPlayer, ref);
  const player = parsePlayerResponse(html);
  if (!player.videoId || !player.title) {
    throw new CliError("PROVIDER_BAD_OUTPUT", "YouTube player response omitted video metadata.");
  }
  if (player.captionTracks.length === 0) {
    throw new CliError("NOT_FOUND", manualFallback("YouTube video has no caption tracks."), {
      details: { videoId: ref.id },
    });
  }
  let track = selectTrack(player.captionTracks, options.lang);
  let captionResponse = await safeFetch(track.baseUrl, "caption track");
  if (!captionResponse.ok) {
    throw mapStatus(captionResponse.status, "caption track");
  }
  let captionBody = await captionResponse.text();
  if (!captionBody.trim()) {
    // WEB caption URLs increasingly require a proof-of-origin token and may
    // return 200 with an empty body. The key embedded in the same watch page
    // can request an equivalent, usable track for YouTube's Android client.
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    if (apiKey) {
      const apiResponse = await safeFetch(
        `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
        "player api",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "20.10.38",
                androidSdkVersion: 35,
                hl: options.lang ?? "en",
                gl: "US",
              },
            },
            videoId: ref.id,
          }),
        },
      );
      if (!apiResponse.ok) {
        throw mapStatus(apiResponse.status, "player api");
      }
      const apiPlayer = parsePlayerObject(await apiResponse.json());
      if (apiPlayer.captionTracks.length > 0) {
        track = selectTrack(apiPlayer.captionTracks, options.lang);
        captionResponse = await safeFetch(track.baseUrl, "caption track");
        if (!captionResponse.ok) {
          throw mapStatus(captionResponse.status, "caption track");
        }
        captionBody = await captionResponse.text();
      }
    }
  }
  return {
    ...player,
    text: parseTimedText(captionBody),
    captionLang: track.lang,
    captionKind: track.kind,
    url: ref.url,
  };
}

async function safeFetch(url: string, label: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; tenbrains/2.2)",
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new CliError(
      "PROVIDER_NETWORK",
      controller.signal.aborted
        ? `youtube ${label}: request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `youtube ${label}: ${error instanceof Error ? error.message : "network error"}`,
      { retryable: true, cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatus(status: number, label: string): CliError {
  if (status === 401 || status === 403) {
    return new CliError(
      "PROVIDER_UNAUTHORIZED",
      `youtube ${label}: video is private, restricted, or unavailable in this region (${status}).`,
      { details: { status } },
    );
  }
  if (status === 429) {
    return new CliError("PROVIDER_RATE_LIMITED", `youtube ${label}: rate limited (429).`, {
      details: { status },
      retryable: true,
    });
  }
  if (status === 404) {
    return new CliError("NOT_FOUND", manualFallback(`youtube ${label}: not found (404).`));
  }
  return new CliError("PROVIDER_UPSTREAM", `youtube ${label}: request failed (${status}).`, {
    details: { status },
    retryable: status >= 500,
  });
}
