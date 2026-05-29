#!/usr/bin/env node

import { execFile } from "node:child_process";
import process from "node:process";
import readline from "node:readline/promises";
import { promisify } from "node:util";
import { PROVIDER_OPTIONS, analyzeTweetPayload, getProviderCatalogEntry } from "@tenbrains/ai";
import {
	buildFeynmanTrack,
	type ConceptRating,
	renderAnalysisMarkdown,
	renderConceptAssessmentMarkdown,
	renderLearningTrackMarkdown,
	type TweetLearningAnalysis,
	prioritizeConcepts,
} from "tenbrains";
import type { ProviderId } from "@tenbrains/contracts";
import {
	buildThreadAnalysisPayload,
	type ThreadPayload,
	type ThreadTweetPayload,
} from "@tenbrains/x-client";
import { buildAnalyzeCliJsonResult, renderThreadMarkdown } from "./output.js";
import {
	DEFAULT_MODELS,
	DEFAULT_PROVIDER,
	RECOMMENDED_MODELS,
	readAIConfig,
} from "../../../scripts/lib/ai-config.mjs";

const execFileAsync = promisify(execFile);

interface CliArgs {
	tweetInput: string;
	provider: ProviderId | "";
	model: string;
	chooseProvider: boolean;
	chooseModel: boolean;
	learn: boolean;
	json: boolean;
}

function printUsage() {
	console.error(
		[
			"Usage:",
			"  npm run xurl:analyze -- <tweet_url_or_id> [--provider PROVIDER] [--model MODEL] [--choose-provider] [--choose-model] [--learn] [--json]",
			"",
			"Environment:",
			"  OPENAI_API_KEY, GOOGLE_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY",
			"  OPENAI_MODEL, GOOGLE_MODEL, XAI_MODEL, ANTHROPIC_MODEL",
			"",
			"Config fallback:",
			"  npm run xurl:analyze:auth",
			"",
			"Learning mode:",
			"  --learn requires an interactive terminal (TTY).",
		].join("\n"),
	);
}

function parseArgs(argv: string[]): CliArgs {
	let tweetInput = "";
	let provider: ProviderId | "" = "";
	let model = "";
	let chooseProvider = false;
	let chooseModel = false;
	let learn = false;
	let json = false;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--provider") {
			const next = argv[i + 1];
			if (!next) {
				throw new Error("Missing value for --provider");
			}
			if (!PROVIDER_OPTIONS.some((item) => item.id === next)) {
				throw new Error(`Unsupported provider: ${next}`);
			}
			provider = next as ProviderId;
			i += 1;
			continue;
		}
		if (arg === "--model") {
			const next = argv[i + 1];
			if (!next) {
				throw new Error("Missing value for --model");
			}
			model = next;
			i += 1;
			continue;
		}
		if (arg === "--choose-provider") {
			chooseProvider = true;
			continue;
		}
		if (arg === "--choose-model") {
			chooseModel = true;
			continue;
		}
		if (arg === "--learn") {
			learn = true;
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			printUsage();
			process.exit(0);
		}
		if (!tweetInput) {
			tweetInput = arg;
			continue;
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}

	if (!tweetInput) {
		throw new Error("Missing tweet URL or ID");
	}

	return { tweetInput, provider, model, chooseProvider, chooseModel, learn, json };
}

function ensureLearnModeIsInteractive(learn: boolean, json: boolean): void {
	if (learn && json) {
		throw new Error("`--json` cannot be combined with `--learn`.");
	}
	if (!learn) {
		return;
	}
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("`--learn` requires an interactive terminal (TTY). Run this command directly in a terminal.");
	}
}

async function chooseProviderInteractively(defaultProvider: ProviderId): Promise<ProviderId> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		console.log("\nSelect provider for this analysis:");
		PROVIDER_OPTIONS.forEach((provider, index) => {
			const marker = provider.id === defaultProvider ? " (default)" : "";
			console.log(`  ${index + 1}. ${provider.label}${marker}`);
		});
		const answer = (await rl.question(`Choose [1-${PROVIDER_OPTIONS.length}] (default: ${defaultProvider}): `)).trim();
		if (!answer) {
			return defaultProvider;
		}
		const selected = Number.parseInt(answer, 10);
		if (Number.isNaN(selected) || selected < 1 || selected > PROVIDER_OPTIONS.length) {
			throw new Error(`Invalid provider selection: ${answer}`);
		}
		return PROVIDER_OPTIONS[selected - 1]?.id ?? defaultProvider;
	} finally {
		rl.close();
	}
}

async function chooseModelInteractively(defaultProvider: ProviderId, defaultModel: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const models = RECOMMENDED_MODELS[defaultProvider];
		console.log(`\nSelect model for ${getProviderCatalogEntry(defaultProvider).label}:`);
		models.forEach((name, index) => {
			const marker = name === defaultModel ? " (default)" : "";
			console.log(`  ${index + 1}. ${name}${marker}`);
		});

		const answer = (await rl.question(`Choose [1-${models.length}] (default: ${defaultModel}): `)).trim();
		if (!answer) {
			return defaultModel;
		}

		const selected = Number.parseInt(answer, 10);
		if (Number.isNaN(selected) || selected < 1 || selected > models.length) {
			throw new Error(`Invalid model selection: ${answer}`);
		}
		return models[selected - 1] ?? defaultModel;
	} finally {
		rl.close();
	}
}

function pickPrimaryTweet(payload: unknown): Record<string, unknown> | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const maybeData = (payload as { data?: unknown }).data;
	if (Array.isArray(maybeData) && maybeData.length > 0) {
		const candidate = maybeData[0];
		return typeof candidate === "object" && candidate !== null ? (candidate as Record<string, unknown>) : null;
	}
	if (typeof maybeData === "object" && maybeData !== null) {
		return maybeData as Record<string, unknown>;
	}
	return null;
}

function pickTweetArray(payload: unknown): Record<string, unknown>[] {
	if (typeof payload !== "object" || payload === null) {
		return [];
	}
	const maybeData = (payload as { data?: unknown }).data;
	if (!Array.isArray(maybeData)) {
		return [];
	}
	return maybeData.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function findIncludedUser(payload: unknown, authorId: string | undefined): Record<string, unknown> | null {
	if (!authorId || typeof payload !== "object" || payload === null) {
		return null;
	}
	const includes = (payload as { includes?: { users?: unknown[] } }).includes;
	const users = includes?.users;
	if (!Array.isArray(users)) {
		return null;
	}
	for (const user of users) {
		if (typeof user === "object" && user !== null && (user as { id?: unknown }).id === authorId) {
			return user as Record<string, unknown>;
		}
	}
	return null;
}

function readInReplyToTweetId(primaryTweet: Record<string, unknown>): string | undefined {
	const referencedTweets = Array.isArray(primaryTweet.referenced_tweets) ? primaryTweet.referenced_tweets : [];
	for (const entry of referencedTweets) {
		if (typeof entry !== "object" || entry === null) {
			continue;
		}
		if ((entry as { type?: unknown }).type === "replied_to") {
			const id = (entry as { id?: unknown }).id;
			return typeof id === "string" ? id : undefined;
		}
	}
	return undefined;
}

function toThreadTweetPayload(payload: unknown, primaryTweet: Record<string, unknown>): ThreadTweetPayload {
	const authorId = typeof primaryTweet.author_id === "string" ? primaryTweet.author_id : undefined;
	const includedUser = findIncludedUser(payload, authorId);
	const text = typeof primaryTweet.text === "string" ? primaryTweet.text : "";
	const id = typeof primaryTweet.id === "string" ? primaryTweet.id : "";

	if (!id || !text.trim()) {
		throw new Error("xurl returned a tweet payload without id/text.");
	}

	return {
		id,
		text,
		authorId,
		authorUsername: typeof includedUser?.username === "string" ? includedUser.username : undefined,
		authorName: typeof includedUser?.name === "string" ? includedUser.name : undefined,
		authorAvatarUrl: typeof includedUser?.profile_image_url === "string" ? includedUser.profile_image_url : undefined,
		createdAt: typeof primaryTweet.created_at === "string" ? primaryTweet.created_at : undefined,
		conversationId: typeof primaryTweet.conversation_id === "string" ? primaryTweet.conversation_id : undefined,
		inReplyToTweetId: readInReplyToTweetId(primaryTweet),
		raw: payload,
	};
}

function compareTweetsByCreatedAt(left: ThreadTweetPayload, right: ThreadTweetPayload): number {
	const leftTimestamp = left.createdAt ? Date.parse(left.createdAt) : Number.POSITIVE_INFINITY;
	const rightTimestamp = right.createdAt ? Date.parse(right.createdAt) : Number.POSITIVE_INFINITY;
	if (leftTimestamp !== rightTimestamp) {
		return leftTimestamp - rightTimestamp;
	}
	return left.id.localeCompare(right.id);
}

async function execXurlJson(args: string[]): Promise<unknown> {
	try {
		const { stdout } = await execFileAsync("xurl", args, { maxBuffer: 10 * 1024 * 1024 });
		return JSON.parse(stdout);
	} catch (error) {
		const err = error as { stderr?: unknown; stdout?: unknown };
		const stderr = typeof err.stderr === "string" ? err.stderr : "";
		const stdout = typeof err.stdout === "string" ? err.stdout : "";
		throw new Error(`Failed to read from xurl.\n${stderr || stdout || String(error)}`.trim());
	}
}

async function readThreadWithXurl(tweetInput: string): Promise<ThreadPayload> {
	const rootPayload = await execXurlJson(["read", tweetInput]);
	const primaryTweet = pickPrimaryTweet(rootPayload);
	if (!primaryTweet) {
		throw new Error("xurl did not return a tweet payload.");
	}
	const rootTweet = toThreadTweetPayload(rootPayload, primaryTweet);
	const conversationId = rootTweet.conversationId;
	const authorUsername = rootTweet.authorUsername;
	if (!conversationId || !authorUsername) {
		return {
			rootTweetId: rootTweet.id,
			tweets: [rootTweet],
		};
	}

	const threadTweets: ThreadTweetPayload[] = [rootTweet];
	const seenIds = new Set<string>([rootTweet.id]);
	let nextToken: string | undefined;
	do {
		const params = new URLSearchParams({
			query: `conversation_id:${conversationId} from:${authorUsername}`,
			max_results: "100",
			expansions: "author_id,attachments.media_keys",
			"tweet.fields": "author_id,attachments,public_metrics,created_at,conversation_id,referenced_tweets",
			"user.fields": "id,username,name,profile_image_url",
			"media.fields": "type,url,preview_image_url,alt_text,width,height",
		});
		if (nextToken) {
			params.set("next_token", nextToken);
		}
		const payload = await execXurlJson([`/2/tweets/search/recent?${params.toString()}`]);
		for (const candidate of pickTweetArray(payload)) {
			const tweet = toThreadTweetPayload(payload, candidate);
			if (seenIds.has(tweet.id)) {
				continue;
			}
			seenIds.add(tweet.id);
			threadTweets.push(tweet);
		}
		nextToken =
			typeof payload === "object" &&
			payload !== null &&
			typeof (payload as { meta?: { next_token?: unknown } }).meta?.next_token === "string"
				? ((payload as { meta: { next_token: string } }).meta.next_token)
				: undefined;
	} while (nextToken);

	threadTweets.sort(compareTweetsByCreatedAt);
	return {
		rootTweetId: rootTweet.id,
		tweets: threadTweets,
	};
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

async function readRating(rl: readline.Interface, prompt: string, fieldLabel: string): Promise<1 | 2 | 3 | 4 | 5> {
	for (;;) {
		const raw = (await rl.question(prompt)).trim();
		const parsed = Number.parseInt(raw, 10);
		if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) {
			return parsed as 1 | 2 | 3 | 4 | 5;
		}
		console.log(`Invalid ${fieldLabel}. Enter an integer between 1 and 5.`);
	}
}

async function collectConceptRatings(analysis: TweetLearningAnalysis): Promise<ConceptRating[]> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		console.log("\nRate each concept to personalize your 7-day Feynman track.");
		console.log("Familiarity: 1 = never heard, 5 = can teach clearly.");
		console.log("Interest: 1 = low priority, 5 = high priority.");

		const ratings: ConceptRating[] = [];
		for (let i = 0; i < analysis.novelConcepts.length; i += 1) {
			const concept = analysis.novelConcepts[i];
			if (!concept) {
				continue;
			}
			console.log(`\nConcept ${i + 1}/5: ${concept.name}`);
			console.log(`Why it matters: ${concept.whyItMattersInTweet}`);
			const familiarity = await readRating(rl, "  Familiarity (1-5): ", "familiarity");
			const interest = await readRating(rl, "  Interest (1-5): ", "interest");
			ratings.push({ concept, familiarity, interest });
		}
		return ratings;
	} finally {
		rl.close();
	}
}

async function main() {
	const { tweetInput, provider: providerArg, model: modelArg, chooseProvider, chooseModel, learn, json } = parseArgs(
		process.argv.slice(2),
	);
	ensureLearnModeIsInteractive(learn, json);

	const config = await readAIConfig();
	let provider = (providerArg || config.defaultProvider || DEFAULT_PROVIDER) as ProviderId;
	if (chooseProvider) {
		provider = await chooseProviderInteractively(provider);
	}

	let model = readProviderModel(provider, config, modelArg);
	if (chooseModel) {
		model = await chooseModelInteractively(provider, model);
	}

	const apiKey = readProviderApiKey(provider, config);
	const thread = await readThreadWithXurl(tweetInput);
	const rootTweet = thread.tweets.find((tweet) => tweet.id === thread.rootTweetId) ?? thread.tweets[0];
	if (!rootTweet) {
		throw new Error("Thread payload did not include a root post.");
	}
	const analysis = await analyzeTweetPayload({ provider, apiKey, model, tweet: buildThreadAnalysisPayload(thread) });

	if (json) {
		console.log(
			JSON.stringify(
				buildAnalyzeCliJsonResult({
					tweet: rootTweet,
					thread,
					analysis,
					provider,
					model,
				}),
				null,
				2,
			),
		);
		return;
	}

	console.log(renderThreadMarkdown(thread));
	console.log("");
	console.log(`# Analysis (${getProviderCatalogEntry(provider).label} / ${model})`);
	console.log("");
	console.log(renderAnalysisMarkdown(analysis));

	if (!learn) {
		return;
	}

	const ratings = await collectConceptRatings(analysis);
	const prioritized = prioritizeConcepts(ratings);
	const track = buildFeynmanTrack(prioritized);

	console.log("");
	console.log(renderConceptAssessmentMarkdown(prioritized));
	console.log("");
	console.log(renderLearningTrackMarkdown(track));
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	printUsage();
	process.exit(1);
});
