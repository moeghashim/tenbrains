"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  ExternalLink,
  Hash,
  Home,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import type {
  Account,
  Action,
  AppState,
  LearnPath,
  Post,
  ProgressEvent,
} from "@/lib/types";
import { applyDemoAction, demoState } from "@/lib/demo";
import { pathProgress } from "@/lib/learning";

const tagName = (tag: string) =>
  tag
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const sourceUrl = (post: Post, account?: Account) =>
  `https://x.com/${account?.handle || "i"}/status/${post.id}`;

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`mark ${small ? "small" : ""}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
function Avatar({
  account,
  onClick,
}: {
  account?: Account;
  onClick?: () => void;
}) {
  const content = account?.avatar ? (
    <img src={account.avatar} alt="" referrerPolicy="no-referrer" />
  ) : account ? (
    <span>
      {account.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  ) : (
    <Mark small />
  );
  return onClick ? (
    <button
      className={`avatar color-${(account?.id.length || 0) % 4}`}
      aria-label={`View ${account?.name}`}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className="avatar">{content}</span>
  );
}
function Modal({
  children,
  close,
  title,
  panel = false,
}: {
  children: ReactNode;
  close: () => void;
  title: string;
  panel?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={panel ? "modal panel" : "modal"}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Workspace({ demo = false }: { demo?: boolean }) {
  const [state, setState] = useState<AppState | null>(
    demo ? structuredClone(demoState) : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [configured, setConfigured] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"follow" | "learn">("follow");
  const [section, setSection] = useState("Home");
  const [tab, setTab] = useState("For you");
  const [collapsed, setCollapsed] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"capture" | "settings" | "install" | null>(
    null,
  );
  const [expanded, setExpanded] = useState<string[]>([]);
  const [importCursor, setImportCursor] = useState<string | undefined>();
  const [online, setOnline] = useState(true);
  const installPrompt = useRef<
    | (Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      })
    | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    (async () => {
      try {
        const status = await fetch("/api/status", {
          signal: controller.signal,
        });
        if (status.ok) {
          const info = await status.json();
          setConfigured(Boolean(info.configured));
        }
        const response = await fetch("/api/state", {
          signal: controller.signal,
        });
        if (response.ok) setState(await response.json());
        else if (response.status !== 401 && response.status !== 503)
          setLoadError("Your workspace could not be loaded. Please try again.");
      } catch (e) {
        if (!controller.signal.aborted)
          setLoadError(
            "Could not connect to the app. Check your connection and server configuration.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [demo]);
  useEffect(() => {
    const onOnline = () => setOnline(navigator.onLine);
    const onInstall = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e as typeof installPrompt.current;
    };
    onOnline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setDetected("");
    if (!url.trim()) return;
    let candidate: URL;
    try {
      candidate = new URL(url);
    } catch {
      return;
    }
    if (
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        candidate.hostname,
      ) ||
      candidate.protocol !== "https:"
    )
      return;
    const profile = /^\/[A-Za-z0-9_]{1,15}\/?$/.test(candidate.pathname);
    const post = /^\/[A-Za-z0-9_]{1,15}\/status\/\d+\/?$/.test(
      candidate.pathname,
    );
    if (!profile && !post) return;
    if (demo) {
      setDetected(
        profile
          ? "Recognized · X profile"
          : "Recognized · sample X thread · 2 posts",
      );
      return;
    }
    if (profile) {
      setDetected("Recognized · X profile");
      return;
    }
    setDetected("X post link · checking for a thread…");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not confirm this X link.");
        setDetected(
          `Recognized · X ${data.type}${data.type === "thread" ? ` · ${data.count} posts` : ""}`,
        );
      } catch {
        if (!controller.signal.aborted)
          setDetected("X post link · thread status unconfirmed");
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, demo]);

  async function run(action: Action) {
    if (!state || busyRef.current) return null;
    if (!online) {
      setError("You’re offline. tenbrains needs an internet connection.");
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setProgress([]);
    let result: AppState | null = null;
    try {
      if (demo) {
        if (
          ["capture", "import", "analyze", "learn", "grade"].includes(
            action.type,
          )
        ) {
          for (const message of [
            "Reading sample content",
            "Preparing illustrative demo result",
          ]) {
            setProgress((p) => [...p, message]);
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
        result = applyDemoAction(state, action);
        setState(result);
      } else {
        const response = await fetch("/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "The request could not be completed.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (line: string) => {
          if (!line.trim()) return;
          const event: ProgressEvent = JSON.parse(line);
          if ("error" in event) throw new Error(event.error);
          if ("message" in event) setProgress((p) => [...p, event.message]);
          if ("state" in event) {
            result = event.state;
            setState(event.state);
            if (action.type === "import") setImportCursor(event.nextCursor);
          }
        };
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            lines.forEach(consume);
          }
          buffer += decoder.decode();
          consume(buffer);
        } finally {
          reader.releaseLock();
        }
        if (!result)
          throw new Error(
            "The connection ended before a result arrived. Refresh before trying again.",
          );
      }
      if (action.type === "capture") {
        setUrl("");
        setModal(null);
        setToast(
          demo
            ? "Sample content added. No X request was made."
            : "Content added to your workspace.",
        );
      }
      if (action.type === "import")
        setToast(
          demo
            ? "Sample bookmark import. Your X bookmarks were not accessed."
            : "Bookmarks imported. X bookmarks were not changed.",
        );
      if (action.type === "refresh")
        setToast(
          demo
            ? "Demo feed is up to date."
            : "Refresh complete. Your feed is up to date.",
        );
      if (
        action.type === "learn" ||
        (action.type === "decide" && action.decision === "learn")
      ) {
        const next = result as AppState;
        setPathId(next.paths[0]?.id || null);
        setDay(null);
        setMode("learn");
      }
      if (action.type === "grade" && result) {
        const before = state.paths.find((p) => p.id === action.pathId)!;
        const after = (result as AppState).paths.find(
          (p) => p.id === action.pathId,
        )!;
        if (
          pathProgress(after).score > pathProgress(before).score &&
          pathProgress(before).level !== pathProgress(after).level
        )
          setToast(
            `Level up: ${pathProgress(after).level}. New reading unlocked.`,
          );
      }
      return result;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function goFollow(nextSection = "Home") {
    setMode("follow");
    setSection(nextSection);
    setTag(null);
  }
  function goTag(value: string) {
    setMode("follow");
    setTag(value);
    setSection("Tag");
  }
  const path = state?.paths.find((p) => p.id === pathId) || state?.paths[0];
  const selectedAccount = state?.accounts.find((a) => a.id === accountId);
  const allTags = state
    ? [
        ...new Set([
          ...state.followedTags,
          ...state.posts.flatMap((p) => p.tags),
        ]),
      ]
    : [];
  const recommended =
    state?.accounts
      .filter((a) => !state.followedAccounts.includes(a.id))
      .sort(
        (a, b) =>
          b.tags.filter((t) => state.followedTags.includes(t)).length -
          a.tags.filter((t) => state.followedTags.includes(t)).length,
      ) || [];
  const searchedAccounts =
    state?.accounts.filter((a) =>
      `${a.name} ${a.handle}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const feed =
    state?.posts
      .filter((p) =>
        tag
          ? p.tags.includes(tag)
          : section === "Explore" || tab === "For you"
            ? state.followedAccounts.includes(p.accountId) ||
              p.tags.some((t) => state.followedTags.includes(t)) ||
              section === "Explore"
            : state.followedAccounts.includes(p.accountId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) || [];

  function followButton(account: Account, small = false) {
    const followed = state!.followedAccounts.includes(account.id);
    return (
      <button
        className={`button ${followed ? "secondary-button" : "dark"} ${small ? "compact" : ""}`}
        disabled={busy}
        onClick={() =>
          run({
            type: "followAccount",
            accountId: account.id,
            follow: !followed,
          })
        }
      >
        {followed ? (
          <>
            <Check size={13} /> Following
          </>
        ) : (
          "Follow"
        )}
      </button>
    );
  }
  const captureForm = (
    <form
      className="capture-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (detected) run({ type: "capture", url: url.trim() });
      }}
    >
      <div className="capture-input-row">
        <Avatar />
        <input
          ref={inputRef}
          aria-label="X profile, post or thread link"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an X profile, post or thread link"
          required
        />
      </div>
      <div className="capture-bottom">
        {detected ? (
          <span className="recognized">
            <span className="dot" />
            {detected}
          </span>
        ) : (
          <span className="muted">A good idea starts with a link.</span>
        )}
        <button
          className="button teal"
          disabled={!detected || busy}
          type="submit"
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Plus size={15} />
          )}
          Add
        </button>
      </div>
      {demo && (
        <div className="sample-links">
          <span>Try a sample</span>
          <button
            type="button"
            onClick={() => setUrl("https://x.com/maya_builds")}
          >
            profile
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() =>
              setUrl("https://x.com/maya_builds/status/1234567890")
            }
          >
            thread
          </button>
        </div>
      )}
    </form>
  );
  const progressView = progress.length > 0 && (
    <div className="progress-log" aria-live="polite">
      {progress.map((line, i) => (
        <div key={i}>
          {busy && i === progress.length - 1 ? (
            <LoaderCircle size={12} className="spin" />
          ) : (
            <Check size={12} />
          )}{" "}
          {line}
        </div>
      ))}
    </div>
  );
  const errorView = error && (
    <div className="error" role="alert">
      {error}
      <button aria-label="Dismiss error" onClick={() => setError("")}>
        <X size={16} />
      </button>
    </div>
  );

  if (loading)
    return (
      <main className="welcome">
        <Mark />
        <p>Opening your workspace…</p>
        <LoaderCircle className="spin" />
      </main>
    );
  if (!state)
    return (
      <main className="welcome">
        <div className="welcome-brand">
          <Mark />
          <span>tenbrains</span>
        </div>
        <span className="eyebrow">A LITTLE MORE UNDERSTANDING</span>
        <h1>
          Follow your curiosity.
          <br />
          <em>Learn what matters.</em>
        </h1>
        <p>
          Turn what you read on X into a thoughtful feed
          <br className="desktop-break" /> and learning paths that make the
          ideas stick.
        </p>
        {loadError && <div className="error">{loadError}</div>}
        {configured ? (
          <a className="button dark" href="/auth/x">
            Sign in with X <ArrowRight size={16} />
          </a>
        ) : (
          <div className="setup-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Your personal workspace</strong>
              <p>
                Connect X and Grok in your deployment settings to get started.
                Only your X account can sign in.
              </p>
            </div>
          </div>
        )}
        <a className="button secondary-button" href="/demo/">
          Explore the interactive demo <ArrowRight size={16} />
        </a>
        <div className="welcome-footer">
          <span>Open source. Personally yours.</span>
          <a
            href="https://github.com/moeghashim/tenbrains"
            target="_blank"
            rel="noreferrer"
          >
            Setup instructions <ExternalLink size={12} />
          </a>
        </div>
      </main>
    );

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <button
            className="brand"
            aria-label="tenbrains home"
            onClick={() => goFollow()}
          >
            <Mark />
            <span className="nav-label">tenbrains</span>
          </button>
          <button
            className="collapse-button icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="mode-switch" aria-label="Workspace mode">
          <button
            className={mode === "follow" ? "active" : ""}
            aria-label="Follow mode"
            aria-pressed={mode === "follow"}
            onClick={() => goFollow()}
          >
            <i className="dot teal-dot" />
            <span className="nav-label">Follow</span>
          </button>
          <button
            className={mode === "learn" ? "active" : ""}
            aria-label="Learn mode"
            aria-pressed={mode === "learn"}
            onClick={() => {
              setMode("learn");
              setDay(null);
            }}
          >
            <i className="dot amber-dot" />
            <span className="nav-label">Learn</span>
          </button>
        </div>
        <div className="sidebar-content">
          {mode === "follow" ? (
            <>
              <nav aria-label="Main navigation">
                {[
                  { name: "Home", Icon: Home },
                  { name: "Explore", Icon: Compass },
                  { name: "Following", Icon: Users },
                ].map(({ name, Icon }) => (
                  <button
                    key={name}
                    title={name}
                    className={`nav-item ${section === name ? "selected" : ""}`}
                    onClick={() => goFollow(name)}
                  >
                    <Icon size={21} strokeWidth={section === name ? 2 : 1.6} />
                    <span className="nav-label">{name}</span>
                    {name === "Following" && (
                      <span className="count nav-label">
                        {state.followedAccounts.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="eyebrow sidebar-label nav-label">
                Followed tags
              </div>
              <div className="tag-navigation">
                {state.followedTags.map((t) => (
                  <button
                    key={t}
                    title={`#${tagName(t)}`}
                    className={tag === t ? "selected" : ""}
                    onClick={() => goTag(t)}
                  >
                    <Hash size={17} />
                    <span className="nav-label">{tagName(t)}</span>
                    <span className="count nav-label">
                      {state.posts.filter((p) => p.tags.includes(t)).length}
                    </span>
                  </button>
                ))}
                {state.followedTags.length === 0 && (
                  <p className="muted nav-label">
                    Follow a tag to make it yours.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow sidebar-label nav-label">
                Your learning paths
              </div>
              {state.paths.map((p) => (
                <button
                  className={`path-nav ${path?.id === p.id ? "selected" : ""}`}
                  title={p.title}
                  key={p.id}
                  onClick={() => {
                    setPathId(p.id);
                    setDay(null);
                  }}
                >
                  <span className="dot amber-dot" />
                  <div className="nav-label">
                    <div>{p.title}</div>
                    <span className="muted">
                      {pathProgress(p).completed.length} of {p.days.length}{" "}
                      lessons
                    </span>
                    <span className="mini-progress">
                      <i
                        style={{
                          width: `${(pathProgress(p).completed.length / p.days.length) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="sidebar-actions">
          <button
            className="button dark"
            title="New brain"
            onClick={() => {
              setModal("capture");
              setError("");
            }}
          >
            <Plus size={19} />
            <span className="nav-label">New brain</span>
          </button>
          <button
            className="button secondary-button"
            title="Import X bookmarks"
            disabled={busy}
            onClick={() => run({ type: "import" })}
          >
            <ArrowDownToLine size={17} />
            <span className="nav-label">Import X bookmarks</span>
          </button>
        </div>
        <div className="sidebar-user">
          <Avatar />
          <div className="nav-label">
            <strong>{demo ? "Your workspace" : state.user.name}</strong>
            <span>{demo ? "Interactive demo" : `@${state.user.handle}`}</span>
          </div>
          <button
            className="icon-button nav-label"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings size={17} />
          </button>
        </div>
        <button
          className="rail-settings icon-button"
          aria-label="Settings"
          onClick={() => setModal("settings")}
        >
          <Settings size={17} />
        </button>
      </aside>

      <div className="workspace-main">
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} /> You’re offline. Connect to continue.
          </div>
        )}
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="dot" /> Demo workspace{" "}
              <span className="demo-detail">
                · Sample content, no connected accounts
              </span>
            </span>
            <a href="/">
              Set up your own <ArrowRight size={12} />
            </a>
          </div>
        )}
        <header className="mobile-header">
          <button className="brand" onClick={() => goFollow()}>
            <Mark />
            <span>tenbrains</span>
          </button>
          <div>
            <button
              className={mode === "follow" ? "active" : ""}
              onClick={() => goFollow()}
            >
              Follow
            </button>
            <button
              className={mode === "learn" ? "active learn-text" : ""}
              onClick={() => {
                setMode("learn");
                setDay(null);
              }}
            >
              Learn
            </button>
            <button
              className="icon-button"
              aria-label="Settings"
              onClick={() => setModal("settings")}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
        <div
          className={`content-layout ${mode === "learn" ? "learn-layout" : ""}`}
        >
          <main className="feed-column" id="main-content">
            {mode === "follow" ? (
              <>
                <header className="feed-header">
                  {section === "Home" ? (
                    <div className="feed-tabs">
                      {["For you", "Following"].map((t) => (
                        <button
                          key={t}
                          className={tab === t ? "active" : ""}
                          aria-pressed={tab === t}
                          onClick={() => setTab(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="section-heading">
                      <button
                        className="icon-button"
                        aria-label="Back home"
                        onClick={() => goFollow()}
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <h1>{tag ? `#${tagName(tag)}` : section}</h1>
                      {tag && (
                        <div className="tag-actions">
                          <button
                            className={`button compact ${state.followedTags.includes(tag) ? "secondary-button" : "teal"}`}
                            disabled={busy}
                            onClick={() =>
                              run({
                                type: "followTag",
                                tag,
                                follow: !state.followedTags.includes(tag),
                              })
                            }
                          >
                            {state.followedTags.includes(tag)
                              ? "Following tag"
                              : "Follow tag"}
                          </button>
                          <button
                            className="button compact amber"
                            disabled={busy || !feed.length}
                            onClick={() => run({ type: "learn", tag })}
                          >
                            <BookOpen size={13} />
                            Learn
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </header>
                {section === "Home" && (
                  <section aria-label="Add X content">{captureForm}</section>
                )}
                {errorView}
                {progressView}
                {state.captures.slice(0, 3).map((c) => (
                  <section className="capture-result" key={c.id}>
                    <div className="eyebrow">
                      <Check size={12} />{" "}
                      {c.detectedType === "import"
                        ? "Bookmark import"
                        : `X ${c.detectedType}`}{" "}
                      · ready
                    </div>
                    <h2>{c.analysis?.title || "Profile added"}</h2>
                    <p>
                      {c.analysis?.summary ||
                        "This account is now in your Following feed."}
                    </p>
                    {c.postIds
                      .slice(0, expanded.includes(c.id) ? undefined : 3)
                      .map((id) => {
                        const p = state.posts.find((p) => p.id === id);
                        return p && <blockquote key={id}>{p.text}</blockquote>;
                      })}
                    {c.postIds.length > 3 && !expanded.includes(c.id) && (
                      <button
                        className="text-button"
                        onClick={() => setExpanded([...expanded, c.id])}
                      >
                        Show {c.postIds.length - 3} more posts
                      </button>
                    )}
                    <div className="chips">
                      {c.analysis?.tags.map((t) => (
                        <button
                          className="chip"
                          key={t}
                          onClick={() => goTag(t)}
                        >
                          #{tagName(t)}
                        </button>
                      ))}
                    </div>
                    <div className="capture-decisions">
                      {c.decision === "none" ? (
                        <>
                          <button
                            className="button teal"
                            disabled={busy}
                            onClick={() =>
                              run({
                                type: "decide",
                                captureId: c.id,
                                decision: "follow",
                              })
                            }
                          >
                            Follow
                          </button>
                          <button
                            className="button amber"
                            disabled={busy}
                            onClick={() =>
                              run({
                                type: "decide",
                                captureId: c.id,
                                decision: "learn",
                              })
                            }
                          >
                            <BookOpen size={14} />
                            Learn
                          </button>
                        </>
                      ) : (
                        <span className="success">
                          <Check size={14} />
                          {c.decision === "follow"
                            ? "Following"
                            : "Learning path created"}
                        </span>
                      )}
                    </div>
                  </section>
                ))}
                {importCursor && (
                  <button
                    className="button secondary-button import-more"
                    disabled={busy}
                    onClick={() =>
                      run({ type: "import", cursor: importCursor })
                    }
                  >
                    Import next bookmark batch
                  </button>
                )}
                {section === "Explore" && (
                  <section className="explore-tags">
                    <span className="eyebrow">Follow an idea</span>
                    <h2>A little curiosity goes a long way.</h2>
                    <div className="chips">
                      {allTags.map((t) => (
                        <button
                          className="chip"
                          key={t}
                          onClick={() => goTag(t)}
                        >
                          #{tagName(t)}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {section === "Following" ? (
                  <section className="following-list">
                    <h2>Your people</h2>
                    <p className="muted">
                      Following here doesn’t change who you follow on X.
                    </p>
                    {state.accounts
                      .filter((a) => state.followedAccounts.includes(a.id))
                      .map((a) => (
                        <div className="person-row" key={a.id}>
                          <Avatar
                            account={a}
                            onClick={() => setAccountId(a.id)}
                          />
                          <button
                            className="person-name"
                            onClick={() => setAccountId(a.id)}
                          >
                            <strong>{a.name}</strong>
                            <span>@{a.handle}</span>
                          </button>
                          {followButton(a, true)}
                        </div>
                      ))}
                    {!state.followedAccounts.length && (
                      <p>
                        Paste an X profile link to follow your first account.
                      </p>
                    )}
                  </section>
                ) : (
                  <>
                    <div className="feed-label">
                      <span>
                        {tag
                          ? "Posts on this topic"
                          : section === "Explore"
                            ? "From your library"
                            : "A few things worth your attention"}
                      </span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => run({ type: "refresh" })}
                      >
                        <RefreshCw size={13} className={busy ? "spin" : ""} />
                        Refresh
                      </button>
                    </div>
                    {feed.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        account={
                          state.accounts.find((a) => a.id === post.accountId)!
                        }
                        followed={state.followedAccounts.includes(
                          post.accountId,
                        )}
                        busy={busy}
                        demo={demo}
                        openAccount={() => setAccountId(post.accountId)}
                        goTag={goTag}
                        analyze={() =>
                          run({ type: "analyze", postId: post.id })
                        }
                        follow={() =>
                          run({
                            type: "followAccount",
                            accountId: post.accountId,
                            follow: !state.followedAccounts.includes(
                              post.accountId,
                            ),
                          })
                        }
                        learn={() =>
                          run({
                            type: "learn",
                            postIds: post.threadId
                              ? state.posts
                                  .filter((p) => p.threadId === post.threadId)
                                  .map((p) => p.id)
                              : [post.id],
                          })
                        }
                      />
                    ))}
                    {feed.length === 0 && (
                      <div className="empty-state">
                        <Sparkles size={28} />
                        <h2>Your next good idea starts here.</h2>
                        <p>
                          Add an X profile, post, or thread. Follow what
                          interests you, then go a little deeper.
                        </p>
                        <button
                          className="button dark"
                          onClick={() => setModal("capture")}
                        >
                          <Plus size={15} />
                          New brain
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="section-heading learn-heading">
                  <span className="eyebrow">
                    <span className="dot amber-dot" /> Your learning space
                  </span>
                  <span className="muted">At your own pace</span>
                </div>
                {state.paths.length > 1 && (
                  <label className="mobile-path-picker">
                    Your path
                    <select
                      aria-label="Learning path"
                      value={path?.id || ""}
                      onChange={(e) => {
                        setPathId(e.target.value);
                        setDay(null);
                      }}
                    >
                      {state.paths.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {errorView}
                {progressView}
                {path ? (
                  <LearnView
                    path={path}
                    state={state}
                    day={day ?? path.currentDay}
                    setDay={setDay}
                    busy={busy}
                    demo={demo}
                    grade={(text, selectedDay) => {
                      // Keep the checked lesson visible even when progress advances.
                      setDay(selectedDay);
                      return run({
                        type: "grade",
                        pathId: path.id,
                        day: selectedDay,
                        text,
                      });
                    }}
                    goTag={goTag}
                    openAccount={setAccountId}
                    followButton={followButton}
                  />
                ) : (
                  <div className="empty-state">
                    <BookOpen size={30} />
                    <h1>Make an idea your own.</h1>
                    <p>
                      Choose Learn on a post or thread to create your first
                      path.
                    </p>
                    <button className="button amber" onClick={() => goFollow()}>
                      Find something to learn <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
          <aside className="right-column">
            {mode === "follow" ? (
              <>
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Search people"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search people"
                  />
                </label>
                {query ? (
                  <section className="right-card">
                    <h2>People in your library</h2>
                    {searchedAccounts.map((a) => (
                      <div key={a.id} className="person-row">
                        <Avatar
                          account={a}
                          onClick={() => setAccountId(a.id)}
                        />
                        <button
                          className="person-name"
                          onClick={() => setAccountId(a.id)}
                        >
                          <strong>{a.name}</strong>
                          <span>@{a.handle}</span>
                        </button>
                      </div>
                    ))}
                    {searchedAccounts.length === 0 && (
                      <p className="muted">
                        No matching accounts. Add an X profile to grow your
                        library.
                      </p>
                    )}
                  </section>
                ) : (
                  <section className="right-card">
                    <h2>Who to follow</h2>
                    <p className="card-description">
                      A few minds you might connect with.
                    </p>
                    {recommended.slice(0, 3).map((a) => (
                      <div className="person-row" key={a.id}>
                        <Avatar
                          account={a}
                          onClick={() => setAccountId(a.id)}
                        />
                        <button
                          className="person-name"
                          onClick={() => setAccountId(a.id)}
                        >
                          <strong>{a.name}</strong>
                          <span>@{a.handle}</span>
                        </button>
                        {followButton(a, true)}
                      </div>
                    ))}
                    {recommended.length === 0 && (
                      <p className="muted">
                        Add more X profiles to discover related people.
                      </p>
                    )}
                    <button
                      className="text-button card-link"
                      onClick={() => goFollow("Following")}
                    >
                      See who you’re following <ArrowRight size={13} />
                    </button>
                  </section>
                )}
                <section className="right-card curiosity-card">
                  <span className="eyebrow">
                    From following to understanding
                  </span>
                  <BookOpen size={24} />
                  <h2>
                    Don’t just scroll.
                    <br />
                    Let something stick.
                  </h2>
                  <p>
                    Turn a thread that caught your eye into a learning path. One
                    idea at a time.
                  </p>
                  <button
                    className="text-button learn-text"
                    onClick={() => {
                      setMode("learn");
                      setDay(null);
                    }}
                  >
                    Explore your paths <ArrowRight size={14} />
                  </button>
                </section>
                <section className="right-tags">
                  <span className="eyebrow">Your interests</span>
                  <div className="chips">
                    {allTags.slice(0, 5).map((t) => (
                      <button className="chip" key={t} onClick={() => goTag(t)}>
                        #{tagName(t)}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <section className="right-card learning-note">
                <span className="eyebrow">The Feynman technique</span>
                <h2>
                  Simple is a sign
                  <br />
                  of understanding.
                </h2>
                <p>
                  Study the idea. Explain it in your own words. Find the gaps.
                  Make it simpler.
                </p>
                <div className="note-divider" />
                <p>
                  You don’t have to get it right the first time. That’s what
                  learning is for.
                </p>
              </section>
            )}
            <footer className="right-footer">
              <button onClick={() => setModal("install")}>
                <ArrowDownToLine size={12} />
                Install app
              </button>
              <a
                href="https://github.com/moeghashim/tenbrains"
                target="_blank"
                rel="noreferrer"
              >
                Open source <ExternalLink size={11} />
              </a>
              <span>
                <Mark small /> A little more understanding.
              </span>
            </footer>
          </aside>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button
            aria-label="Home"
            className={mode === "follow" && section === "Home" ? "active" : ""}
            onClick={() => goFollow()}
          >
            <Home size={21} />
            <span>Home</span>
          </button>
          <button aria-label="Explore" onClick={() => goFollow("Explore")}>
            <Compass size={21} />
            <span>Explore</span>
          </button>
          <button aria-label="New brain" onClick={() => setModal("capture")}>
            <Plus size={23} />
            <span>New brain</span>
          </button>
          <button
            aria-label="Learn"
            className={mode === "learn" ? "learn-text" : ""}
            onClick={() => {
              setMode("learn");
              setDay(null);
            }}
          >
            <BookOpen size={21} />
            <span>Learn</span>
          </button>
          <button
            aria-label="Import X bookmarks"
            disabled={busy}
            onClick={() => run({ type: "import" })}
          >
            <ArrowDownToLine size={21} />
            <span>Import</span>
          </button>
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {selectedAccount && (
        <Modal panel title="Account" close={() => setAccountId(null)}>
          <div className="account-profile">
            <Avatar account={selectedAccount} />
            <h2>{selectedAccount.name}</h2>
            <p className="muted">@{selectedAccount.handle}</p>
            <p>{selectedAccount.bio}</p>
            <div className="account-counts">
              <span>
                <strong>{compact(selectedAccount.followers)}</strong> followers
              </span>
              <span>
                <strong>{compact(selectedAccount.following)}</strong> following
              </span>
            </div>
            {followButton(selectedAccount)}
            <div className="chips">
              {selectedAccount.tags.map((t) => (
                <button
                  key={t}
                  className="chip"
                  onClick={() => {
                    goTag(t);
                    setAccountId(null);
                  }}
                >
                  #{tagName(t)}
                </button>
              ))}
            </div>
            <h3>Recent posts</h3>
            {state.posts
              .filter((p) => p.accountId === selectedAccount.id)
              .map((p) => (
                <div className="account-post" key={p.id}>
                  <p>{p.text}</p>
                  <button
                    className="text-button learn-text"
                    disabled={busy}
                    onClick={async () => {
                      const result = await run({
                        type: "learn",
                        postIds: [p.id],
                      });
                      if (result) setAccountId(null);
                    }}
                  >
                    <BookOpen size={14} />
                    Learn
                  </button>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {modal === "capture" && (
        <Modal title="A new brain starts here" close={() => setModal(null)}>
          <p className="modal-description">
            Add something worth following. Or something you want to understand.
          </p>
          {captureForm}
          {errorView}
          {progressView}
          <p className="privacy-note">
            <ShieldCheck size={14} />
            Your X account is read-only. We never post or change your bookmarks.
          </p>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Your workspace" close={() => setModal(null)}>
          <div className="settings-content">
            <div className="settings-row">
              <div>
                <strong>{demo ? "Demo mode" : "Signed in with X"}</strong>
                <p>
                  {demo
                    ? "Fictional sample accounts. Changes last until you reload."
                    : `@${state.user.handle} · only the deployment owner can sign in`}
                </p>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="settings-row">
              <div>
                <strong>Grok · text-first learning</strong>
                <p>
                  {demo
                    ? "Not connected. Feedback and scores are illustrative."
                    : "API credentials are stored server-side in Cloudflare secrets. Images and videos are displayed, not analyzed."}
                </p>
              </div>
              <Sparkles size={20} />
            </div>
            <button
              className="button secondary-button"
              onClick={() => setModal("install")}
            >
              <ArrowDownToLine size={16} />
              Install tenbrains on your phone
            </button>
            {demo ? (
              <a className="button dark" href="/">
                Set up your own workspace
              </a>
            ) : (
              <button
                className="text-button"
                onClick={async () => {
                  const response = await fetch("/auth/logout", {
                    method: "POST",
                  });
                  if (response.ok) location.assign("/");
                  else setError("Could not sign out. Please try again.");
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
            {errorView}
          </div>
        </Modal>
      )}
      {modal === "install" && (
        <Modal
          title="Your curiosity, one tap away"
          close={() => setModal(null)}
        >
          <div className="install-content">
            <img
              src="/icons/icon-192.png"
              width="76"
              height="76"
              alt="tenbrains app icon"
            />
            <p>
              Install tenbrains on your home screen. It opens in its own window
              and needs an internet connection.
            </p>
            <h3>iPhone or iPad</h3>
            <p>
              Open this site in Safari, tap Share, then choose{" "}
              <strong>Add to Home Screen</strong>.
            </p>
            <h3>Android</h3>
            <p>
              Open this site in Chrome and choose <strong>Install app</strong>{" "}
              or <strong>Add to Home screen</strong> from the menu.
            </p>
            {installPrompt.current && (
              <button
                className="button dark"
                onClick={async () => {
                  const prompt = installPrompt.current;
                  if (prompt) {
                    await prompt.prompt();
                    await prompt.userChoice;
                    installPrompt.current = null;
                    setModal(null);
                  }
                }}
              >
                Install app <ArrowDownToLine size={16} />
              </button>
            )}
            <p className="muted">
              Use your deployed HTTPS address to install your own workspace.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PostCard({
  post,
  account,
  followed,
  busy,
  demo,
  openAccount,
  goTag,
  analyze,
  follow,
  learn,
}: {
  post: Post;
  account: Account;
  followed: boolean;
  busy: boolean;
  demo: boolean;
  openAccount: () => void;
  goTag: (tag: string) => void;
  analyze: () => unknown;
  follow: () => unknown;
  learn: () => unknown;
}) {
  const [showAnalyze, setShowAnalyze] = useState(false);
  return (
    <article className="post-card">
      <Avatar account={account} onClick={openAccount} />
      <div className="post-body">
        <header className="post-heading">
          <button className="author-name" onClick={openAccount}>
            {account.name}
          </button>
          <span className="handle">@{account.handle}</span>
          <span className="post-time">
            ·{" "}
            {demo
              ? "sample"
              : new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(post.createdAt))}
          </span>
          <a
            className="post-external"
            href={demo ? undefined : sourceUrl(post, account)}
            target="_blank"
            rel="noreferrer"
            aria-label={demo ? "Sample post" : "View original on X"}
          >
            {demo ? <MoreHorizontal size={17} /> : <ExternalLink size={14} />}
          </a>
        </header>
        <div className="post-text">{post.text}</div>
        {post.threadId && post.position === 0 && (
          <span className="thread-label">
            A thread to think about <ChevronRight size={12} />
          </span>
        )}
        {post.media.length > 0 && (
          <div
            className={`post-media ${post.media.length > 1 ? "multiple" : ""}`}
          >
            {post.media.map((media, i) =>
              media.type === "image" ? (
                <img
                  key={i}
                  src={media.url}
                  alt={`Image ${i + 1} attached to ${account.name}’s post`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="video-media" key={i}>
                  <video
                    controls
                    preload="none"
                    poster={media.poster}
                    src={media.url}
                    aria-label={`Video attached to ${account.name}’s post`}
                  />
                  <div className="video-meta">
                    {media.duration ? (
                      <span>
                        {Math.floor(media.duration / 60)}:
                        {String(Math.floor(media.duration % 60)).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    ) : null}
                    {media.captions && <span>captions found</span>}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
        <div className="chips">
          {post.tags.map((t) => (
            <button key={t} className="chip" onClick={() => goTag(t)}>
              #{tagName(t)}
            </button>
          ))}
        </div>
        <div className="post-actions">
          <button
            disabled={busy}
            className={showAnalyze ? "active" : ""}
            aria-expanded={showAnalyze}
            onClick={() => {
              setShowAnalyze(!showAnalyze);
              if (!post.analysis && !showAnalyze) analyze();
            }}
          >
            <Sparkles size={15} />
            Analyze
          </button>
          <button disabled={busy} onClick={follow}>
            {followed ? <Check size={15} /> : <Plus size={15} />}
            <span>{followed ? "Following" : "Follow"}</span>
          </button>
          <button disabled={busy} className="learn-text" onClick={learn}>
            <BookOpen size={15} />
            Learn <ArrowRight size={13} />
          </button>
        </div>
        {showAnalyze && (
          <section className="inline-analyze" aria-label="Post summary">
            <span className="eyebrow">
              Analyze · {post.analysis?.sourceNote || "text only"}
            </span>
            {post.analysis ? (
              <>
                <h3>{post.analysis.title}</h3>
                <p>{post.analysis.summary}</p>
                {demo && (
                  <span className="muted">Illustrative demo summary</span>
                )}
              </>
            ) : (
              <p className="muted">
                {busy
                  ? "Reading and analyzing the post…"
                  : "No summary yet. Close and reopen Analyze to try again."}
              </p>
            )}
          </section>
        )}
      </div>
    </article>
  );
}

function LearnView({
  path,
  state,
  day,
  setDay,
  busy,
  demo,
  grade,
  goTag,
  openAccount,
  followButton,
}: {
  path: LearnPath;
  state: AppState;
  day: number;
  setDay: (day: number) => void;
  busy: boolean;
  demo: boolean;
  grade: (text: string, day: number) => Promise<unknown>;
  goTag: (tag: string) => void;
  openAccount: (id: string) => void;
  followButton: (account: Account, small?: boolean) => ReactNode;
}) {
  const lesson = path.days[day] || path.days[0];
  const [text, setText] = useState("");
  const progress = pathProgress(path);
  const explanation = path.explanations.filter((e) => e.day === day).at(-1);
  useEffect(() => {
    setText(path.explanations.filter((e) => e.day === day).at(-1)?.text || "");
  }, [day, path.id]); // Preserve an in-progress rewrite when other path data changes.
  const levels = ["Noob", "Rookie", "Pro", "Ninja"];
  const creators = state.accounts.filter((a) => a.tags.includes(path.tag));
  return (
    <div className="learn-content">
      <div className="path-title">
        <span className="eyebrow">A path to understanding</span>
        <h1>{path.title}</h1>
        <div>
          <span>{path.sourceLabel}</span>
          <span className="dot" />
          <span>
            Lesson {day + 1} of {path.days.length}
          </span>
        </div>
      </div>
      <section className="level-card">
        <div className="level-top">
          <div>
            <span className="eyebrow">Your knowledge level</span>
            <h2>
              {progress.level}{" "}
              <span>
                {progress.score}
                <small>/100</small>
              </span>
            </h2>
          </div>
          <span className="level-badge">
            <Sparkles size={16} />
            {progress.toNext
              ? `${progress.toNext} points to ${progress.nextLevel}`
              : "Keep your understanding sharp"}
          </span>
        </div>
        <div className="level-ladder">
          {levels.map((level, i) => (
            <div
              key={level}
              className={levels.indexOf(progress.level) >= i ? "reached" : ""}
            >
              <i />
              <div>
                <strong>{level}</strong>
                <span>{["0–24", "25–49", "50–79", "80–100"][i]}</span>
              </div>
            </div>
          ))}
        </div>
        <p>
          Built from your recent explanations and lessons completed. Not how
          much you’ve scrolled.
        </p>
      </section>
      <section className="lesson-section">
        <div className="lesson-kicker">
          <span className="eyebrow">
            Lesson {String(day + 1).padStart(2, "0")}
          </span>
          {progress.completed.includes(day) && (
            <span className="success">
              <Check size={13} />
              Completed
            </span>
          )}
        </div>
        <h2>{lesson.concept}</h2>
        <div className="lesson-prose">
          {lesson.lesson.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <div className="source-links">
          <span>From the sources</span>
          {lesson.sourcePostIds.map((id) => {
            const post = state.posts.find((p) => p.id === id);
            const account = state.accounts.find(
              (a) => a.id === post?.accountId,
            );
            return (
              post &&
              (demo ? (
                <button
                  className="text-button"
                  key={id}
                  onClick={() => openAccount(post.accountId)}
                >
                  @{account?.handle} <ExternalLink size={11} />
                </button>
              ) : (
                <a
                  key={id}
                  href={sourceUrl(post, account)}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{account?.handle} <ExternalLink size={11} />
                </a>
              ))
            );
          })}
        </div>
      </section>
      <section className="feynman-card">
        <div className="feynman-title">
          <span className="eyebrow">
            <Sparkles size={13} /> The Feynman check
          </span>
          <span className="muted">Understanding, in your own words</span>
        </div>
        <div className="feynman-steps">
          {["Study", "Teach it", "Find gaps", "Simplify"].map((step, i) => (
            <span
              key={step}
              className={i === (explanation ? 2 : 1) ? "active" : ""}
            >
              <i>{i === 0 ? <Check size={11} /> : i + 1}</i>
              {step}
              {i < 3 && <ChevronRight size={12} />}
            </span>
          ))}
        </div>
        <h3>Explain “{lesson.concept}” to a 12-year-old.</h3>
        <p className="muted">
          Keep it simple. Use an everyday example. Notice where you get stuck.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await grade(text.trim(), day);
          }}
        >
          <label className="sr-only" htmlFor="explanation">
            Your explanation
          </label>
          <textarea
            id="explanation"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Here’s how I’d explain it…"
            minLength={20}
            maxLength={6000}
            required
            rows={6}
          />
          <div className="feynman-submit">
            <span className="muted">
              {demo
                ? "Demo: illustrative feedback, sample score of 82"
                : "70 or more completes this lesson"}
            </span>
            <button
              className="button amber"
              disabled={busy || text.trim().length < 20}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              {explanation ? "Check again" : "Check explanation"}
            </button>
          </div>
        </form>
        {explanation && (
          <div className="feedback" aria-live="polite">
            <div className="feedback-heading">
              <strong>
                {explanation.score >= 70
                  ? "A little clearer. A little closer."
                  : "You’ve found a place to go deeper."}
              </strong>
              <span>{explanation.score}/100</span>
            </div>
            {explanation.feedback.map((f, i) => {
              const source = state.posts.find((p) => p.id === f.sourceRef);
              const account = state.accounts.find(
                (a) => a.id === source?.accountId,
              );
              return (
                <div key={i} className={`feedback-row ${f.kind}`}>
                  <span>
                    {f.kind === "ok" ? "✓" : f.kind === "gap" ? "○" : "!"}
                  </span>
                  <p>
                    {f.text}
                    {source &&
                      (demo ? (
                        <button
                          className="text-button"
                          onClick={() => openAccount(source.accountId)}
                        >
                          Re-read sample source <ExternalLink size={11} />
                        </button>
                      ) : (
                        <a
                          href={sourceUrl(source, account)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Re-read source <ExternalLink size={11} />
                        </a>
                      ))}
                  </p>
                </div>
              );
            })}
            {explanation.score >= 70 && day < path.days.length - 1 && (
              <button className="button amber" onClick={() => setDay(day + 1)}>
                Next lesson <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
      </section>
      <section className="read-next">
        <div className="subsection-heading">
          <h2>Read next</h2>
          <span className="muted">Grow into your next idea.</span>
        </div>
        {path.suggestions.length ? (
          path.suggestions.map((s, i) => {
            const locked =
              levels.indexOf(progress.level) < levels.indexOf(s.minLevel);
            const post = state.posts.find((p) => p.id === s.postId);
            const account = state.accounts.find(
              (a) => a.id === post?.accountId,
            );
            return (
              post && (
                <div
                  key={`${s.postId}-${i}`}
                  className={`suggestion ${locked ? "locked" : ""}`}
                >
                  <BookOpen size={19} />
                  <div>
                    <strong>
                      {post.analysis?.title || post.text.split("\n")[0]}
                    </strong>
                    <span>
                      @{account?.handle} ·{" "}
                      {locked ? `Unlocks at ${s.minLevel}` : "Ready to explore"}
                    </span>
                  </div>
                  {!locked &&
                    (demo ? (
                      <button
                        className="icon-button"
                        aria-label="Open sample reading"
                        onClick={() => openAccount(post.accountId)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    ) : (
                      <a
                        href={sourceUrl(post, account)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open suggested reading"
                      >
                        <ArrowRight size={17} />
                      </a>
                    ))}
                </div>
              )
            );
          })
        ) : (
          <p className="muted">
            More reading appears as relevant source posts become available.
          </p>
        )}
      </section>
      <section className="creators">
        <h2>Creators who teach this</h2>
        {creators.map((a) => (
          <div key={a.id} className="person-row">
            <Avatar account={a} onClick={() => openAccount(a.id)} />
            <button className="person-name" onClick={() => openAccount(a.id)}>
              <strong>{a.name}</strong>
              <span>@{a.handle}</span>
            </button>
            {followButton(a, true)}
          </div>
        ))}
      </section>
      <section className="day-list">
        <div className="subsection-heading">
          <h2>Your path</h2>
          <button className="chip" onClick={() => goTag(path.tag)}>
            #{tagName(path.tag)}
          </button>
        </div>
        {path.days.map((d, i) => (
          <button
            key={i}
            onClick={() => setDay(i)}
            className={day === i ? "active" : ""}
          >
            <span
              className={`day-number ${progress.completed.includes(i) ? "complete" : ""}`}
            >
              {progress.completed.includes(i) ? (
                <Check size={14} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span>{d.concept}</span>
            <span>
              {day === i
                ? "You’re here"
                : progress.completed.includes(i)
                  ? "Completed"
                  : ""}
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </section>
    </div>
  );
}
