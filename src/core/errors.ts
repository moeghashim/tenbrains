/**
 * Machine-readable error codes. Every failure the CLI emits carries one of
 * these so an agent can branch on `error.code` instead of parsing prose.
 */
export const ERROR_CODES = [
  "USAGE",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "MISSING_CREDENTIALS",
  "CONFIG_ERROR",
  "PROVIDER_UNAUTHORIZED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM",
  "PROVIDER_NETWORK",
  "PROVIDER_BAD_OUTPUT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Process exit codes are stable per failure class so shell/agent callers can
 * react without parsing stdout. 0 is success (never produced by an error).
 */
const EXIT_CODES: Record<ErrorCode, number> = {
  USAGE: 2,
  VALIDATION: 6,
  NOT_FOUND: 3,
  CONFLICT: 7,
  MISSING_CREDENTIALS: 4,
  CONFIG_ERROR: 4,
  PROVIDER_UNAUTHORIZED: 5,
  PROVIDER_RATE_LIMITED: 5,
  PROVIDER_UPSTREAM: 5,
  PROVIDER_NETWORK: 5,
  PROVIDER_BAD_OUTPUT: 5,
  INTERNAL: 1,
};

export interface CliErrorOptions {
  /** Structured, JSON-serializable context attached to the error envelope. */
  details?: Record<string, unknown>;
  /** Whether a caller could reasonably retry the same invocation. */
  retryable?: boolean;
  /** Underlying error, preserved for the stack but not serialized. */
  cause?: unknown;
}

/**
 * The one error type the CLI throws on purpose. Anything else bubbling up is
 * treated as an INTERNAL error by the dispatcher.
 */
export class CliError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options: CliErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CliError";
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }

  get exitCode(): number {
    return EXIT_CODES[this.code];
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function exitCodeForError(error: unknown): number {
  return error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
}

export function exitCodeForCode(code: ErrorCode): number {
  return EXIT_CODES[code];
}

/** The full code -> exit-code map, for self-description in `manifest`. */
export function exitCodeMap(): Record<ErrorCode, number> {
  return { ...EXIT_CODES };
}

/** Coerce any thrown value into a CliError for uniform reporting. */
export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new CliError("INTERNAL", message, { cause: error });
}
