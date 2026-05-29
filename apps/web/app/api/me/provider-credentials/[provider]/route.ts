import { ProviderIdSchema } from "@tenbrains/contracts";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerAuthSession } from "../../../../../src/auth/auth.js";
import { validateStartupEnvIfNeeded } from "../../../../../src/config/startup-env.js";
import {
	deleteProviderCredentialForSession,
	upsertProviderCredentialForSession,
} from "../../../../../src/server/convex-admin.js";
import { reportServerError } from "../../../../../src/telemetry/report-error.js";

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

function readProvider(params: { provider: string }) {
	return ProviderIdSchema.parse(params.provider);
}

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
	try {
		validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await getServerAuthSession());
		if (!sessionUser) {
			return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Unauthorized" } }, { status: 401 });
		}
		const provider = readProvider(await context.params);
		const contentType = req.headers.get("content-type") ?? "";
		const rawInput = contentType.includes("application/json")
			? await req.json()
			: Object.fromEntries((await req.formData()).entries());
		const apiKey = String(rawInput.apiKey ?? "").trim();
		if (!apiKey) {
			return NextResponse.json({ error: { code: "INVALID_INPUT", message: "API key is required." } }, { status: 400 });
		}
		const credential = await upsertProviderCredentialForSession({
			sessionUser,
			provider,
			apiKey,
		});
		return NextResponse.json({ credential });
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { code: "INVALID_PROVIDER", message: error.issues[0]?.message ?? "Invalid provider." } },
				{ status: 400 },
			);
		}
		reportServerError({
			scope: "api.provider_credentials.post_failure",
			error,
		});
		return NextResponse.json(
			{ error: { code: "PROVIDER_CREDENTIALS_FAILED", message: error instanceof Error ? error.message : "Unable to save credential." } },
			{ status: 500 },
		);
	}
}

export async function DELETE(_: Request, context: { params: Promise<{ provider: string }> }) {
	try {
		validateStartupEnvIfNeeded();
		const sessionUser = readSessionUser(await getServerAuthSession());
		if (!sessionUser) {
			return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Unauthorized" } }, { status: 401 });
		}
		const provider = readProvider(await context.params);
		await deleteProviderCredentialForSession({
			sessionUser,
			provider,
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: { code: "INVALID_PROVIDER", message: error.issues[0]?.message ?? "Invalid provider." } },
				{ status: 400 },
			);
		}
		reportServerError({
			scope: "api.provider_credentials.delete_failure",
			error,
		});
		return NextResponse.json(
			{ error: { code: "PROVIDER_CREDENTIALS_FAILED", message: error instanceof Error ? error.message : "Unable to delete credential." } },
			{ status: 500 },
		);
	}
}
