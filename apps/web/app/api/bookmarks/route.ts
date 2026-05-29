import {
	DeleteBookmarkInputSchema,
	SaveBookmarkInputSchema,
	UpdateBookmarkTagsInputSchema,
} from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../src/auth/auth.js";
import {
	createBookmarkAlreadyExistsErrorData,
	isBookmarkAlreadyExistsError,
} from "../../../src/bookmarks/errors.js";
import { validateStartupEnvIfNeeded } from "../../../src/config/startup-env.js";
import {
	deleteBookmarkForSession,
	listBookmarksForSession,
	saveBookmarkForSession,
	updateBookmarkTagsForSession,
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

interface AuthenticatedSessionUser {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface BookmarksRouteDependencies {
	validateStartupEnvIfNeeded: () => void;
	getServerAuthSession: () => Promise<SessionLike | null>;
	saveBookmarkForSession: typeof saveBookmarkForSession;
	listBookmarksForSession: typeof listBookmarksForSession;
	updateBookmarkTagsForSession: typeof updateBookmarkTagsForSession;
	deleteBookmarkForSession: typeof deleteBookmarkForSession;
	reportServerError: typeof reportServerError;
}

const defaultDependencies: BookmarksRouteDependencies = {
	validateStartupEnvIfNeeded,
	getServerAuthSession,
	saveBookmarkForSession,
	listBookmarksForSession,
	updateBookmarkTagsForSession,
	deleteBookmarkForSession,
	reportServerError,
};

function readSessionUser(session: SessionLike | null): AuthenticatedSessionUser | null {
	const user = session?.user;
	const userId = user?.id?.trim() ?? "";
	if (user && userId.length > 0) {
		return {
			id: userId,
			email: user.email,
			name: user.name,
		};
	}
	return null;
}

function unauthorizedResponse() {
	return NextResponse.json(
		{
			error: {
				code: "AUTH_REQUIRED",
				message: "Sign in with Twitter to manage bookmarks.",
			},
		},
		{ status: 401 },
	);
}

function notFoundResponse(message: string) {
	return NextResponse.json(
		{
			error: {
				code: "BOOKMARK_NOT_FOUND",
				message,
			},
		},
		{ status: 404 },
	);
}

export async function handleBookmarksPost(
	req: Request,
	dependencies: BookmarksRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser?.id) {
			return unauthorizedResponse();
		}

		const input = SaveBookmarkInputSchema.parse(await req.json());
		const saved = await dependencies.saveBookmarkForSession({
			sessionUser,
			input,
		});

		return NextResponse.json(saved);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.bookmarks.invalid_input",
				error,
			});
			return NextResponse.json(
				{
					error: {
						code: "INVALID_INPUT",
						message: error.issues[0]?.message ?? "Invalid bookmark input.",
					},
				},
				{ status: 400 },
			);
		}

		if (isBookmarkAlreadyExistsError(error)) {
			return NextResponse.json(
				{
					error: createBookmarkAlreadyExistsErrorData(),
				},
				{ status: 409 },
			);
		}

		dependencies.reportServerError({
			scope: "api.bookmarks.post_failure",
			error,
		});
		return NextResponse.json(
			{
				error: {
					code: "BOOKMARKS_FAILED",
					message: error instanceof Error ? error.message : "Unexpected bookmark save failure.",
				},
			},
			{ status: 500 },
		);
	}
}

export async function handleBookmarksGet(dependencies: BookmarksRouteDependencies = defaultDependencies) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser?.id) {
			return unauthorizedResponse();
		}

		const bookmarks = await dependencies.listBookmarksForSession({
			sessionUser,
		});
		return NextResponse.json({ bookmarks });
	} catch (error) {
		dependencies.reportServerError({
			scope: "api.bookmarks.get_failure",
			error,
		});
		return NextResponse.json(
			{
				error: {
					code: "BOOKMARKS_FAILED",
					message: error instanceof Error ? error.message : "Unexpected bookmarks fetch failure.",
				},
			},
			{ status: 500 },
		);
	}
}

export async function handleBookmarksPatch(
	req: Request,
	dependencies: BookmarksRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser?.id) {
			return unauthorizedResponse();
		}

		const input = UpdateBookmarkTagsInputSchema.parse(await req.json());
		const updated = await dependencies.updateBookmarkTagsForSession({
			sessionUser,
			input,
		});
		return NextResponse.json(updated);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.bookmarks.invalid_patch_input",
				error,
			});
			return NextResponse.json(
				{
					error: {
						code: "INVALID_INPUT",
						message: error.issues[0]?.message ?? "Invalid bookmark update input.",
					},
				},
				{ status: 400 },
			);
		}

		if (error instanceof Error && error.message === "Bookmark not found") {
			return notFoundResponse(error.message);
		}

		dependencies.reportServerError({
			scope: "api.bookmarks.patch_failure",
			error,
		});
		return NextResponse.json(
			{
				error: {
					code: "BOOKMARKS_FAILED",
					message: error instanceof Error ? error.message : "Unexpected bookmark update failure.",
				},
			},
			{ status: 500 },
		);
	}
}

export async function handleBookmarksDelete(
	req: Request,
	dependencies: BookmarksRouteDependencies = defaultDependencies,
) {
	try {
		dependencies.validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await dependencies.getServerAuthSession());
		if (!sessionUser?.id) {
			return unauthorizedResponse();
		}

		const input = DeleteBookmarkInputSchema.parse(await req.json());
		const deleted = await dependencies.deleteBookmarkForSession({
			sessionUser,
			bookmarkId: input.bookmarkId,
		});
		return NextResponse.json(deleted);
	} catch (error) {
		if (error instanceof ZodError) {
			dependencies.reportServerError({
				scope: "api.bookmarks.invalid_delete_input",
				error,
			});
			return NextResponse.json(
				{
					error: {
						code: "INVALID_INPUT",
						message: error.issues[0]?.message ?? "Invalid bookmark delete input.",
					},
				},
				{ status: 400 },
			);
		}

		if (error instanceof Error && error.message === "Bookmark not found") {
			return notFoundResponse(error.message);
		}

		dependencies.reportServerError({
			scope: "api.bookmarks.delete_failure",
			error,
		});
		return NextResponse.json(
			{
				error: {
					code: "BOOKMARKS_FAILED",
					message: error instanceof Error ? error.message : "Unexpected bookmark delete failure.",
				},
			},
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	return handleBookmarksPost(req);
}

export async function GET() {
	return handleBookmarksGet();
}

export async function PATCH(req: Request) {
	return handleBookmarksPatch(req);
}

export async function DELETE(req: Request) {
	return handleBookmarksDelete(req);
}
