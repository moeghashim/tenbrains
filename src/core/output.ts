import { CliError, toCliError } from "./errors.js";

export type OutputMode = "json" | "pretty";

/**
 * The value a command handler returns. `data` is the canonical machine payload;
 * `meta` carries non-payload facts (ids, counts, persistence flags); `human` is
 * an optional renderer used only in --pretty mode.
 */
export interface CommandResult<T = unknown> {
  data: T;
  meta?: Record<string, unknown>;
  human?: (data: T) => string;
}

/** Stable success envelope. stdout contains exactly one of these per run. */
export interface SuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  data: T;
  meta: Record<string, unknown>;
}

/** Stable error envelope. Mirrors SuccessEnvelope so `ok` is the only branch. */
export interface ErrorEnvelope {
  ok: false;
  command: string;
  error: Record<string, unknown>;
}

export function buildSuccessEnvelope<T>(
  command: string,
  result: CommandResult<T>,
): SuccessEnvelope<T> {
  return {
    ok: true,
    command,
    data: result.data,
    meta: result.meta ?? {},
  };
}

export function buildErrorEnvelope(command: string, error: unknown): ErrorEnvelope {
  const cliError = toCliError(error);
  return { ok: false, command, error: cliError.toJSON() };
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export interface Streams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const defaultStreams: Streams = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

/**
 * Render a successful command result.
 * - json mode (default): the envelope is written to stdout.
 * - pretty mode: the human renderer (or pretty JSON) is written to stdout.
 */
export function emitResult<T>(
  command: string,
  result: CommandResult<T>,
  mode: OutputMode,
  streams: Streams = defaultStreams,
): void {
  if (mode === "pretty") {
    const text = result.human ? result.human(result.data) : stringify(result.data);
    streams.stdout(`${text}\n`);
    return;
  }
  streams.stdout(`${stringify(buildSuccessEnvelope(command, result))}\n`);
}

/**
 * Render a failure.
 * - json mode: the error envelope goes to stdout (so stdout is always one JSON
 *   object) plus a one-line summary to stderr for terminal visibility.
 * - pretty mode: a human error line goes to stderr; stdout stays empty.
 */
export function emitError(
  command: string,
  error: unknown,
  mode: OutputMode,
  streams: Streams = defaultStreams,
): void {
  const cliError = toCliError(error);
  const summary = `tenbrains: ${cliError.code}: ${cliError.message}`;
  if (mode === "pretty") {
    streams.stderr(`${summary}\n`);
    return;
  }
  streams.stdout(`${stringify(buildErrorEnvelope(command, cliError))}\n`);
  streams.stderr(`${summary}\n`);
}

/** stderr-only logger. stdout is reserved for the result envelope. */
export class Logger {
  constructor(
    private readonly mode: OutputMode,
    private readonly quiet: boolean,
    private readonly streams: Streams = defaultStreams,
  ) {}

  /** Human progress note. Suppressed in json mode and when --quiet is set. */
  info(message: string): void {
    if (this.quiet || this.mode === "json") {
      return;
    }
    this.streams.stderr(`${message}\n`);
  }

  /** Warnings always surface on stderr (still never pollute stdout). */
  warn(message: string): void {
    if (this.quiet) {
      return;
    }
    this.streams.stderr(`warning: ${message}\n`);
  }
}

export { CliError };
