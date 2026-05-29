import {
	CreateTakeawayFollowInputSchema,
	DeleteTakeawayFollowInputSchema,
} from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../src/config/startup-env.js";
import {
	createTakeawayFollowForSession,
	deleteTakeawayFollowForSession,
	listTakeawayWorkspaceForSession,
} from "../../../../src/server/convex-admin.js";
import { reportServerError } from "../../../../src/telemetry/report-error.js";

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

interface TakeawayFollowsRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	listTakeawayWorkspaceForSession: typeof listTakeawayWorkspaceForSession;
	createTakeawayFollowForSession: typeof createTakeawayFollowForSession;
	deleteTakeawayFollowForSession: typeof deleteTakeawayFollowForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: TakeawayFollowsRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	listTakeawayWorkspaceForSession,
	createTakeawayFollowForSession,
	deleteTakeawayFollowForSession,
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

export async function handleTakeawayFollowsGet(
	_request: Request,
	_context?: unknown,
	dependencies: TakeawayFollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		return NextResponse.json(
			await dependencies.listTakeawayWorkspaceForSession({
				sessionUser,
			}),
		);
	} catch (error) {
		dependencies.reportServerError({
			scope: "api.takeaway_follows.get_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to load takeaway follows." } },
			{ status: 500 },
		);
	}
}

export async function handleTakeawayFollowsPost(
	req: Request,
	_context?: unknown,
	dependencies: TakeawayFollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const input = CreateTakeawayFollowInputSchema.parse(await req.json());
		return NextResponse.json(
			await dependencies.createTakeawayFollowForSession({
				sessionUser,
				input,
			}),
		);
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid takeaway follow input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.takeaway_follows.post_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to save takeaway follow." } },
			{ status: 500 },
		);
	}
}

export async function handleTakeawayFollowsDelete(
	req: Request,
	_context?: unknown,
	dependencies: TakeawayFollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const input = DeleteTakeawayFollowInputSchema.parse(await req.json());
		return NextResponse.json(
			await dependencies.deleteTakeawayFollowForSession({
				sessionUser,
				followId: input.followId,
			}),
		);
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid takeaway follow delete input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.takeaway_follows.delete_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to delete takeaway follow." } },
			{ status: 500 },
		);
	}
}

export const GET = handleTakeawayFollowsGet;
export const POST = handleTakeawayFollowsPost;
export const DELETE = handleTakeawayFollowsDelete;
