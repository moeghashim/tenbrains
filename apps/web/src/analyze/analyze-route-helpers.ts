import type { AiProviderErrorCode } from "@tenbrains/ai";
import type { XProviderErrorCode } from "@tenbrains/x-client";

import { buildSignInRedirectPath } from "../auth/routing.js";

export interface AnalyzeRouteErrorBody {
	error: {
		code: string;
		message: string;
	};
	redirectTo?: string;
}

function sanitizeProviderMessage(providerMessage?: string): string | undefined {
	if (!providerMessage) {
		return undefined;
	}
	const trimmed = providerMessage.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	return trimmed.slice(0, 240);
}

export function buildResumeSignInRedirect(tweetUrlOrId: string): string {
	const params = new URLSearchParams({
		tweetUrlOrId,
		analyze: "1",
	});
	return buildSignInRedirectPath("/", `?${params.toString()}`);
}

export function mapXErrorCodeToResponse(
	code: XProviderErrorCode,
	providerMessage?: string,
): { status: number; body: AnalyzeRouteErrorBody } {
	const statusByCode: Record<XProviderErrorCode, number> = {
		UNAUTHORIZED: 502,
		FORBIDDEN: 403,
		NOT_FOUND: 404,
		RATE_LIMITED: 429,
		UPSTREAM_ERROR: 502,
		INVALID_INPUT: 400,
		CONFIG_ERROR: 500,
		NETWORK_ERROR: 503,
	};

	const messageDetail = sanitizeProviderMessage(providerMessage);
	const messageByCode: Record<XProviderErrorCode, string> = {
		UNAUTHORIZED: "Tweet provider authentication failed. Please try again later.",
		FORBIDDEN: "This tweet is private or unavailable.",
		NOT_FOUND: "Tweet not found. Check the URL and try again.",
		RATE_LIMITED: "Tweet provider is rate limited. Please retry shortly.",
		UPSTREAM_ERROR: messageDetail ?? "Tweet provider returned an unexpected response.",
		INVALID_INPUT: messageDetail ?? "Enter a valid tweet URL or tweet ID.",
		CONFIG_ERROR: "Tweet provider is not configured correctly.",
		NETWORK_ERROR: messageDetail ?? "Network error while contacting tweet provider.",
	};

	return {
		status: statusByCode[code],
		body: {
			error: {
				code,
				message: messageByCode[code],
			},
		},
	};
}

export function mapAiErrorCodeToResponse(
	code: AiProviderErrorCode,
	providerMessage?: string,
): { status: number; body: AnalyzeRouteErrorBody } {
	const statusByCode: Record<AiProviderErrorCode, number> = {
		CONFIG_ERROR: 400,
		UNAUTHORIZED: 502,
		RATE_LIMITED: 429,
		NETWORK_ERROR: 503,
		UPSTREAM_ERROR: 502,
		INVALID_RESPONSE: 502,
	};

	const messageDetail = sanitizeProviderMessage(providerMessage);
	const messageByCode: Record<AiProviderErrorCode, string> = {
		CONFIG_ERROR: messageDetail ?? "Configure an API key for this provider before analyzing.",
		UNAUTHORIZED: "Model provider authentication failed. Check the saved API key and try again.",
		RATE_LIMITED: "Model provider is rate limited. Please retry shortly.",
		NETWORK_ERROR: messageDetail ?? "Network error while contacting the model provider.",
		UPSTREAM_ERROR: messageDetail ?? "Model provider returned an unexpected response.",
		INVALID_RESPONSE: messageDetail ?? "Model provider returned invalid analysis output.",
	};

	return {
		status: statusByCode[code],
		body: {
			error: {
				code,
				message: messageByCode[code],
			},
		},
	};
}
