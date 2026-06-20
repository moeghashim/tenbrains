import type { z } from "zod";
import { CliError, type ErrorCode } from "./errors.js";

/** Parse with a zod schema, converting failures into a structured CliError. */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
  code: ErrorCode = "VALIDATION",
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CliError(code, message, {
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return result.data;
}
