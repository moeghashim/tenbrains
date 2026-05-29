import {
	AnalyzeTweetResponseSchema,
	ExtensionSessionStatusSchema,
	SavedBookmarkSchema,
} from "@tenbrains/contracts";

import { APP_BASE_URL } from "../shared/config.js";

const ALLOWED_ENDPOINTS = new Set([
	"/api/analyze",
	"/api/bookmarks",
	"/api/extension/session",
]);

export function resolveApiUrl(pathname: string): string {
	if (!ALLOWED_ENDPOINTS.has(pathname)) {
		throw new Error(`Blocked extension API path: ${pathname}`);
	}
	return `${APP_BASE_URL}${pathname}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return {
			error: {
				code: "INVALID_RESPONSE",
				message: "Tenbrains returned a non-JSON response.",
			},
		};
	}

	return (await response.json()) as unknown;
}

export async function postAnalyzeTweet(tweetUrl: string): Promise<Response> {
	return fetch(resolveApiUrl("/api/analyze"), {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify({
			tweetUrlOrId: tweetUrl,
		}),
	});
}

export async function postBookmark(payload: string): Promise<Response> {
	return fetch(resolveApiUrl("/api/bookmarks"), {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		credentials: "include",
		body: payload,
	});
}

export async function getExtensionSession(): Promise<Response> {
	return fetch(resolveApiUrl("/api/extension/session"), {
		method: "GET",
		credentials: "include",
	});
}

export async function parseAnalyzeResponse(response: Response) {
	const payload = await readJsonResponse(response);

	if (response.ok) {
		return {
			ok: true as const,
			data: AnalyzeTweetResponseSchema.parse(payload),
		};
	}

	return {
		ok: false as const,
		payload,
	};
}

export async function parseBookmarkResponse(response: Response) {
	const payload = await readJsonResponse(response);

	if (response.ok) {
		return {
			ok: true as const,
			data: SavedBookmarkSchema.parse(payload),
		};
	}

	return {
		ok: false as const,
		payload,
	};
}

export async function parseSessionResponse(response: Response) {
	const payload = await readJsonResponse(response);

	if (response.ok) {
		return {
			ok: true as const,
			data: ExtensionSessionStatusSchema.parse(payload),
		};
	}

	return {
		ok: false as const,
		payload,
	};
}
