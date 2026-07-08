import type { RunContext } from "../core/context.js";
import { type Opts, optNumber } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import type { Store } from "../db/repositories.js";

interface DigestData {
  since: string;
  days: number;
  counts: { analyses: number; takeaways: number; bookmarks: number };
  markdown: string;
}

function snippet(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** A markdown recap of everything saved in the window — the tool's "output side". */
export function buildDigest(store: Store, days: number, now: Date): DigestData {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const postsById = new Map(store.posts.all().map((p) => [p.id, p]));
  const accountsById = new Map(store.accounts.list().map((a) => [a.id, a]));

  const analyses = store.analyses.all().filter((a) => a.createdAt >= since);
  const snapshots = store.snapshots.all().filter((s) => s.createdAt >= since);
  const bookmarks = store.bookmarks.all().filter((b) => b.createdAt >= since);

  const lines: string[] = [
    `# tenbrains digest — last ${days} day${days === 1 ? "" : "s"}`,
    "",
    `_${analyses.length} analyses · ${snapshots.length} account takeaways · ${bookmarks.length} bookmarks since ${since.slice(0, 10)}_`,
  ];

  if (analyses.length > 0) {
    lines.push("", "## Analyses", "");
    for (const analysis of analyses) {
      const post = postsById.get(analysis.postId);
      const author = post?.authorUsername ? ` — @${post.authorUsername}` : "";
      lines.push(
        `- **${analysis.topic}**${author}: ${snippet(analysis.summary)} \`${analysis.id}\``,
      );
    }
  }

  if (snapshots.length > 0) {
    lines.push("", "## Account takeaways", "");
    for (const snap of snapshots) {
      const account = accountsById.get(snap.accountId);
      lines.push(`- **@${account?.username ?? "account"}**: ${snippet(snap.summary)}`);
      for (const takeaway of snap.takeaways.slice(0, 3)) {
        lines.push(`  - ${snippet(takeaway, 100)}`);
      }
    }
  }

  if (bookmarks.length > 0) {
    lines.push("", "## Bookmarks", "");
    for (const bookmark of bookmarks) {
      const post = postsById.get(bookmark.postId);
      const tags =
        bookmark.tags.length > 0 ? ` ${bookmark.tags.map((t) => `#${t}`).join(" ")}` : "";
      lines.push(`- ${snippet(post?.text ?? bookmark.note ?? "")}${tags} \`${bookmark.id}\``);
    }
  }

  if (analyses.length + snapshots.length + bookmarks.length === 0) {
    lines.push("", "Nothing saved in this window.");
  }

  return {
    since,
    days,
    counts: {
      analyses: analyses.length,
      takeaways: snapshots.length,
      bookmarks: bookmarks.length,
    },
    markdown: lines.join("\n"),
  };
}

export function digestCommand(ctx: RunContext, opts: Opts): CommandResult {
  const days = optNumber(opts, "days", 7);
  const digest = buildDigest(ctx.store(), days, new Date());
  return {
    data: digest,
    meta: {
      days,
      total: digest.counts.analyses + digest.counts.takeaways + digest.counts.bookmarks,
    },
    human: () => digest.markdown,
  };
}
