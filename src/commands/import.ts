import type { RunContext } from "../core/context.js";
import { type Opts, optBool, optNumber, requireString } from "../core/opts.js";
import type { CommandResult } from "../core/output.js";
import { readArchive } from "../x/archive.js";

/**
 * Bulk-import the extracted official X account archive — the free path to
 * real signal. Likes become posts + bookmarks (they feed the suggestion
 * profile immediately); the account's own tweets become plain posts ready for
 * analysis. Re-running is safe: everything dedupes on externalId.
 */
export function importXArchiveCommand(ctx: RunContext, opts: Opts): CommandResult {
  const root = requireString(opts, "path", "<path>");
  const store = ctx.store();
  const limit = optNumber(opts, "limit", 0);
  const wantLikes = optBool(opts, "likes") || !optBool(opts, "tweets");
  const wantTweets = optBool(opts, "tweets") || !optBool(opts, "likes");
  const bookmarkLikes = opts.bookmarks !== false; // --no-bookmarks opts out

  const archive = readArchive(root);
  const cap = <T>(items: T[]): T[] => (limit > 0 ? items.slice(0, limit) : items);

  const counts = {
    likesImported: 0,
    bookmarksCreated: 0,
    tweetsImported: 0,
    deduped: 0,
  };

  store.transaction(() => {
    if (wantLikes) {
      for (const like of cap(archive.likes)) {
        const { post, deduped } = store.posts.ingest({
          text: like.text,
          externalId: like.externalId,
          url: like.url,
        });
        if (deduped) {
          counts.deduped += 1;
        } else {
          counts.likesImported += 1;
        }
        if (bookmarkLikes && !store.bookmarks.findByPostId(post.id)) {
          store.bookmarks.create({ postId: post.id, tags: [], source: "x:archive" });
          counts.bookmarksCreated += 1;
        }
      }
    }
    if (wantTweets) {
      for (const tweet of cap(archive.tweets)) {
        const { deduped } = store.posts.ingest({
          text: tweet.text,
          externalId: tweet.externalId,
          url: `https://x.com/${archive.username ?? "i"}/status/${tweet.externalId}`,
          authorUsername: archive.username,
          postedAt: tweet.postedAt,
        });
        if (deduped) {
          counts.deduped += 1;
        } else {
          counts.tweetsImported += 1;
        }
      }
    }
  });

  return {
    data: {
      path: root,
      username: archive.username ?? null,
      found: { likes: archive.likes.length, tweets: archive.tweets.length },
      ...counts,
    },
    meta: { persisted: true },
    human: () =>
      [
        `Imported X archive${archive.username ? ` for @${archive.username}` : ""}:`,
        `  likes:     ${counts.likesImported} new (${counts.bookmarksCreated} bookmarked)`,
        `  tweets:    ${counts.tweetsImported} new`,
        `  deduped:   ${counts.deduped} already stored`,
      ].join("\n"),
  };
}
