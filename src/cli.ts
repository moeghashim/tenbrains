import { readFileSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { analyzeCommand, analyzeGetCommand, analyzeListCommand } from "./commands/analyze.js";
import {
  bookmarkAddCommand,
  bookmarkListCommand,
  bookmarkRemoveCommand,
  bookmarkShowCommand,
  bookmarkTagCommand,
} from "./commands/bookmark.js";
import {
  configGetCommand,
  configListCommand,
  configPathCommand,
  configSetCommand,
  configUnsetCommand,
  setupCommand,
} from "./commands/config.js";
import {
  dbMigrateCommand,
  dbReindexCommand,
  dbResetCommand,
  dbStatsCommand,
  dbVacuumCommand,
} from "./commands/db.js";
import { digestCommand } from "./commands/digest.js";
import { importXArchiveCommand } from "./commands/import.js";
import {
  learnDoneCommand,
  learnGenerateCommand,
  learnListCommand,
  learnShowCommand,
  learnTodayCommand,
} from "./commands/learn.js";
import { manifestCommand } from "./commands/manifest.js";
import { recordGetCommand } from "./commands/record.js";
import { searchCommand } from "./commands/search.js";
import {
  suggestAddCommand,
  suggestDismissCommand,
  suggestGenerateCommand,
  suggestListCommand,
  suggestSaveCommand,
} from "./commands/suggest.js";
import {
  takeawayFollowCommand,
  takeawayListCommand,
  takeawayRefreshCommand,
  takeawayShowCommand,
  takeawayUnfollowCommand,
} from "./commands/takeaway.js";
import { RunContext } from "./core/context.js";
import { CliError, exitCodeForError } from "./core/errors.js";
import type { Opts } from "./core/opts.js";
import { type CommandResult, emitError, emitResult } from "./core/output.js";

type Handler = (ctx: RunContext, opts: Opts) => CommandResult | Promise<CommandResult>;

const PROVIDER_OPTIONS = [
  { flags: "--provider <id>", description: "AI provider: anthropic|openai|google|xai|mock" },
  { flags: "--model <model>", description: "Model name (defaults per provider)" },
  { flags: "--api-key <key>", description: "Provider API key for this run; - reads stdin" },
];

const POST_INPUT_OPTIONS = [
  { flags: "--text <text>", description: "Post text; @file reads a file, - reads stdin" },
  { flags: "--url <url>", description: "Source URL of the post" },
  { flags: "--id <externalId>", description: "External (X) post id, used for dedup" },
  { flags: "--author <username>", description: "Author username" },
  { flags: "--author-name <name>", description: "Author display name" },
  { flags: "--posted-at <iso>", description: "Original post timestamp (ISO 8601)" },
  { flags: "--post-id <id>", description: "Use an already-stored post by id" },
];

function readVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function cleanArgName(spec: string): string {
  return spec.replace(/[<>[\]]/g, "").replace(/\.\.\.$/, "");
}

function pathName(command: Command): string {
  const parts: string[] = [];
  let cursor: Command | null = command;
  while (cursor?.parent) {
    parts.unshift(cursor.name());
    cursor = cursor.parent;
  }
  return parts.join(" ");
}

function buildContext(opts: Opts): RunContext {
  return new RunContext({
    json: opts.json === true,
    pretty: opts.pretty === true,
    quiet: opts.quiet === true,
    dbPath: typeof opts.db === "string" ? opts.db : undefined,
    configDir: typeof opts.configDir === "string" ? opts.configDir : undefined,
  });
}

async function execute(commandName: string, merged: Opts, handler: Handler): Promise<void> {
  const ctx = buildContext(merged);
  try {
    const result = await handler(ctx, merged);
    emitResult(commandName, result, ctx.mode);
  } catch (error) {
    emitError(commandName, error, ctx.mode);
    process.exitCode = exitCodeForError(error);
  } finally {
    ctx.close();
  }
}

/** Common output/storage flags attached to every command so they work in any position. */
function applyCommonOptions(cmd: Command): void {
  cmd.option("--json", "Emit the JSON result envelope (default)");
  cmd.option("--pretty", "Human-readable output instead of JSON");
  cmd.option("--quiet", "Suppress progress logging on stderr");
  cmd.option("--db <path>", "Path to the SQLite database file");
  cmd.option("--config-dir <path>", "Directory for the managed config file");
}

interface Registration {
  name: string;
  description: string;
  args?: Array<{ spec: string; description?: string }>;
  aliases?: string[];
  options?: Array<{ flags: string; description: string }>;
  negations?: Array<{ flags: string; description: string }>;
  handler: Handler;
}

function makeCommand(reg: Registration): Command {
  const cmd = new Command(reg.name);
  cmd.description(reg.description);
  cmd.exitOverride();
  for (const alias of reg.aliases ?? []) {
    cmd.alias(alias);
  }
  for (const arg of reg.args ?? []) {
    cmd.argument(arg.spec, arg.description ?? "");
  }
  for (const option of reg.options ?? []) {
    cmd.option(option.flags, option.description);
  }
  for (const negation of reg.negations ?? []) {
    cmd.option(negation.flags, negation.description);
  }
  applyCommonOptions(cmd);
  const argCount = reg.args?.length ?? 0;
  cmd.action(async (...callArgs: unknown[]) => {
    const command = callArgs[callArgs.length - 1] as Command;
    const positional = callArgs.slice(0, argCount);
    const merged: Opts = { ...command.optsWithGlobals() };
    (reg.args ?? []).forEach((arg, index) => {
      const value = positional[index];
      if (value !== undefined) {
        merged[cleanArgName(arg.spec)] = value;
      }
    });
    await execute(pathName(command), merged, reg.handler);
  });
  return cmd;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("tenbrains")
    .description(
      "Agent-first CLI for X and YouTube research: analyze content and persist every outcome to a local SQLite database.",
    )
    .version(readVersion(), "-v, --version")
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  applyCommonOptions(program);

  // --- analyze --------------------------------------------------------------
  const analyze = makeCommand({
    name: "analyze",
    description: "Analyze a post or YouTube transcript into topic, summary, intent, and concepts.",
    options: [
      ...POST_INPUT_OPTIONS,
      {
        flags: "--thread [json]",
        description:
          "Analyze a whole thread as one document: pass parts as JSON (@file/- ok), or bare with --url/--id to fetch the author's self-thread via the X API",
      },
      {
        flags: "--transcript <text>",
        description: "Video transcript; @file reads a file, - reads stdin",
      },
      {
        flags: "--lang <code>",
        description: "Preferred YouTube caption language (then English, then first available)",
      },
      {
        flags: "--summarize",
        description: "Also generate and persist a fuller narrative summary with key points",
      },
      {
        flags: "--fetch <mode>",
        description: "With --url/--id and no --text: auto|oembed|api (default auto, free-first)",
      },
      {
        flags: "--x-bearer <token>",
        description: "X API Bearer token for --fetch api/fallback; - reads stdin",
      },
      ...PROVIDER_OPTIONS,
      { flags: "--learn", description: "Also generate a 7-day Feynman learning track" },
      { flags: "--ratings <json>", description: "Concept ratings JSON for --learn (@file/- ok)" },
      { flags: "--minutes <n>", description: "Minutes per day for --learn (default 10)" },
    ],
    handler: analyzeCommand,
  });
  analyze.addCommand(
    makeCommand({
      name: "list",
      description: "List stored analyses (most recent first).",
      options: [
        { flags: "--limit <n>", description: "Max rows (default 20)" },
        { flags: "--offset <n>", description: "Rows to skip (default 0)" },
        { flags: "--author <username>", description: "Filter by author username" },
      ],
      handler: (ctx, opts) => analyzeListCommand(ctx, opts),
    }),
  );
  analyze.addCommand(
    makeCommand({
      name: "get",
      description: "Show one analysis and its post by id.",
      args: [{ spec: "<id>", description: "Analysis id (ana_...)" }],
      handler: (ctx, opts) => analyzeGetCommand(ctx, opts),
    }),
  );
  program.addCommand(analyze);

  // --- takeaway -------------------------------------------------------------
  const takeaway = makeCommand({
    name: "takeaway",
    description: "Track followed accounts and summarize their recent posts.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: follow|unfollow|list|refresh|show.");
    },
  });
  takeaway.addCommand(
    makeCommand({
      name: "follow",
      description: "Follow an account for takeaway tracking.",
      args: [{ spec: "<username>", description: "X username (with or without @)" }],
      options: [{ flags: "--name <name>", description: "Display name" }],
      handler: takeawayFollowCommand,
    }),
  );
  takeaway.addCommand(
    makeCommand({
      name: "unfollow",
      description: "Stop following an account (deletes its snapshots).",
      args: [{ spec: "<username>" }],
      handler: takeawayUnfollowCommand,
    }),
  );
  takeaway.addCommand(
    makeCommand({
      name: "list",
      description: "List followed accounts and their latest takeaway.",
      handler: takeawayListCommand,
    }),
  );
  takeaway.addCommand(
    makeCommand({
      name: "refresh",
      description: "Summarize an account's recent posts into a new takeaway snapshot.",
      args: [{ spec: "<username>" }],
      options: [
        {
          flags: "--posts <json>",
          description: "Recent posts [{text,externalId?,...}] (@file/- ok); omit to fetch from X",
        },
        {
          flags: "--count <n>",
          description: "Posts to fetch from X when --posts is omitted (default 20)",
        },
        {
          flags: "--x-bearer <token>",
          description: "X API Bearer token for timeline fetch; - reads stdin",
        },
        ...PROVIDER_OPTIONS,
      ],
      handler: takeawayRefreshCommand,
    }),
  );
  takeaway.addCommand(
    makeCommand({
      name: "show",
      description: "Show the latest takeaway (or --history) for an account.",
      args: [{ spec: "<username>" }],
      options: [
        { flags: "--history", description: "Show snapshot history instead of the latest" },
        { flags: "--limit <n>", description: "Max history rows (default 20)" },
      ],
      handler: takeawayShowCommand,
    }),
  );
  program.addCommand(takeaway);

  // --- suggest --------------------------------------------------------------
  const suggest = makeCommand({
    name: "suggest",
    description: "Rank un-saved posts against your saved signal; manage feedback.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: generate|list|save|dismiss|add.");
    },
  });
  suggest.addCommand(
    makeCommand({
      name: "generate",
      description: "Regenerate pending suggestions from the local corpus.",
      options: [{ flags: "--limit <n>", description: "Max suggestions returned (default 10)" }],
      handler: suggestGenerateCommand,
    }),
  );
  suggest.addCommand(
    makeCommand({
      name: "list",
      description: "List suggestions by status (pending|saved|dismissed|all).",
      options: [
        { flags: "--status <status>", description: "Filter status (default pending)" },
        { flags: "--limit <n>", description: "Max rows (default 10)" },
      ],
      handler: suggestListCommand,
    }),
  );
  suggest.addCommand(
    makeCommand({
      name: "save",
      description: "Save a suggestion (materializes it as a bookmark).",
      args: [{ spec: "<id>", description: "Suggestion id (sug_...)" }],
      handler: suggestSaveCommand,
    }),
  );
  suggest.addCommand(
    makeCommand({
      name: "dismiss",
      description: "Dismiss a suggestion (suppresses it in future ranking).",
      args: [{ spec: "<id>" }],
      handler: suggestDismissCommand,
    }),
  );
  suggest.addCommand(
    makeCommand({
      name: "add",
      description: "Add a candidate post as a suggestion.",
      options: [
        { flags: "--post-id <id>", description: "Existing post id" },
        { flags: "--text <text>", description: "New post text (@file/- ok)" },
        { flags: "--url <url>", description: "Source URL" },
        { flags: "--id <externalId>", description: "External post id" },
        { flags: "--author <username>", description: "Author username" },
        { flags: "--reason <reason>", description: "Why it's suggested" },
        { flags: "--score <n>", description: "Initial score (default 1)" },
      ],
      handler: suggestAddCommand,
    }),
  );
  program.addCommand(suggest);

  // --- bookmark -------------------------------------------------------------
  const bookmark = makeCommand({
    name: "bookmark",
    description: "Save posts with tags and notes.",
    aliases: ["bm"],
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: add|list|show|tag|remove.");
    },
  });
  bookmark.addCommand(
    makeCommand({
      name: "add",
      description: "Bookmark a post (auto-tags from its analysis unless --tags given).",
      options: [
        ...POST_INPUT_OPTIONS,
        { flags: "--tags <list>", description: "Comma-separated tags" },
        { flags: "--note <note>", description: "Freeform note" },
        { flags: "--source <source>", description: "Source label (default cli)" },
      ],
      negations: [{ flags: "--no-auto-tags", description: "Disable automatic tag suggestion" }],
      handler: bookmarkAddCommand,
    }),
  );
  bookmark.addCommand(
    makeCommand({
      name: "list",
      description: "List bookmarks, optionally filtered by --tag.",
      options: [
        { flags: "--tag <tag>", description: "Filter by a single tag" },
        { flags: "--limit <n>", description: "Max rows (default 20)" },
        { flags: "--offset <n>", description: "Rows to skip (default 0)" },
      ],
      handler: bookmarkListCommand,
    }),
  );
  bookmark.addCommand(
    makeCommand({
      name: "show",
      description: "Show a bookmark with its post and analysis.",
      args: [{ spec: "<id>", description: "Bookmark id (bm_...)" }],
      handler: bookmarkShowCommand,
    }),
  );
  bookmark.addCommand(
    makeCommand({
      name: "tag",
      description: "Add and/or remove tags on a bookmark.",
      args: [{ spec: "<id>" }],
      options: [
        { flags: "--add <list>", description: "Comma-separated tags to add" },
        { flags: "--remove <list>", description: "Comma-separated tags to remove" },
      ],
      handler: bookmarkTagCommand,
    }),
  );
  bookmark.addCommand(
    makeCommand({
      name: "remove",
      description: "Delete a bookmark.",
      aliases: ["rm"],
      args: [{ spec: "<id>" }],
      handler: bookmarkRemoveCommand,
    }),
  );
  program.addCommand(bookmark);

  // --- learn ----------------------------------------------------------------
  const learn = makeCommand({
    name: "learn",
    description: "Generate and review 7-day Feynman learning tracks from an analysis.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: generate|today|done|show|list.");
    },
  });
  learn.addCommand(
    makeCommand({
      name: "generate",
      description: "Build a learning track from an analysis' concepts.",
      options: [
        { flags: "--analysis <id>", description: "Analysis id to build from" },
        { flags: "--ratings <json>", description: "Concept ratings JSON (@file/- ok)" },
        { flags: "--minutes <n>", description: "Minutes per day (default 10)" },
      ],
      handler: learnGenerateCommand,
    }),
  );
  learn.addCommand(
    makeCommand({
      name: "today",
      description: "Show the next pending day's task (latest active track unless an id is given).",
      args: [{ spec: "[id]", description: "Track id (trk_...); defaults to latest active track" }],
      handler: learnTodayCommand,
    }),
  );
  learn.addCommand(
    makeCommand({
      name: "done",
      description: "Mark a track day finished (defaults to the next pending day).",
      args: [{ spec: "<id>", description: "Track id (trk_...)" }],
      options: [
        { flags: "--day <n>", description: "Specific day to mark (default: next pending)" },
        { flags: "--notes <text>", description: "What you learned / what's still fuzzy" },
      ],
      handler: learnDoneCommand,
    }),
  );
  learn.addCommand(
    makeCommand({
      name: "show",
      description: "Show a learning track by id.",
      args: [{ spec: "<id>", description: "Track id (trk_...)" }],
      handler: learnShowCommand,
    }),
  );
  learn.addCommand(
    makeCommand({
      name: "list",
      description: "List learning tracks.",
      options: [
        { flags: "--analysis <id>", description: "Filter by analysis id" },
        { flags: "--limit <n>", description: "Max rows (default 20)" },
      ],
      handler: learnListCommand,
    }),
  );
  program.addCommand(learn);

  // --- search ---------------------------------------------------------------
  program.addCommand(
    makeCommand({
      name: "search",
      description:
        "Full-text search (FTS5, BM25-ranked) across analyses, takeaways, and bookmarks.",
      args: [{ spec: "<query>", description: "Search query" }],
      options: [
        { flags: "--type <list>", description: "Limit types: analysis,takeaway,bookmark (or all)" },
        { flags: "--limit <n>", description: "Max hits per type (default 10)" },
      ],
      handler: searchCommand,
    }),
  );

  // --- digest ---------------------------------------------------------------
  program.addCommand(
    makeCommand({
      name: "digest",
      description: "Markdown recap of analyses, takeaways, and bookmarks saved recently.",
      options: [{ flags: "--days <n>", description: "Window in days (default 7)" }],
      handler: digestCommand,
    }),
  );

  // --- import ---------------------------------------------------------------
  const importCmd = makeCommand({
    name: "import",
    description: "Bulk-import external data into the local database.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: x-archive <path>.");
    },
  });
  importCmd.addCommand(
    makeCommand({
      name: "x-archive",
      description:
        "Import an extracted official X account archive: likes become bookmarked posts, your tweets become posts.",
      args: [{ spec: "<path>", description: "Extracted archive directory (contains data/)" }],
      options: [
        { flags: "--likes", description: "Import only likes" },
        { flags: "--tweets", description: "Import only your tweets" },
        { flags: "--limit <n>", description: "Cap items imported per kind (default: all)" },
      ],
      negations: [
        { flags: "--no-bookmarks", description: "Store likes as posts without bookmarking them" },
      ],
      handler: importXArchiveCommand,
    }),
  );
  program.addCommand(importCmd);

  // --- config + setup -------------------------------------------------------
  program.addCommand(
    makeCommand({
      name: "setup",
      description:
        "Collect and store AI provider + optional X credentials (interactive or via flags).",
      options: [
        { flags: "--provider <id>", description: "Provider to configure (default anthropic)" },
        { flags: "--api-key <key>", description: "API key; - reads stdin" },
        { flags: "--model <model>", description: "Default model for this provider" },
        { flags: "--default", description: "Make this the default provider" },
        { flags: "--x-bearer <token>", description: "X API Bearer token to store; - reads stdin" },
      ],
      handler: setupCommand,
    }),
  );
  const config = makeCommand({
    name: "config",
    description: "Read and write the managed CLI config (default provider, keys, models).",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: set|get|list|unset|path.");
    },
  });
  config.addCommand(
    makeCommand({
      name: "set",
      description: "Set a config value by dot-path (value may be @file or -).",
      args: [{ spec: "<key>" }, { spec: "<value>" }],
      handler: configSetCommand,
    }),
  );
  config.addCommand(
    makeCommand({
      name: "get",
      description: "Get a config value (secrets redacted unless --reveal).",
      args: [{ spec: "<key>" }],
      options: [{ flags: "--reveal", description: "Show secret values" }],
      handler: configGetCommand,
    }),
  );
  config.addCommand(
    makeCommand({
      name: "list",
      description: "List all config values (secrets redacted unless --reveal).",
      options: [{ flags: "--reveal", description: "Show secret values" }],
      handler: configListCommand,
    }),
  );
  config.addCommand(
    makeCommand({
      name: "unset",
      description: "Remove a config value by dot-path.",
      args: [{ spec: "<key>" }],
      handler: configUnsetCommand,
    }),
  );
  config.addCommand(
    makeCommand({
      name: "path",
      description: "Print the config file and database paths.",
      handler: configPathCommand,
    }),
  );
  program.addCommand(config);

  // --- record ---------------------------------------------------------------
  const record = makeCommand({
    name: "record",
    description: "Resolve any stored record by its prefixed id.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: get <id>.");
    },
  });
  record.addCommand(
    makeCommand({
      name: "get",
      description: "Fetch any record by id (post_/ana_/acc_/snap_/bm_/sug_/trk_).",
      args: [{ spec: "<id>" }],
      handler: recordGetCommand,
    }),
  );
  program.addCommand(record);

  // --- db -------------------------------------------------------------------
  const db = makeCommand({
    name: "db",
    description: "Inspect and maintain the local database.",
    handler: () => {
      throw new CliError("USAGE", "Specify a subcommand: stats|migrate|vacuum|reindex|reset.");
    },
  });
  db.addCommand(
    makeCommand({
      name: "stats",
      description: "Show row counts and schema version.",
      handler: dbStatsCommand,
    }),
  );
  db.addCommand(
    makeCommand({
      name: "migrate",
      description: "Apply pending schema migrations.",
      handler: dbMigrateCommand,
    }),
  );
  db.addCommand(
    makeCommand({
      name: "vacuum",
      description: "Compact the database file.",
      handler: dbVacuumCommand,
    }),
  );
  db.addCommand(
    makeCommand({
      name: "reindex",
      description: "Rebuild the full-text search index from the source tables.",
      handler: dbReindexCommand,
    }),
  );
  db.addCommand(
    makeCommand({
      name: "reset",
      description: "Delete all stored data and recreate the schema.",
      options: [{ flags: "--yes", description: "Confirm destructive reset" }],
      handler: dbResetCommand,
    }),
  );
  program.addCommand(db);

  // --- manifest -------------------------------------------------------------
  program.addCommand(
    makeCommand({
      name: "manifest",
      description: "Emit a machine-readable description of the whole CLI for agents.",
      handler: manifestCommand(program),
    }),
  );

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  if (argv.slice(2).length === 0) {
    program.outputHelp();
    return;
  }
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.help" ||
        error.code === "commander.version"
      ) {
        return;
      }
      emitError("cli", new CliError("USAGE", error.message.replace(/^error:\s*/i, "")), "json");
      process.exitCode = 2;
      return;
    }
    emitError("cli", error, "json");
    process.exitCode = exitCodeForError(error);
  }
}
