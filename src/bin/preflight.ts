/**
 * Side-effect module imported before anything touches node:sqlite. It filters
 * out the one-time "SQLite is an experimental feature" notice so the CLI's
 * stderr stays clean for agents on Node versions that still emit it.
 */
type EmitWarning = typeof process.emitWarning;

const original = process.emitWarning.bind(process) as (...args: unknown[]) => void;

const filtered = ((warning: string | Error, ...rest: unknown[]): void => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) {
    return;
  }
  original(warning, ...rest);
}) as EmitWarning;

process.emitWarning = filtered;
