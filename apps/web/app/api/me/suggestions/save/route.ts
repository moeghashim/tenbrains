import { SaveSuggestionInputSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isBookmarkAlreadyExistsError } from "../../../../../src/bookmarks/errors.js";
import { getServerAuthSession } from "../../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../../src/config/startup-env.js";
import {
	getSuggestionByIdForSession,
	recordSuggestionFeedbackForSession,
	saveBookmarkForSession,
} from "../../../../../src/server/convex-admin.js";
import { embedBookmarkSource } from "../../../../../src/embeddings/embed-source.js";
import {
	buildSuggestionsForSession,
	listRenderableSuggestionsForSession,
} from "../../../../../src/suggestions/build-suggestions.js";
import { reportServerError } from "../../../../../src/telemetry/report-error.js";

interface SessionUserLike {
	id?: string | null;
	email?: string | null;
	name?: string | null;
}

interface SessionLike {
	user?: SessionUserLike | null;
}

interface AuthenticatedSessionUser {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface SaveSuggestionsRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	getSuggestionByIdForSession: typeof getSuggestionByIdForSession;
	saveBookmarkForSession: typeof saveBookmarkForSession;
	recordSuggestionFeedbackForSession: typeof recordSuggestionFeedbackForSession;
	embedBookmarkSource?: typeof embedBookmarkSource;
	buildSuggestionsForSession: typeof buildSuggestionsForSession;
	listRenderableSuggestionsForSession: typeof listRenderableSuggestionsForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: SaveSuggestionsRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	getSuggestionByIdForSession,
	saveBookmarkForSession,
	recordSuggestionFeedbackForSession,
	embedBookmarkSource,
	buildSuggestionsForSession,
	listRenderableSuggestionsForSession,
	reportServerError,
};

function readSessionUser(session: SessionLike | null): AuthenticatedSessionUser | null {
	const user = session?.user;
	const id = user?.id?.trim() ?? "";
	if (!user || !id) {
		return null;
	}
	return {
		id,
		email: user.email,
		name: user.name,
	};
}

export async function handleSuggestionsSavePost(
	req: Request,
	_context?: unknown,
	dependencies: SaveSuggestionsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
		}

		const input = SaveSuggestionInputSchema.parse(await req.json());
		const suggestion = await dependencies.getSuggestionByIdForSession({
			sessionUser,
			suggestionId: input.suggestionId,
		});
		if (!suggestion) {
			return NextResponse.json({ error: { message: "Suggestion not found" } }, { status: 404 });
		}

		try {
			const savedBookmark = await dependencies.saveBookmarkForSession({
				sessionUser,
				input: {
					tweetId: suggestion.tweetId,
					tweetText: suggestion.tweetText,
					tweetUrlOrId: suggestion.tweetUrlOrId,
					authorUsername: suggestion.authorUsername,
					authorName: suggestion.authorName,
					authorAvatarUrl: suggestion.authorAvatarUrl,
					tags: suggestion.suggestedTags.length > 0 ? suggestion.suggestedTags : ["Inbox"],
					source: "suggestion",
					systemSuggestedTags: suggestion.suggestedTags.length > 0 ? suggestion.suggestedTags : ["Inbox"],
				},
			});
			void dependencies.embedBookmarkSource?.({
				sessionUser,
				bookmark: savedBookmark,
			});
		} catch (error) {
			if (!isBookmarkAlreadyExistsError(error)) {
				throw error;
			}
		}

		await dependencies.recordSuggestionFeedbackForSession({
			sessionUser,
			suggestionId: input.suggestionId,
			status: "saved",
		});

		try {
			return NextResponse.json({
				suggestion,
				...(await dependencies.buildSuggestionsForSession({ sessionUser })),
			});
		} catch (error) {
			dependencies.reportServerError({
				scope: "api.suggestions.save_refresh_failure",
				error,
			});
			return NextResponse.json({
				suggestion,
				...(await dependencies.listRenderableSuggestionsForSession({ sessionUser })),
			});
		}
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid save suggestion input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.suggestions.save_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to save suggestion." } },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request, context?: unknown) {
	return handleSuggestionsSavePost(request, context);
}
