#!/usr/bin/env node

import process from "node:process";

interface ApiErrorPayload {
	error?: {
		message?: string;
	};
}

function readBaseUrl(): string {
	return (process.env.TENBRAINS_BASE_URL?.trim() || process.env.RABBITBRAIN_BASE_URL?.trim() || "http://localhost:3000").replace(
		/\/+$/,
		"",
	);
}

function readAuthCookie(): string {
	const cookie = process.env.TENBRAINS_AUTH_COOKIE?.trim() || process.env.RABBITBRAIN_AUTH_COOKIE?.trim();
	if (!cookie) {
		throw new Error("Set TENBRAINS_AUTH_COOKIE to an authenticated Cookie header value.");
	}
	return cookie;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${readBaseUrl()}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			cookie: readAuthCookie(),
			...(init?.headers ?? {}),
		},
	});
	const payload = (await response.json()) as T | ApiErrorPayload;
	if (!response.ok) {
		throw new Error((payload as ApiErrorPayload)?.error?.message ?? `Request failed (${response.status}).`);
	}
	return payload as T;
}

function printUsage(): void {
	console.error(
		[
			"Usage:",
			"  npm run xurl:suggestions -- status",
			"  npm run xurl:suggestions -- list",
			"  npm run xurl:suggestions -- save <suggestion_id>",
			"  npm run xurl:suggestions -- dismiss <suggestion_id>",
			"",
			"Environment:",
			"  TENBRAINS_BASE_URL     Optional, defaults to http://localhost:3000",
			"  TENBRAINS_AUTH_COOKIE  Required authenticated Cookie header value",
			"  RABBITBRAIN_*          Still accepted as legacy aliases",
		].join("\n"),
	);
}

async function handleStatus(): Promise<void> {
	const payload = await requestJson<{ state?: { lastSyncedAt?: number; lastError?: string; importedCount: number } }>(
		"/api/me/bookmark-sync",
		{ method: "GET" },
	);
	if (!payload.state) {
		console.log("No bookmark sync state yet.");
		return;
	}
	console.log(`Imported count: ${payload.state.importedCount}`);
	console.log(`Last synced: ${payload.state.lastSyncedAt ? new Date(payload.state.lastSyncedAt).toLocaleString() : "never"}`);
	if (payload.state.lastError) {
		console.log(`Last error: ${payload.state.lastError}`);
	}
}

async function handleList(): Promise<void> {
	const payload = await requestJson<{
		suggestions: Array<{
			id: string;
			authorUsername: string;
			score: number;
			tweetText: string;
			reasons: Array<{ label: string }>;
		}>;
	}>("/api/me/suggestions", { method: "GET" });

	if (payload.suggestions.length === 0) {
		console.log("No suggestions available.");
		return;
	}

	for (const suggestion of payload.suggestions) {
		console.log(`${suggestion.id}  @${suggestion.authorUsername}  score=${Math.round(suggestion.score)}`);
		console.log(`  ${suggestion.reasons.map((reason) => reason.label).join(" | ")}`);
		console.log(`  ${suggestion.tweetText.replace(/\s+/g, " ").slice(0, 180)}`);
	}
}

async function handleAction(path: "/api/me/suggestions/save" | "/api/me/suggestions/dismiss", suggestionId: string): Promise<void> {
	const payload = await requestJson<{ suggestions: Array<{ id: string }> }>(path, {
		method: "POST",
		body: JSON.stringify({ suggestionId }),
	});
	console.log(`Updated suggestions: ${payload.suggestions.length} remaining`);
}

async function main(): Promise<void> {
	const [command, value] = process.argv.slice(2);
	if (!command) {
		printUsage();
		process.exitCode = 1;
		return;
	}

	if (command === "status") {
		await handleStatus();
		return;
	}
	if (command === "list") {
		await handleList();
		return;
	}
	if (command === "save") {
		if (!value) {
			throw new Error("suggestion_id is required for save.");
		}
		await handleAction("/api/me/suggestions/save", value);
		return;
	}
	if (command === "dismiss") {
		if (!value) {
			throw new Error("suggestion_id is required for dismiss.");
		}
		await handleAction("/api/me/suggestions/dismiss", value);
		return;
	}

	printUsage();
	process.exitCode = 1;
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
