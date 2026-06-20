import { readFileSync } from "node:fs";
import { CliError } from "./errors.js";

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8");
  } catch (error) {
    throw new CliError("USAGE", "Failed to read from stdin.", { cause: error });
  }
}

/**
 * Resolve a string argument that may be inline text, `@path` (read a file), or
 * `-` (read stdin). This lets agents pipe large content in without shell
 * quoting headaches: `tenbrains analyze --text - < post.txt`.
 */
export function resolveTextInput(value: string): string {
  if (value === "-") {
    return readStdinSync();
  }
  if (value.startsWith("@")) {
    const path = value.slice(1);
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      throw new CliError("USAGE", `Failed to read file: ${path}`, { cause: error });
    }
  }
  return value;
}

/** Resolve and JSON-parse an input that may be inline, `@file`, or `-` (stdin). */
export function resolveJsonInput(value: string): unknown {
  const raw = resolveTextInput(value).trim();
  if (!raw) {
    throw new CliError("USAGE", "Expected JSON input but received empty content.");
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError("USAGE", "Input is not valid JSON.", {
      details: { sample: raw.slice(0, 120) },
      cause: error,
    });
  }
}
