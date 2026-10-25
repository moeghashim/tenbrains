export function parseXUrl(input: string): { type: "profile" | "post"; handle: string; id?: string; url: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid X URL."); }
  if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || url.username || url.password || url.port) throw new Error("Use an https://x.com profile or post URL.");
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/status\/(\d+))?\/?$/);
  if (!match || ["home", "explore", "search", "settings", "i", "intent", "messages", "notifications"].includes(match[1].toLowerCase())) throw new Error("Use a profile or post URL.");
  return { type: match[2] ? "post" : "profile", handle: match[1], id: match[2], url: `https://x.com/${match[1]}${match[2] ? `/status/${match[2]}` : ""}` };
}
