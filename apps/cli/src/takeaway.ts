#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { analyzeAccountTakeaway, getProviderCatalogEntry } from "@tenbrains/ai";
import type { AccountTakeawaySnapshot, ProviderId, TakeawayFollow } from "@tenbrains/contracts";
import { XApiV2Client } from "@tenbrains/x-client";

import {
	DEFAULT_MODELS,
	DEFAULT_PROVIDER,
	readAIConfig,
} from "../../../scripts/lib/ai-config.mjs";

interface CliState {
	follows: TakeawayFollow[];
	snapshots: AccountTakeawaySnapshot[];
}

interface RefreshArgs {
	accountUsername?: string;
	all: boolean;
	provider: ProviderId | "";
	model: string;
}

const configuredConfigDir = process.env.TENBRAINS_CONFIG_DIR ?? process.env.RABBITBRAIN_CONFIG_DIR;
const DEFAULT_CONFIG_DIR = configuredConfigDir ? path.resolve(configuredConfigDir) : path.join(homedir(), ".config", "tenbrains");
const TAKEAWAY_STATE_PATH = path.join(DEFAULT_CONFIG_DIR, "takeaway-state.json");
const LEGACY_TAKEAWAY_STATE_PATH = path.join(homedir(), ".config", "rabbitbrain", "takeaway-state.json");
const CLI_USER_ID = "tenbrains-cli";

function printUsage() {
	console.error(
		[
			"Usage:",
			"  npm run xurl:takeaway -- follow <account_username>",
			"  npm run xurl:takeaway -- list",
			"  npm run xurl:takeaway -- refresh <account_username> [--provider PROVIDER] [--model MODEL]",
			"  npm run xurl:takeaway -- refresh --all [--provider PROVIDER] [--model MODEL]",
			"  npm run xurl:takeaway -- show <account_username> [--history]",
			"",
			"Environment:",
			"  OPENAI_API_KEY, GOOGLE_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY",
			"  X_API_KEY, X_API_SECRET, X_BEARER_TOKEN",
		].join("\n"),
	);
}

function sanitizeAccountUsername(input: string): string {
	const sanitized = input.trim().replace(/^@+/, "");
	if (!sanitized) {
		throw new Error("account_username is required");
	}
	return sanitized;
}

function normalizeAccountUsername(input: string): string {
	return sanitizeAccountUsername(input).toLowerCase();
}

function buildFollowId(accountUsername: string): string {
	return `follow_${normalizeAccountUsername(accountUsername)}`;
}

function buildSnapshotId(followId: string, dateKey: string): string {
	return `${followId}_${dateKey}`;
}

function buildDateKey(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

async function readState(): Promise<CliState> {
	try {
		const raw = await readFile(TAKEAWAY_STATE_PATH, "utf8");
		return parseState(raw);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			if (!configuredConfigDir) {
				return readLegacyState();
			}
			return { follows: [], snapshots: [] };
		}
		throw error;
	}
}

async function readLegacyState(): Promise<CliState> {
	try {
		const raw = await readFile(LEGACY_TAKEAWAY_STATE_PATH, "utf8");
		return parseState(raw);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return { follows: [], snapshots: [] };
		}
		throw error;
	}
}

function parseState(raw: string): CliState {
	const parsed = JSON.parse(raw) as Partial<CliState>;
	return {
		follows: Array.isArray(parsed.follows) ? parsed.follows : [],
		snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
	};
}

async function writeState(state: CliState): Promise<void> {
	await mkdir(DEFAULT_CONFIG_DIR, { recursive: true });
	const tempPath = `${TAKEAWAY_STATE_PATH}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
	await rename(tempPath, TAKEAWAY_STATE_PATH);
}

function readProviderApiKey(provider: ProviderId, config: Awaited<ReturnType<typeof readAIConfig>>): string {
	const envName = getProviderCatalogEntry(provider).envVar;
	const envValue = process.env[envName];
	if (envValue && envValue.trim()) {
		return envValue.trim();
	}
	const configValue = config.providers?.[provider]?.apiKey;
	if (typeof configValue === "string" && configValue.trim()) {
		return configValue.trim();
	}
	throw new Error(`${getProviderCatalogEntry(provider).label} API key not found. Run \`npm run xurl:analyze:auth\` first.`);
}

function readProviderModel(provider: ProviderId, config: Awaited<ReturnType<typeof readAIConfig>>, modelArg: string): string {
	const envName = `${provider.toUpperCase()}_MODEL`;
	const envValue = process.env[envName];
	if (modelArg.trim()) {
		return modelArg.trim();
	}
	if (envValue && envValue.trim()) {
		return envValue.trim();
	}
	if (provider === config.defaultProvider && typeof config.defaultModel === "string" && config.defaultModel.trim()) {
		return config.defaultModel.trim();
	}
	return DEFAULT_MODELS[provider];
}

function findFollow(state: CliState, accountUsername: string): TakeawayFollow | null {
	const normalized = normalizeAccountUsername(accountUsername);
	return state.follows.find((follow) => normalizeAccountUsername(follow.accountUsername) === normalized) ?? null;
}

function latestSnapshotForFollow(state: CliState, followId: string): AccountTakeawaySnapshot | null {
	return (
		state.snapshots
			.filter((snapshot) => snapshot.followId === followId)
			.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
	);
}

function parseRefreshArgs(argv: string[]): RefreshArgs {
	let accountUsername = "";
	let all = false;
	let provider: ProviderId | "" = "";
	let model = "";

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--all") {
			all = true;
			continue;
		}
		if (arg === "--provider") {
			const next = argv[index + 1];
			if (!next) {
				throw new Error("Missing value for --provider");
			}
			if (!["openai", "google", "xai", "anthropic"].includes(next)) {
				throw new Error(`Unsupported provider: ${next}`);
			}
			provider = next as ProviderId;
			index += 1;
			continue;
		}
		if (arg === "--model") {
			const next = argv[index + 1];
			if (!next) {
				throw new Error("Missing value for --model");
			}
			model = next;
			index += 1;
			continue;
		}
		if (!accountUsername) {
			accountUsername = arg;
			continue;
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}

	if (!all && !accountUsername) {
		throw new Error("Provide an account username or use --all.");
	}

	return {
		accountUsername: accountUsername || undefined,
		all,
		provider,
		model,
	};
}

function parseShowArgs(argv: string[]): { accountUsername: string; history: boolean } {
	let accountUsername = "";
	let history = false;
	for (const arg of argv) {
		if (arg === "--history") {
			history = true;
			continue;
		}
		if (!accountUsername) {
			accountUsername = arg;
			continue;
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}
	if (!accountUsername) {
		throw new Error("account_username is required");
	}
	return { accountUsername, history };
}

async function handleFollow(accountUsername: string): Promise<void> {
	const state = await readState();
	const sanitized = sanitizeAccountUsername(accountUsername);
	const normalized = normalizeAccountUsername(sanitized);
	const existing = state.follows.find((follow) => normalizeAccountUsername(follow.accountUsername) === normalized);
	const now = Date.now();
	const follow: TakeawayFollow = {
		id: existing?.id ?? buildFollowId(sanitized),
		userId: CLI_USER_ID,
		accountId: existing?.accountId,
		accountUsername: sanitized,
		accountName: existing?.accountName,
		accountAvatarUrl: existing?.accountAvatarUrl,
		lastRefreshDateKey: existing?.lastRefreshDateKey,
		lastRefreshedAt: existing?.lastRefreshedAt,
		lastRefreshStatus: existing?.lastRefreshStatus ?? "idle",
		lastRefreshError: existing?.lastRefreshError,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};
	const follows = existing
		? state.follows.map((item) => (item.id === existing.id ? follow : item))
		: [follow, ...state.follows];
	await writeState({
		...state,
		follows,
	});
	console.log(`Following @${sanitized}.`);
}

async function handleList(): Promise<void> {
	const state = await readState();
	if (state.follows.length === 0) {
		console.log("No followed accounts yet.");
		return;
	}

	for (const follow of state.follows.sort((left, right) => right.updatedAt - left.updatedAt)) {
		const latest = latestSnapshotForFollow(state, follow.id);
		console.log(`@${follow.accountUsername}`);
		console.log(`  status: ${follow.lastRefreshStatus}`);
		console.log(`  refreshed: ${follow.lastRefreshedAt ? new Date(follow.lastRefreshedAt).toLocaleString() : "never"}`);
		console.log(`  latest snapshot: ${latest ? latest.snapshotDateKey : "none"}`);
		if (follow.lastRefreshError) {
			console.log(`  error: ${follow.lastRefreshError}`);
		}
	}
}

async function refreshOne({
	state,
	follow,
	config,
	providerArg,
	modelArg,
}: {
	state: CliState;
	follow: TakeawayFollow;
	config: Awaited<ReturnType<typeof readAIConfig>>;
	providerArg: ProviderId | "";
	modelArg: string;
}): Promise<CliState> {
	const now = Date.now();
	const dateKey = buildDateKey(now);
	const existingSnapshot = latestSnapshotForFollow(state, follow.id);
	if (existingSnapshot?.snapshotDateKey === dateKey) {
		console.log(`@${follow.accountUsername}: already refreshed for ${dateKey}.`);
		return state;
	}

	const provider = (providerArg || config.defaultProvider || DEFAULT_PROVIDER) as ProviderId;
	const model = readProviderModel(provider, config, modelArg);
	const apiKey = readProviderApiKey(provider, config);
	const xClient = new XApiV2Client();

	try {
		const user = await xClient.getUserByUsername(follow.accountUsername);
		const posts = await xClient.getLatestPostsByUsername(user.username, 20);
		const analysis = await analyzeAccountTakeaway({
			provider,
			apiKey,
			model,
			account: {
				id: user.id,
				username: user.username,
				name: user.name,
			},
			posts,
		});

		const updatedFollow: TakeawayFollow = {
			...follow,
			accountId: user.id,
			accountUsername: user.username,
			accountName: user.name,
			accountAvatarUrl: user.avatarUrl,
			lastRefreshDateKey: dateKey,
			lastRefreshedAt: now,
			lastRefreshStatus: "success",
			lastRefreshError: undefined,
			updatedAt: now,
		};
		const snapshot: AccountTakeawaySnapshot = {
			id: buildSnapshotId(follow.id, dateKey),
			userId: CLI_USER_ID,
			followId: follow.id,
			accountId: user.id,
			accountUsername: user.username,
			accountName: user.name,
			accountAvatarUrl: user.avatarUrl,
			provider,
			model,
			summary: analysis.summary,
			takeaways: analysis.takeaways,
			sampleSize: posts.length,
			snapshotDateKey: dateKey,
			posts: posts.map((post) => ({
				id: post.id,
				text: post.text,
				authorId: post.authorId,
				authorUsername: post.authorUsername,
				authorName: post.authorName,
				authorAvatarUrl: post.authorAvatarUrl,
				createdAt: post.createdAt,
				conversationId: post.conversationId,
				inReplyToTweetId: post.inReplyToTweetId,
				media: post.media,
				publicMetrics: post.publicMetrics,
			})),
			createdAt: now,
		};

		console.log(`@${user.username}: refreshed (${provider} / ${model}).`);
		return {
			follows: state.follows.map((item) => (item.id === follow.id ? updatedFollow : item)),
			snapshots: [snapshot, ...state.snapshots.filter((item) => item.id !== snapshot.id)],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown refresh failure.";
		console.log(`@${follow.accountUsername}: refresh failed: ${message}`);
		return {
			...state,
			follows: state.follows.map((item) =>
				item.id === follow.id
					? {
							...item,
							lastRefreshDateKey: dateKey,
							lastRefreshedAt: now,
							lastRefreshStatus: "error",
							lastRefreshError: message,
							updatedAt: now,
						}
					: item,
			),
		};
	}
}

async function handleRefresh(argv: string[]): Promise<void> {
	const args = parseRefreshArgs(argv);
	let state = await readState();
	const config = await readAIConfig();
	const targets = args.all
		? state.follows
		: state.follows.filter((follow) => normalizeAccountUsername(follow.accountUsername) === normalizeAccountUsername(args.accountUsername ?? ""));

	if (targets.length === 0) {
		throw new Error(args.all ? "No followed accounts available." : `No followed account found for @${sanitizeAccountUsername(args.accountUsername ?? "")}.`);
	}

	for (const follow of targets) {
		state = await refreshOne({
			state,
			follow,
			config,
			providerArg: args.provider,
			modelArg: args.model,
		});
	}

	await writeState(state);
}

function renderSnapshot(snapshot: AccountTakeawaySnapshot): string {
	return [
		`# @${snapshot.accountUsername}`,
		"",
		`${snapshot.snapshotDateKey} • ${snapshot.provider} / ${snapshot.model} • ${snapshot.sampleSize} posts`,
		"",
		snapshot.summary,
		"",
		"Takeaways:",
		...snapshot.takeaways.map((takeaway) => `- ${takeaway}`),
		"",
		"Source posts:",
		...snapshot.posts.map((post) => `- https://x.com/${snapshot.accountUsername}/status/${post.id}`),
	].join("\n");
}

async function handleShow(argv: string[]): Promise<void> {
	const args = parseShowArgs(argv);
	const state = await readState();
	const follow = findFollow(state, args.accountUsername);
	if (!follow) {
		throw new Error(`No followed account found for @${sanitizeAccountUsername(args.accountUsername)}.`);
	}

	const snapshots = state.snapshots
		.filter((snapshot) => snapshot.followId === follow.id)
		.sort((left, right) => right.createdAt - left.createdAt);
	if (snapshots.length === 0) {
		console.log(`No takeaway snapshots exist yet for @${follow.accountUsername}.`);
		return;
	}

	if (args.history) {
		for (const snapshot of snapshots) {
			console.log(renderSnapshot(snapshot));
			console.log("");
		}
		return;
	}

	console.log(renderSnapshot(snapshots[0]));
}

async function main() {
	const [command, ...argv] = process.argv.slice(2);
	if (!command || command === "-h" || command === "--help") {
		printUsage();
		return;
	}

	if (command === "follow") {
		if (!argv[0]) {
			throw new Error("account_username is required");
		}
		await handleFollow(argv[0]);
		return;
	}
	if (command === "list") {
		await handleList();
		return;
	}
	if (command === "refresh") {
		await handleRefresh(argv);
		return;
	}
	if (command === "show") {
		await handleShow(argv);
		return;
	}

	throw new Error(`Unsupported command: ${command}`);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	printUsage();
	process.exit(1);
});
