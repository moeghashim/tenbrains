import { CliError } from "../core/errors.js";
import type { ProviderId } from "./providers.js";

export interface CompletionRequest {
  provider: Exclude<ProviderId, "mock">;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;

type JsonRecord = Record<string, unknown>;

interface ProviderAdapter {
  url: (req: CompletionRequest) => string;
  headers: (req: CompletionRequest) => Record<string, string>;
  body: (req: CompletionRequest) => JsonRecord;
  extract: (payload: unknown) => string;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

const ADAPTERS: Record<Exclude<ProviderId, "mock">, ProviderAdapter> = {
  anthropic: {
    url: () => "https://api.anthropic.com/v1/messages",
    headers: (req) => ({
      "content-type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    }),
    body: (req) => ({
      model: req.model,
      max_tokens: MAX_TOKENS,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    }),
    extract: (payload) => {
      const content = asRecord(payload).content;
      if (!Array.isArray(content)) {
        return "";
      }
      return content
        .map((part) => {
          const record = asRecord(part);
          return record.type === "text" && typeof record.text === "string" ? record.text : "";
        })
        .join("\n")
        .trim();
    },
  },
  openai: openAiCompatible("https://api.openai.com/v1/chat/completions"),
  xai: openAiCompatible("https://api.x.ai/v1/chat/completions"),
  google: {
    url: (req) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
    headers: (req) => ({
      "content-type": "application/json",
      "x-goog-api-key": req.apiKey,
    }),
    body: (req) => ({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
    extract: (payload) => {
      const candidates = asRecord(payload).candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return "";
      }
      const parts = asRecord(asRecord(candidates[0]).content).parts;
      if (!Array.isArray(parts)) {
        return "";
      }
      return parts
        .map((part) => {
          const text = asRecord(part).text;
          return typeof text === "string" ? text : "";
        })
        .join("\n")
        .trim();
    },
  },
};

function openAiCompatible(url: string): ProviderAdapter {
  return {
    url: () => url,
    headers: (req) => ({
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
    }),
    body: (req) => ({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
    extract: (payload) => {
      const choices = asRecord(payload).choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        return "";
      }
      const message = asRecord(asRecord(choices[0]).message);
      return typeof message.content === "string" ? message.content.trim() : "";
    },
  };
}

function errorMessageFrom(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  const error = record.error;
  if (typeof error === "string") {
    return error;
  }
  const message = asRecord(error).message ?? record.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

function mapStatus(provider: ProviderId, status: number, message: string): CliError {
  if (status === 401 || status === 403) {
    return new CliError("PROVIDER_UNAUTHORIZED", `${provider}: ${message}`, {
      details: { status },
    });
  }
  if (status === 429) {
    return new CliError("PROVIDER_RATE_LIMITED", `${provider}: ${message}`, {
      details: { status },
      retryable: true,
    });
  }
  return new CliError("PROVIDER_UPSTREAM", `${provider}: ${message}`, {
    details: { status },
    retryable: status >= 500,
  });
}

/** Call a real provider and return the raw text of its first response message. */
export async function complete(req: CompletionRequest): Promise<string> {
  const adapter = ADAPTERS[req.provider];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(adapter.url(req), {
      method: "POST",
      headers: adapter.headers(req),
      body: JSON.stringify(adapter.body(req)),
      signal: controller.signal,
    });
  } catch (error) {
    throw new CliError(
      "PROVIDER_NETWORK",
      controller.signal.aborted
        ? `${req.provider}: request timed out after ${req.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`
        : `${req.provider}: ${error instanceof Error ? error.message : "network error"}`,
      { retryable: true, cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw mapStatus(
      req.provider,
      response.status,
      errorMessageFrom(payload, `request failed with status ${response.status}`),
    );
  }

  const text = adapter.extract(payload);
  if (!text) {
    throw new CliError("PROVIDER_BAD_OUTPUT", `${req.provider}: empty response from provider.`);
  }
  return text;
}
