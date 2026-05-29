import { BookmarkTagSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../../src/config/startup-env.js";
import { listFollowSuggestionsForSession } from "../../../../../src/server/convex-admin.js";
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

interface FollowSuggestionsRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	listFollowSuggestionsForSession: typeof listFollowSuggestionsForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: FollowSuggestionsRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	listFollowSuggestionsForSession,
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

export async function handleFollowSuggestionsGet(
	req: Request,
	_context?: unknown,
	dependencies: FollowSuggestionsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
		}

		const url = new URL(req.url);
		const subjectTag = BookmarkTagSchema.parse(url.searchParams.get("subjectTag") ?? "");
		const response = await dependencies.listFollowSuggestionsForSession({
			sessionUser,
			subjectTag,
		});
		return NextResponse.json(response);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.follows_suggestions.invalid_input",
				error,
			});
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid subjectTag." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.follows_suggestions.get_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to load suggestions." } },
			{ status: 500 },
		);
	}
}

export const GET = handleFollowSuggestionsGet;
