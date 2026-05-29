import { ExtensionSessionStatusSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "../../../../src/auth/auth.js";

interface SessionUserLike {
	id?: string | null;
	name?: string | null;
	xUsername?: string | null;
}

interface SessionLike {
	user?: SessionUserLike | null;
}

interface ExtensionSessionDependencies {
	getServerAuthSession: () => Promise<SessionLike | null>;
}

const defaultDependencies: ExtensionSessionDependencies = {
	getServerAuthSession,
};

function buildUnauthenticatedPayload() {
	return ExtensionSessionStatusSchema.parse({
		authenticated: false,
	});
}

export async function handleExtensionSessionGet(
	dependencies: ExtensionSessionDependencies = defaultDependencies,
) {
	try {
		const session = await dependencies.getServerAuthSession();
		const user = session?.user;
		const userId = user?.id?.trim() ?? "";

		if (!user || userId.length === 0) {
			return NextResponse.json(buildUnauthenticatedPayload());
		}

		return NextResponse.json(
			ExtensionSessionStatusSchema.parse({
				authenticated: true,
				user: {
					id: userId,
					xUsername: user.xUsername?.trim() || undefined,
					name: user.name ?? null,
				},
			}),
		);
	} catch {
		return NextResponse.json(buildUnauthenticatedPayload());
	}
}

export async function GET() {
	return handleExtensionSessionGet();
}
