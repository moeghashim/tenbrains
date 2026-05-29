import {
	CreateFollowInputSchema,
	DeleteFollowInputSchema,
} from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../src/config/startup-env.js";
import {
	createCreatorFollowForSession,
	createTakeawayFollowForSession,
	createSubjectFollowForSession,
	deleteCreatorFollowForSession,
	deleteTakeawayFollowForSession,
	deleteSubjectFollowForSession,
	listFollowsForSession,
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

interface FollowsRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	listFollowsForSession: typeof listFollowsForSession;
	createCreatorFollowForSession: typeof createCreatorFollowForSession;
	createTakeawayFollowForSession: typeof createTakeawayFollowForSession;
	createSubjectFollowForSession: typeof createSubjectFollowForSession;
	deleteCreatorFollowForSession: typeof deleteCreatorFollowForSession;
	deleteTakeawayFollowForSession: typeof deleteTakeawayFollowForSession;
	deleteSubjectFollowForSession: typeof deleteSubjectFollowForSession;
	listTakeawayWorkspaceForSession: typeof listTakeawayWorkspaceForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: FollowsRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	listFollowsForSession,
	createCreatorFollowForSession,
	createTakeawayFollowForSession,
	createSubjectFollowForSession,
	deleteCreatorFollowForSession,
	deleteTakeawayFollowForSession,
	deleteSubjectFollowForSession,
	listTakeawayWorkspaceForSession,
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

function notFoundResponse(message: string) {
	return NextResponse.json({ error: { message } }, { status: 404 });
}

function normalizeUsername(username: string): string {
	return username.trim().replace(/^@+/, "").toLowerCase();
}

export async function handleFollowsGet(
	_request: Request,
	_context?: unknown,
	dependencies: FollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const summary = await dependencies.listFollowsForSession({
			sessionUser,
		});
		return NextResponse.json(summary);
	} catch (error) {
		dependencies.reportServerError({
			scope: "api.follows.get_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to load follows." } },
			{ status: 500 },
		);
	}
}

export async function handleFollowsPost(
	req: Request,
	_context?: unknown,
	dependencies: FollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const input = CreateFollowInputSchema.parse(await req.json());
		if (input.kind === "creator") {
			const created = await dependencies.createCreatorFollowForSession({
				sessionUser,
				input: {
					creatorUsername: input.creatorUsername,
					creatorName: input.creatorName,
					creatorAvatarUrl: input.creatorAvatarUrl,
					scope: input.scope,
					subjectTag: input.subjectTag,
				},
			});
			await dependencies.createTakeawayFollowForSession({
				sessionUser,
				input: {
					accountUsername: created.creatorUsername,
					accountName: created.creatorName,
					accountAvatarUrl: created.creatorAvatarUrl,
				},
			});
			return NextResponse.json(created);
		}

		const created = await dependencies.createSubjectFollowForSession({
			sessionUser,
			input: {
				subjectTag: input.subjectTag,
			},
		});
		return NextResponse.json(created);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.follows.invalid_input",
				error,
			});
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid follow input." } },
				{ status: 400 },
			);
		}
		dependencies.reportServerError({
			scope: "api.follows.post_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to save follow." } },
			{ status: 500 },
		);
	}
}

export async function handleFollowsDelete(
	req: Request,
	_context?: unknown,
	dependencies: FollowsRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser) {
			return unauthorizedResponse();
		}

		const input = DeleteFollowInputSchema.parse(await req.json());
		if (input.kind === "creator") {
			const followsBeforeDelete = await dependencies.listFollowsForSession({
				sessionUser,
			});
			const removedFollow = followsBeforeDelete.creatorFollows.find((follow) => follow.id === input.followId);
			const deleted = await dependencies.deleteCreatorFollowForSession({
				sessionUser,
				followId: input.followId,
			});
			if (removedFollow) {
				const normalizedUsername = normalizeUsername(removedFollow.creatorUsername);
				const followsAfterDelete = await dependencies.listFollowsForSession({
					sessionUser,
				});
				const stillFollowingCreator = followsAfterDelete.creatorFollows.some(
					(follow) => normalizeUsername(follow.creatorUsername) === normalizedUsername,
				);
				if (!stillFollowingCreator) {
					const takeawayWorkspace = await dependencies.listTakeawayWorkspaceForSession({
						sessionUser,
					});
					const takeawayFollow = takeawayWorkspace.follows.find(
						(follow) => normalizeUsername(follow.accountUsername) === normalizedUsername,
					);
					if (takeawayFollow) {
						await dependencies.deleteTakeawayFollowForSession({
							sessionUser,
							followId: takeawayFollow.id,
						});
					}
				}
			}
			return NextResponse.json(deleted);
		}

		const deleted = await dependencies.deleteSubjectFollowForSession({
			sessionUser,
			followId: input.followId,
		});
		return NextResponse.json(deleted);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.follows.invalid_delete_input",
				error,
			});
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid follow delete input." } },
				{ status: 400 },
			);
		}
		if (error instanceof Error && error.message === "Follow not found") {
			return notFoundResponse(error.message);
		}
		dependencies.reportServerError({
			scope: "api.follows.delete_failure",
			error,
		});
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to delete follow." } },
			{ status: 500 },
		);
	}
}

export const GET = handleFollowsGet;
export const POST = handleFollowsPost;
export const DELETE = handleFollowsDelete;
