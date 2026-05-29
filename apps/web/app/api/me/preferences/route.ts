import { UserPreferencesInputSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../src/auth/auth.js";
import {
	getPreferencesForSession,
	listProviderCredentialsForSession,
	updatePreferencesForSession,
} from "../../../../src/server/convex-admin.js";

function readSessionUser(session: Awaited<ReturnType<typeof getServerAuthSession>>) {
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

export async function GET() {
	const sessionUser = readSessionUser(await getServerAuthSession());
	if (!sessionUser) {
		return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
	}

	const [preferences, credentials] = await Promise.all([
		getPreferencesForSession({ sessionUser }),
		listProviderCredentialsForSession({ sessionUser }),
	]);
	return NextResponse.json({ preferences, credentials });
}

export async function POST(req: Request) {
	const sessionUser = readSessionUser(await getServerAuthSession());
	if (!sessionUser) {
		return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
	}

	try {
		const contentType = req.headers.get("content-type") ?? "";
		const rawInput = contentType.includes("application/json")
			? await req.json()
			: Object.fromEntries((await req.formData()).entries());
		const input = UserPreferencesInputSchema.parse({
			defaultProvider: rawInput.defaultProvider,
			defaultModel: rawInput.defaultModel,
			learningMinutes:
				typeof rawInput.learningMinutes === "number"
					? rawInput.learningMinutes
					: Number(rawInput.learningMinutes ?? 0),
		});
		const preferences = await updatePreferencesForSession({
			sessionUser,
			input,
		});
		return NextResponse.json({ preferences });
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { message: error.issues[0]?.message ?? "Invalid preferences input." } },
				{ status: 400 },
			);
		}
		return NextResponse.json(
			{ error: { message: error instanceof Error ? error.message : "Unable to save preferences." } },
			{ status: 500 },
		);
	}
}
