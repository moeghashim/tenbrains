import { DismissSuggestionInputSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../../src/config/startup-env.js";
import { recordSuggestionFeedbackForSession } from "../../../../../src/server/convex-admin.js";
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

interface DismissSuggestionsRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	recordSuggestionFeedbackForSession: typeof recordSuggestionFeedbackForSession;
	buildSuggestionsForSession: typeof buildSuggestionsForSession;
	listRenderableSuggestionsForSession: typeof listRenderableSuggestionsForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: DismissSuggestionsRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	recordSuggestionFeedbackForSession,
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

export async function handleSuggestionsDismissPost(
	req: Request,
	_context?: unknown,
	dependencies: DismissSuggestionsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
		}

		const input = DismissSuggestionInputSchema.parse(await req.json());
		await dependencies.recordSuggestionFeedbackForSession({
			sessionUser,
			suggestionId: input.suggestionId,
			status: "dismissed",
		});

		try {
			return NextResponse.json(await dependencies.buildSuggestionsForSession({ sessionUser }));
		} catch (error) {
			dependencies.reportServerError({
				scope: "api.suggestions.dismiss_refresh_failure",
				error,
			});
			return NextResponse.json(await dependencies.listRenderableSuggestionsForSession({ sessionUser }));
		}
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid dismiss suggestion input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.suggestions.dismiss_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to dismiss suggestion." } },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request, context?: unknown) {
	return handleSuggestionsDismissPost(request, context);
}
