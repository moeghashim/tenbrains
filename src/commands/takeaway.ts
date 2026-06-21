import { summarizeAccount } from "../ai/analyzer.js";
import { resolveProvider } from "../ai/resolve.js";
import type { RunContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { resolveJsonInput } from "../core/input.js";
import { type Opts, optBool, optNumber, optString, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { parseOrThrow } from "../core/validate.js";
import { TakeawayPostsInputSchema } from "../domain/schemas.js";
import type { Account } from "../domain/types.js";
import { fetchAccountTimeline } from "../x/client.js";
import { resolveXBearer } from "./shared.js";

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

function requireAccount(ctx: RunContext, username: string): Account {
  const account = ctx.store().accounts.findByUsername(username);
  if (!account) {
    throw new CliError(
      "NOT_FOUND",
      `Not following @${username}. Run "tenbrains takeaway follow ${username}" first.`,
      { details: { username } },
    );
  }
  return account;
}

export function takeawayFollowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const username = normalizeUsername(requireString(opts, "username", "<username>"));
  const store = ctx.store();
  if (store.accounts.findByUsername(username)) {
    throw new CliError("CONFLICT", `Already following @${username}.`, { details: { username } });
  }
  const account = store.accounts.create(username, optString(opts, "name"));
  return {
    data: { account },
    meta: { accountId: account.id, persisted: true },
    human: () => `Following @${account.username} (${account.id}).`,
  };
}

export function takeawayUnfollowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const username = normalizeUsername(requireString(opts, "username", "<username>"));
  const account = requireAccount(ctx, username);
  ctx.store().accounts.delete(account.id);
  return {
    data: { unfollowed: account.username, accountId: account.id },
    meta: { persisted: true },
    human: () => `Unfollowed @${account.username}.`,
  };
}

export function takeawayListCommand(ctx: RunContext, _opts: Opts): CommandResult {
  const store = ctx.store();
  const accounts = store.accounts.list().map((account) => {
    const latest = store.snapshots.latestByAccount(account.id);
    return {
      ...account,
      latestSnapshot: latest
        ? { id: latest.id, summary: latest.summary, createdAt: latest.createdAt }
        : null,
    };
  });
  return {
    data: { accounts, count: accounts.length },
    human: () =>
      accounts.length === 0
        ? "No accounts followed yet."
        : accounts
            .map(
              (a) =>
                `@${a.username}${a.latestSnapshot ? `: ${a.latestSnapshot.summary}` : " (no takeaway yet)"}`,
            )
            .join("\n"),
  };
}

export async function takeawayRefreshCommand(ctx: RunContext, opts: Opts): Promise<CommandResult> {
  const username = normalizeUsername(requireString(opts, "username", "<username>"));
  const account = requireAccount(ctx, username);
  const resolved = resolveProvider(ctx.config, {
    provider: optString(opts, "provider"),
    model: optString(opts, "model"),
    apiKey: optString(opts, "apiKey"),
  });

  const store = ctx.store();
  const postsOpt = optString(opts, "posts");
  let posts: Array<{
    text: string;
    externalId?: string | undefined;
    url?: string | undefined;
    postedAt?: string | undefined;
  }>;
  let source = "supplied";
  if (postsOpt !== undefined) {
    posts = parseOrThrow(
      TakeawayPostsInputSchema,
      resolveJsonInput(postsOpt),
      "Invalid posts input. Expected a JSON array of { text, externalId?, url?, postedAt? }.",
    );
  } else {
    const bearer = resolveXBearer(ctx, opts);
    if (!bearer) {
      throw new CliError(
        "MISSING_CREDENTIALS",
        "No --posts supplied and no X Bearer token configured. Provide --posts <json>, or run `tenbrains setup --x-bearer <token>` to fetch the timeline (a paid X API tier is usually required for timeline reads).",
      );
    }
    const count = optNumber(opts, "count", 20);
    ctx.logger.info(`Fetching up to ${count} recent posts for @${username} from X…`);
    const fetched = await fetchAccountTimeline(account.username, bearer, count);
    if (fetched.length === 0) {
      throw new CliError("NOT_FOUND", `No recent original posts found for @${username}.`);
    }
    posts = fetched.map((tweet) => ({
      text: tweet.text,
      externalId: tweet.externalId,
      url: tweet.url,
      postedAt: tweet.postedAt,
    }));
    source = "x:api";
  }

  const sourcePostIds: string[] = [];
  for (const input of posts) {
    const { post } = store.posts.ingest({
      text: input.text,
      externalId: input.externalId,
      url: input.url,
      postedAt: input.postedAt,
      authorUsername: account.username,
    });
    sourcePostIds.push(post.id);
  }

  ctx.logger.info(`Summarizing ${posts.length} posts for @${username}…`);
  const outcome = await summarizeAccount(resolved, {
    account: { username: account.username, name: account.name ?? undefined },
    posts: posts.map((p) => ({ text: p.text, postedAt: p.postedAt })),
  });

  const snapshot = store.snapshots.create({
    accountId: account.id,
    provider: resolved.provider,
    model: resolved.model,
    summary: outcome.result.summary,
    takeaways: outcome.result.takeaways,
    sourcePostIds,
    mock: outcome.mock,
  });
  store.accounts.touch(account.id);

  return {
    data: { account, snapshot },
    meta: {
      snapshotId: snapshot.id,
      provider: resolved.provider,
      model: resolved.model,
      mock: outcome.mock,
      postCount: sourcePostIds.length,
      source,
      persisted: true,
    },
    human: () =>
      [
        `@${account.username}: ${snapshot.summary}`,
        ...snapshot.takeaways.map((t) => `  - ${t}`),
      ].join("\n"),
  };
}

export function takeawayShowCommand(ctx: RunContext, opts: Opts): CommandResult {
  const username = normalizeUsername(requireString(opts, "username", "<username>"));
  const account = requireAccount(ctx, username);
  const store = ctx.store();

  if (optBool(opts, "history")) {
    const limit = optNumber(opts, "limit", 20);
    const snapshots = store.snapshots.listByAccount(account.id, limit);
    return {
      data: { account, snapshots, count: snapshots.length },
      meta: { limit },
    };
  }

  const snapshot = store.snapshots.latestByAccount(account.id);
  if (!snapshot) {
    throw new CliError(
      "NOT_FOUND",
      `No takeaway snapshot yet for @${username}. Run "tenbrains takeaway refresh ${username} --posts ...".`,
      { details: { username } },
    );
  }
  const sourcePosts = snapshot.sourcePostIds
    .map((id) => store.posts.findById(id))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    data: { account, snapshot, sourcePosts },
    human: () =>
      [
        `@${account.username}: ${snapshot.summary}`,
        ...snapshot.takeaways.map((t) => `  - ${t}`),
      ].join("\n"),
  };
}
