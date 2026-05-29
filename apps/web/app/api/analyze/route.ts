import {
	type AnalyzeTweetResult,
	AnalyzeTweetInputSchema,
	type ProviderId,
	type AnalyzeTweetInput,
} from "@tenbrains/contracts";
import { AiProviderError, analyzeTweetPayload } from "@tenbrains/ai";
import {
	buildThreadAnalysisPayload,
	XApiV2Client,
	type TweetPayload,
	type TweetSourceProvider,
	XProviderError,
} from "@tenbrains/x-client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
	buildResumeSignInRedirect,
	mapAiErrorCodeToResponse,
	mapXErrorCodeToResponse,
} from "../../../src/analyze/analyze-route-helpers.js";
import { getServerAuthSession } from "../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../src/config/startup-env.js";
import {
	getPreferencesForSession,
	getProviderApiKeyForSession,
	persistAnalysisForSession,
} from "../../../src/server/convex-admin.js";
import { reportServerError } from "../../../src/telemetry/report-error.js";

interface SessionUserLike {
	id?: string | null;
	email?: string | null;
	name?: string | null;
}

interface SessionLike {
	user?: SessionUserLike | null;
}

interface AnalyzeRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	createXClient: () => TweetSourceProvider;
	getPreferencesForSession: typeof getPreferencesForSession;
	getProviderApiKeyForSession: typeof getProviderApiKeyForSession;
	analyzeTweetPayload: typeof analyzeTweetPayload;
	persistAnalysisForSession: typeof persistAnalysisForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: AnalyzeRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	createXClient: () => new XApiV2Client(),
	getPreferencesForSession,
	getProviderApiKeyForSession,
	analyzeTweetPayload,
	persistAnalysisForSession,
	reportServerError,
};

function toTweetPreview(tweet: TweetPayload) {
	return {
		id: tweet.id,
		text: tweet.text,
		authorId: tweet.authorId,
		authorUsername: tweet.authorUsername,
		authorName: tweet.authorName,
		authorAvatarUrl: tweet.authorAvatarUrl,
		createdAt: tweet.createdAt,
		conversationId: tweet.conversationId,
		inReplyToTweetId: tweet.inReplyToTweetId,
		media: tweet.media,
		publicMetrics: tweet.publicMetrics,
	};
}

async function readAnalyzeInput(req: Request): Promise<AnalyzeTweetInput> {
	const contentType = req.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return AnalyzeTweetInputSchema.parse(await req.json());
	}

	const formData = await req.formData();
	const tweetUrlOrId = formData.get("tweetUrlOrId");
	const model = formData.get("model");
	return AnalyzeTweetInputSchema.parse({
		tweetUrlOrId: typeof tweetUrlOrId === "string" ? tweetUrlOrId : "",
		model: typeof model === "string" && model.trim().length > 0 ? model : undefined,
	});
}

export async function handleAnalyzePost(
	req: Request,
	dependencies: AnalyzeRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const input = await readAnalyzeInput(req);
		const session = await dependencies.getServerAuthSession();
		const sessionUser = session?.user;
		const userId = session?.user?.id?.trim() ?? "";

		if (!userId || !sessionUser) {
			return NextResponse.json(
				{
					error: {
						code: "AUTH_REQUIRED",
						message: "Sign in with Twitter to analyze tweets.",
					},
					redirectTo: buildResumeSignInRedirect(input.tweetUrlOrId),
				},
				{ status: 401 },
			);
		}

		const client = dependencies.createXClient();
		const preferences = await dependencies.getPreferencesForSession({
			sessionUser: {
				id: userId,
				email: sessionUser.email,
				name: sessionUser.name,
			},
		});
		const provider = (input.provider ?? preferences.defaultProvider) as ProviderId;
		const model = input.model ?? preferences.defaultModel;
		let apiKey: string | null;
		try {
			apiKey = await dependencies.getProviderApiKeyForSession({
				sessionUser: {
					id: userId,
					email: sessionUser.email,
					name: sessionUser.name,
				},
				provider,
			});
		} catch (error) {
			dependencies.reportServerError({
				scope: "api.analyze.provider_key_read_failure",
				error,
				metadata: {
					provider,
				},
			});
			const mapped = mapAiErrorCodeToResponse("CONFIG_ERROR", "Saved API key could not be read. Re-save it and try again.");
			return NextResponse.json(mapped.body, { status: mapped.status });
		}
		if (!apiKey) {
			const mapped = mapAiErrorCodeToResponse("CONFIG_ERROR");
			return NextResponse.json(mapped.body, { status: mapped.status });
		}

		const thread = await client.getThreadByUrlOrId(input.tweetUrlOrId);
		const tweet = thread.tweets.find((item) => item.id === thread.rootTweetId) ?? thread.tweets[0];
		if (!tweet) {
			throw new Error("Thread payload did not include a root tweet.");
		}
		const analysis = await dependencies.analyzeTweetPayload({
			provider,
			apiKey,
			model,
			tweet: buildThreadAnalysisPayload(thread),
		});
		try {
			await dependencies.persistAnalysisForSession({
				sessionUser: {
					id: userId,
					email: sessionUser.email,
					name: sessionUser.name,
				},
				input: {
					...input,
					provider,
					model,
				},
				analysis,
				thread: {
					rootTweetId: thread.rootTweetId,
					tweets: thread.tweets.map(toTweetPreview),
				},
			});
		} catch (error) {
			dependencies.reportServerError({
				scope: "api.analyze.persist_failure",
				error,
				metadata: {
					provider,
					model,
				},
			});
		}

		return NextResponse.json({
			tweet: toTweetPreview(tweet),
			thread:
				thread.tweets.length > 1
					? {
							rootTweetId: thread.rootTweetId,
							tweets: thread.tweets.map(toTweetPreview),
						}
					: undefined,
			analysis: {
				topic: analysis.topic,
				summary: analysis.summary,
				intent: analysis.intent,
				novelConcepts: analysis.novelConcepts,
			},
			provider,
			model,
		});
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.analyze.invalid_input",
				error,
			});
			return NextResponse.json(
				{
					error: {
						code: "INVALID_INPUT",
						message: error.issues[0]?.message ?? "Invalid analyze input.",
					},
				},
				{ status: 400 },
			);
		}

		if (error instanceof XProviderError) {
			dependencies.reportServerError({
				scope: "api.analyze.x_provider_error",
				error,
				metadata: {
					code: error.code,
					retryable: error.retryable,
				},
			});
			const mapped = mapXErrorCodeToResponse(error.code, error.message);
			return NextResponse.json(mapped.body, { status: mapped.status });
		}

		if (error instanceof AiProviderError) {
			dependencies.reportServerError({
				scope: "api.analyze.ai_provider_error",
				error,
				metadata: {
					code: error.code,
					provider: error.provider,
					retryable: error.retryable,
				},
			});
			const mapped = mapAiErrorCodeToResponse(error.code, error.message);
			return NextResponse.json(mapped.body, { status: mapped.status });
		}

		dependencies.reportServerError({
			scope: "api.analyze.unexpected_failure",
			error,
		});

		return NextResponse.json(
			{
				error: {
					code: "ANALYSIS_FAILED",
					message: error instanceof Error ? error.message : "Unexpected analysis failure.",
				},
			},
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	return handleAnalyzePost(req);
}
