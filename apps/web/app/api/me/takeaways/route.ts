import { RefreshTakeawayInputSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../src/config/startup-env.js";
import { getTakeawayHistoryForSession } from "../../../../src/server/convex-admin.js";
import { refreshTakeawayForSession } from "../../../../src/takeaways/refresh-takeaway.js";
import { reportServerError } from "../../../../src/telemetry/report-error.js";

export const maxDuration = 60;

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

interface TakeawaysRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	getTakeawayHistoryForSession: typeof getTakeawayHistoryForSession;
	refreshTakeawayForSession: typeof refreshTakeawayForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: TakeawaysRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	getTakeawayHistoryForSession,
	refreshTakeawayForSession,
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

function unauthorizedResponse() {
	return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
}

export async function handleTakeawaysGet(
	req: Request,
	_context?: unknown,
	dependencies: TakeawaysRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const url = new URL(req.url);
		const followId = url.searchParams.get("followId")?.trim() ?? "";
		if (!followId) {
			return NextResponse.json({ error: { message: "followId is required." } }, { status: 400 });
		}

		return NextResponse.json(
			await dependencies.getTakeawayHistoryForSession({
				sessionUser,
				followId,
			}),
		);
	} catch (error) {
		dependencies.reportServerError({
			scope: "api.takeaways.get_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to load takeaway history." } },
			{ status: 500 },
		);
	}
}

export async function handleTakeawaysPost(
	req: Request,
	_context?: unknown,
	dependencies: TakeawaysRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const input = RefreshTakeawayInputSchema.parse(await req.json());
		return NextResponse.json(
			await dependencies.refreshTakeawayForSession({
				sessionUser,
				followId: input.followId,
			}),
		);
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid takeaway refresh input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.takeaways.post_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to refresh takeaway." } },
			{ status: 500 },
		);
	}
}

export const GET = handleTakeawaysGet;
export const POST = handleTakeawaysPost;
