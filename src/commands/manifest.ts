import type { Command } from "commander";
import { PROVIDER_CATALOG } from "../ai/providers.js";
import type { RunContext } from "../core/context.js";
import { ERROR_CODES, exitCodeMap } from "../core/errors.js";
import type { Opts } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { ID_PREFIXES } from "../db/database.js";
import { currentSchemaVersion } from "../db/migrations.js";

interface OptionSpec {
  flags: string;
  description: string;
}

interface ArgSpec {
  name: string;
  required: boolean;
  description: string;
}

interface CommandSpec {
  name: string;
  description: string;
  aliases: string[];
  arguments: ArgSpec[];
  options: OptionSpec[];
  commands: CommandSpec[];
}

interface CommanderArgument {
  name: () => string;
  required: boolean;
  description: string;
}

function describeCommand(command: Command): CommandSpec {
  const args = ((command as unknown as { registeredArguments?: CommanderArgument[] })
    .registeredArguments ?? []) as CommanderArgument[];
  return {
    name: command.name(),
    description: command.description(),
    aliases: command.aliases(),
    arguments: args.map((arg) => ({
      name: arg.name(),
      required: arg.required,
      description: arg.description ?? "",
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description ?? "",
    })),
    commands: command.commands.map(describeCommand),
  };
}

/**
 * Emit a complete, machine-readable description of the CLI: the output
 * contract, error/exit codes, provider catalog, db schema version, and the full
 * command tree. This is the agent's discovery entry point — one call reveals
 * every command and flag without scraping `--help`.
 */
export function buildManifest(program: Command): Record<string, unknown> {
  return {
    name: "tenbrains",
    version: program.version() ?? "unknown",
    description: program.description(),
    output: {
      default: "json",
      note: "stdout is exactly one JSON envelope per run; diagnostics go to stderr. Use --pretty for human output.",
      successEnvelope: { ok: true, command: "string", data: "object", meta: "object" },
      errorEnvelope: {
        ok: false,
        command: "string",
        error: { code: "ErrorCode", message: "string", retryable: "boolean", details: "object?" },
      },
    },
    errorCodes: ERROR_CODES,
    exitCodes: exitCodeMap(),
    ids: {
      format: "<prefix>_<sortable>",
      prefixes: ID_PREFIXES,
    },
    providers: Object.values(PROVIDER_CATALOG).map((p) => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      requiresKey: p.requiresKey,
      keyConfigPath: p.keyConfigPath,
    })),
    database: { engine: "sqlite", schemaVersion: currentSchemaVersion() },
    commands: program.commands.map(describeCommand),
  };
}

export function manifestCommand(program: Command) {
  return (_ctx: RunContext, _opts: Opts): CommandResult => ({
    data: buildManifest(program),
  });
}
