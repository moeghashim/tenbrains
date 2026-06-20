import { CliError } from "../core/errors.js";

/**
 * Extract a single JSON object from a model response. Tolerates leading prose
 * and ```json fences, then balances braces while respecting string literals so
 * a `}` inside a quoted value does not terminate the scan early.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, "```");
  const start = fenced.indexOf("{");
  if (start === -1) {
    throw badOutput(text);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < fenced.length; i += 1) {
    const ch = fenced[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = fenced.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw badOutput(text, error);
        }
      }
    }
  }
  throw badOutput(text);
}

function badOutput(text: string, cause?: unknown): CliError {
  return new CliError("PROVIDER_BAD_OUTPUT", "Provider did not return a parseable JSON object.", {
    details: { sample: text.slice(0, 280) },
    cause,
  });
}
