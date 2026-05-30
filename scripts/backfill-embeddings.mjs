#!/usr/bin/env node
/**
 * Backfill semantic embeddings for existing Tenbrains sources.
 *
 * Manual run:
 *   NEXT_PUBLIC_CONVEX_URL=... CONVEX_DEPLOY_KEY=... USER_SECRETS_ENCRYPTION_KEY=... \
 *     node scripts/backfill-embeddings.mjs --dry-run --source=all
 *
 * The script is intentionally sequential. It batches source rows for the
 * embedding API, but keeps only one provider request in flight so operator-run
 * backfills stay predictable.
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { EMBED_BATCH_SIZE, embedTexts } from "@tenbrains/ai/src/lib/embed.js";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
	buildAnalysisEmbeddingText,
	buildTakeawayEmbeddingText,
	computeEmbeddingContentHash,
} from "../apps/web/src/embeddings/source-content.js";
import { decryptSecret } from "../apps/web/src/server/secret-crypto.js";

const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_USER_PAGE_SIZE = 100;
const MAX_RETRIES = 5;
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const SOURCE_TYPES = ["bookmark", "analysis", "takeaway"];
const SUMMARY_PREFIX_BY_SOURCE = {
	bookmark: "bookmarks",
	analysis: "analyses",
	takeaway: "takeawaySnapshots",
};

const listBackfillUsersRef = makeFunctionReference("embeddings:listBackfillUsers");
const getBackfillOpenAiCredentialForUserRef = makeFunctionReference("embeddings:getBackfillOpenAiCredentialForUser");
const listBackfillBookmarksForUserRef = makeFunctionReference("embeddings:listBackfillBookmarksForUser");
const listBackfillAnalysesForUserRef = makeFunctionReference("embeddings:listBackfillAnalysesForUser");
const listBackfillTakeawaySnapshotsForUserRef = makeFunctionReference(
	"embeddings:listBackfillTakeawaySnapshotsForUser",
);
const getBackfillEmbeddingContentHashRef = makeFunctionReference("embeddings:getBackfillEmbeddingContentHash");
const backfillUpsertEmbeddingRef = makeFunctionReference("embeddings:backfillUpsertEmbedding");

function readRequiredEnv(name, env) {
	const value = env[name];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value.trim();
}

function readConvexAdminToken(env) {
	const deployKey = env.CONVEX_DEPLOY_KEY;
	if (typeof deployKey === "string" && deployKey.trim().length > 0) {
		return deployKey.trim();
	}
	const adminKey = env.CONVEX_ADMIN_KEY;
	if (typeof adminKey === "string" && adminKey.trim().length > 0) {
		return adminKey.trim();
	}
	throw new Error("Missing required environment variable: CONVEX_DEPLOY_KEY or CONVEX_ADMIN_KEY");
}

function readPlatformOpenAiKey(env) {
	const value = env.PLATFORM_OPENAI_API_KEY;
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseNonNegativeInteger(value, flagName) {
	if (!/^\d+$/.test(value)) {
		throw new Error(`${flagName} must be a non-negative integer.`);
	}
	return Number(value);
}

function parsePositiveInteger(value, flagName) {
	const parsed = parseNonNegativeInteger(value, flagName);
	if (parsed < 1) {
		throw new Error(`${flagName} must be at least 1.`);
	}
	return parsed;
}

function normalizeSource(source) {
	if (source === "all") {
		return source;
	}
	if (SOURCE_TYPES.includes(source)) {
		return source;
	}
	throw new Error("--source must be one of bookmark, analysis, takeaway, or all.");
}

export function parseBackfillArgs(argv) {
	const parsed = {
		dryRun: false,
		source: "all",
		userId: null,
		limit: null,
		batchSize: DEFAULT_BATCH_SIZE,
	};

	for (const arg of argv) {
		if (arg === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (arg.startsWith("--source=")) {
			parsed.source = normalizeSource(arg.slice("--source=".length));
			continue;
		}
		if (arg.startsWith("--user=")) {
			const userId = arg.slice("--user=".length).trim();
			if (!userId) {
				throw new Error("--user requires a user id.");
			}
			parsed.userId = userId;
			continue;
		}
		if (arg.startsWith("--limit=")) {
			parsed.limit = parseNonNegativeInteger(arg.slice("--limit=".length), "--limit");
			continue;
		}
		if (arg.startsWith("--batch-size=")) {
			const batchSize = parsePositiveInteger(arg.slice("--batch-size=".length), "--batch-size");
			parsed.batchSize = Math.min(batchSize, EMBED_BATCH_SIZE);
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return parsed;
}

function selectedSources(source) {
	return source === "all" ? SOURCE_TYPES : [source];
}

function createSummary(options) {
	return {
		dryRun: options.dryRun,
		source: options.source,
		batchSize: options.batchSize,
		limit: options.limit,
		usersProcessed: 0,
		usersSkipped: 0,
		bookmarksConsidered: 0,
		bookmarksPlanned: 0,
		bookmarksEmbedded: 0,
		bookmarksSkipped: 0,
		bookmarksFailed: 0,
		analysesConsidered: 0,
		analysesPlanned: 0,
		analysesEmbedded: 0,
		analysesSkipped: 0,
		analysesFailed: 0,
		takeawaySnapshotsConsidered: 0,
		takeawaySnapshotsPlanned: 0,
		takeawaySnapshotsEmbedded: 0,
		takeawaySnapshotsSkipped: 0,
		takeawaySnapshotsFailed: 0,
		approxTokensPlanned: 0,
		approxTokensUsed: 0,
		retryCount: 0,
		elapsedSeconds: 0,
		failedRows: [],
	};
}

function incrementSource(summary, sourceType, metric, amount = 1) {
	const key = `${SUMMARY_PREFIX_BY_SOURCE[sourceType]}${metric}`;
	summary[key] += amount;
}

function totalRowsConsidered(summary) {
	return summary.bookmarksConsidered + summary.analysesConsidered + summary.takeawaySnapshotsConsidered;
}

function hasReachedLimit(summary, options) {
	return options.limit !== null && totalRowsConsidered(summary) >= options.limit;
}

function estimateTokens(text) {
	return Math.ceil(text.length / 4);
}

function formatError(error) {
	return error instanceof Error ? error.message : String(error);
}

function isRetryableEmbeddingError(error) {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	if ("code" in error && error.code === "RATE_LIMITED") {
		return true;
	}
	if ("retryable" in error && error.retryable === true) {
		return true;
	}
	if ("status" in error && typeof error.status === "number" && error.status >= 500) {
		return true;
	}
	return false;
}

async function embedTextsWithRetry({ apiKey, texts, deps }) {
	let retries = 0;
	for (;;) {
		try {
			return {
				result: await deps.embedTexts({ texts, apiKey }),
				retries,
			};
		} catch (error) {
			if (!isRetryableEmbeddingError(error) || retries >= MAX_RETRIES) {
				if (typeof error === "object" && error !== null) {
					error.retryCount = retries;
				}
				throw error;
			}
			await deps.sleep(BACKOFF_DELAYS_MS[retries] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]);
			retries += 1;
		}
	}
}

async function resolveEmbeddingKeyForUser({ user, env, deps }) {
	const credential = await deps.getEncryptedOpenAiCredentialForUser({ userId: user._id });
	if (credential?.encryptedApiKey) {
		try {
			const userKey = deps.decryptSecret(credential.encryptedApiKey, env).trim();
			if (userKey) {
				return userKey;
			}
		} catch (error) {
			deps.log(`stored OpenAI key could not be decrypted for user ${user._id}: ${formatError(error)}`);
		}
	}
	return readPlatformOpenAiKey(env);
}

function toSourcePayload(sourceType, row) {
	if (sourceType === "bookmark") {
		return {
			sourceId: row.tweetId,
			text: row.tweetText,
		};
	}
	if (sourceType === "analysis") {
		return {
			sourceId: String(row._id),
			text: buildAnalysisEmbeddingText(row),
		};
	}
	return {
		sourceId: String(row._id),
		text: buildTakeawayEmbeddingText(row),
	};
}

async function listSourcePage({ deps, sourceType, userId, cursor, limit }) {
	if (sourceType === "bookmark") {
		return await deps.listBackfillBookmarksForUser({ userId, cursor, limit });
	}
	if (sourceType === "analysis") {
		return await deps.listBackfillAnalysesForUser({ userId, cursor, limit });
	}
	return await deps.listBackfillTakeawaySnapshotsForUser({ userId, cursor, limit });
}

function markRowFailed({ summary, sourceType, row, error }) {
	incrementSource(summary, sourceType, "Failed");
	summary.failedRows.push({
		userId: row.userId,
		sourceType,
		sourceId: row.sourceId,
		error: formatError(error),
	});
}

async function flushPendingRows({ rows, apiKey, deps, summary }) {
	if (rows.length === 0) {
		return;
	}

	try {
		const texts = rows.map((row) => row.text);
		const { result, retries } = await embedTextsWithRetry({ apiKey, texts, deps });
		summary.retryCount += retries;
		if (!Array.isArray(result.vectors) || result.vectors.length !== rows.length) {
			throw new Error("Embedding response vector count did not match the source row count.");
		}
		summary.approxTokensUsed += rows.reduce((total, row) => total + estimateTokens(row.text), 0);
		for (const [index, row] of rows.entries()) {
			const vector = result.vectors[index];
			try {
				await deps.upsertEmbedding({
					userId: row.userId,
					sourceType: row.sourceType,
					sourceId: row.sourceId,
					text: row.text,
					contentHash: row.contentHash,
					model: result.model,
					embedding: vector,
				});
				incrementSource(summary, row.sourceType, "Embedded");
			} catch (error) {
				markRowFailed({ summary, sourceType: row.sourceType, row, error });
			}
		}
	} catch (error) {
		if (typeof error === "object" && error !== null && typeof error.retryCount === "number") {
			summary.retryCount += error.retryCount;
		}
		for (const row of rows) {
			markRowFailed({ summary, sourceType: row.sourceType, row, error });
		}
	}
}

async function processSourceForUser({ deps, env, options, summary, user, sourceType, apiKey }) {
	let cursor = null;
	let pendingRows = [];

	while (!hasReachedLimit(summary, options)) {
		const page = await listSourcePage({
			deps,
			sourceType,
			userId: user._id,
			cursor,
			limit: DEFAULT_PAGE_SIZE,
		});

		for (const item of page.items) {
			if (hasReachedLimit(summary, options)) {
				break;
			}
			incrementSource(summary, sourceType, "Considered");
			const payload = toSourcePayload(sourceType, item);
			const contentHash = computeEmbeddingContentHash(payload.text);
			const existingHash = await deps.getExistingEmbeddingContentHash({
				userId: user._id,
				sourceType,
				sourceId: payload.sourceId,
			});
			if (existingHash === contentHash) {
				incrementSource(summary, sourceType, "Skipped");
				continue;
			}

			summary.approxTokensPlanned += estimateTokens(payload.text);
			incrementSource(summary, sourceType, "Planned");
			if (options.dryRun) {
				continue;
			}

			pendingRows.push({
				userId: user._id,
				sourceType,
				sourceId: payload.sourceId,
				text: payload.text,
				contentHash,
			});
			if (pendingRows.length >= options.batchSize) {
				await flushPendingRows({ rows: pendingRows, apiKey, deps, env, summary });
				pendingRows = [];
			}
		}

		if (!page.nextCursor || hasReachedLimit(summary, options)) {
			break;
		}
		cursor = page.nextCursor;
	}

	await flushPendingRows({ rows: pendingRows, apiKey, deps, env, summary });
}

function normalizeRunOptions(options) {
	return {
		dryRun: Boolean(options.dryRun),
		source: normalizeSource(options.source ?? "all"),
		userId: options.userId ?? null,
		limit: options.limit ?? null,
		batchSize: Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, EMBED_BATCH_SIZE),
	};
}

export async function runBackfill({ options, deps, env = process.env }) {
	const normalizedOptions = normalizeRunOptions(options ?? {});
	const summary = createSummary(normalizedOptions);
	const started = deps.now();
	let cursor = null;

	while (!hasReachedLimit(summary, normalizedOptions)) {
		const page = await deps.listBackfillUsers({
			cursor,
			limit: DEFAULT_USER_PAGE_SIZE,
		});

		for (const user of page.items) {
			if (hasReachedLimit(summary, normalizedOptions)) {
				break;
			}
			if (normalizedOptions.userId && String(user._id) !== normalizedOptions.userId) {
				continue;
			}

			const apiKey = await resolveEmbeddingKeyForUser({ user, env, deps });
			if (!apiKey) {
				summary.usersSkipped += 1;
				deps.log(`skipping user ${user._id}: no embedding key`);
				continue;
			}

			summary.usersProcessed += 1;
			for (const sourceType of selectedSources(normalizedOptions.source)) {
				if (hasReachedLimit(summary, normalizedOptions)) {
					break;
				}
				await processSourceForUser({
					deps,
					env,
					options: normalizedOptions,
					summary,
					user,
					sourceType,
					apiKey,
				});
			}
		}

		if (!page.nextCursor || normalizedOptions.userId || hasReachedLimit(summary, normalizedOptions)) {
			break;
		}
		cursor = page.nextCursor;
	}

	summary.elapsedSeconds = Number(((deps.now() - started) / 1000).toFixed(3));
	return summary;
}

export function createConvexBackfillClient({ env = process.env } = {}) {
	const convexUrl = readRequiredEnv("NEXT_PUBLIC_CONVEX_URL", env);
	const adminToken = readConvexAdminToken(env);
	const client = new ConvexHttpClient(convexUrl);
	client.setAdminAuth(adminToken);
	return client;
}

export function createConvexBackfillDeps({ client, env = process.env, log = console.log } = {}) {
	return {
		listBackfillUsers: async (args) => await client.query(listBackfillUsersRef, args),
		getEncryptedOpenAiCredentialForUser: async (args) =>
			await client.query(getBackfillOpenAiCredentialForUserRef, args),
		listBackfillBookmarksForUser: async (args) => await client.query(listBackfillBookmarksForUserRef, args),
		listBackfillAnalysesForUser: async (args) => await client.query(listBackfillAnalysesForUserRef, args),
		listBackfillTakeawaySnapshotsForUser: async (args) =>
			await client.query(listBackfillTakeawaySnapshotsForUserRef, args),
		getExistingEmbeddingContentHash: async (args) => await client.query(getBackfillEmbeddingContentHashRef, args),
		upsertEmbedding: async (args) => await client.mutation(backfillUpsertEmbeddingRef, args),
		embedTexts,
		decryptSecret,
		sleep: async (delayMs) => {
			await new Promise((resolve) => {
				setTimeout(resolve, delayMs);
			});
		},
		log,
		now: () => performance.now(),
		env,
	};
}

export function printBackfillSummary(summary, { log = console.log, error = console.error } = {}) {
	const { failedRows, ...printableSummary } = summary;
	log(JSON.stringify(printableSummary, null, 2));
	if (failedRows.length > 0) {
		error("Failed rows:");
		for (const row of failedRows) {
			error(`- user=${row.userId} source=${row.sourceType} sourceId=${row.sourceId}: ${row.error}`);
		}
	}
}

export async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
	const options = parseBackfillArgs(argv);
	const client = createConvexBackfillClient({ env });
	const deps = createConvexBackfillDeps({ client, env });
	const summary = await runBackfill({ options, deps, env });
	printBackfillSummary(summary);
	return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
