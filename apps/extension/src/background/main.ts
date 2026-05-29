import type {
	CheckSessionMessageResponse,
	ErrorResponse,
	PendingAuthAction,
	RuntimeRequestMessage,
} from "../shared/messages.js";
import { APP_BASE_URL } from "../shared/config.js";
import {
	getExtensionSession,
	parseAnalyzeResponse,
	parseBookmarkResponse,
	parseSessionResponse,
	postAnalyzeTweet,
	postBookmark,
} from "./api.js";
import {
	clearPendingAuthAction,
	readPendingAuthAction,
	writePendingAuthAction,
} from "./pending-auth.js";

const AUTH_POLL_INTERVAL_MS = 1500;
const AUTH_POLL_TIMEOUT_MS = 120000;
let activeAuthPollId = 0;

function readErrorMessage(payload: unknown, fallbackMessage: string): ErrorResponse {
	if (typeof payload !== "object" || payload === null) {
		return {
			ok: false,
			code: "UNKNOWN_ERROR",
			message: fallbackMessage,
		};
	}

	const payloadRecord = payload as {
		error?: {
			code?: string;
			message?: string;
		};
	};

	return {
		ok: false,
		code: payloadRecord.error?.code ?? "UNKNOWN_ERROR",
		message: payloadRecord.error?.message ?? fallbackMessage,
	};
}

async function openAuthTab(): Promise<void> {
	await chrome.tabs.create({
		url: `${APP_BASE_URL}/auth/popup-start?redirect_url=%2Fapp`,
		active: true,
	});
}

async function notifyResume(pendingAction: PendingAuthAction): Promise<void> {
	try {
		await chrome.tabs.sendMessage(pendingAction.tabId, {
			type: "tenbrains/resume-pending-action",
			pendingAction,
		});
	} catch {
		// The original tab may have been closed or refreshed.
	}
}

async function startAuthPolling(pendingAction: PendingAuthAction): Promise<void> {
	activeAuthPollId += 1;
	const pollId = activeAuthPollId;
	const startedAt = Date.now();

	while (Date.now() - startedAt < AUTH_POLL_TIMEOUT_MS) {
		if (pollId !== activeAuthPollId) {
			return;
		}

		try {
			const response = await getExtensionSession();
			const parsed = await parseSessionResponse(response);

			if (parsed.ok && parsed.data.authenticated) {
				await clearPendingAuthAction();
				await notifyResume(pendingAction);
				return;
			}
		} catch {
			// Keep polling until timeout.
		}

		await new Promise<void>((resolve) => {
			setTimeout(resolve, AUTH_POLL_INTERVAL_MS);
		});
	}
}

async function queueAuthAndResume(pendingAction: PendingAuthAction): Promise<ErrorResponse> {
	await writePendingAuthAction(pendingAction);
	await openAuthTab();
	void startAuthPolling(pendingAction);
	return {
		ok: false,
		code: "AUTH_REQUIRED",
		message: "Complete Tenbrains sign-in in the opened tab, then return to X.",
		authStarted: true,
	};
}

async function handleAnalyze(
	message: Extract<RuntimeRequestMessage, { type: "tenbrains/analyze-tweet" }>,
	tabId: number,
) {
	const response = await postAnalyzeTweet(message.tweetUrl);
	if (response.status === 401) {
		return queueAuthAndResume({
			type: "analyze",
			tweetUrl: message.tweetUrl,
			tabId,
			createdAt: Date.now(),
		});
	}

	const parsed = await parseAnalyzeResponse(response);
	if (parsed.ok) {
		return {
			ok: true,
			data: parsed.data,
		};
	}

	return readErrorMessage(parsed.payload, "Unable to analyze this tweet right now.");
}

async function handleBookmark(
	message: Extract<RuntimeRequestMessage, { type: "tenbrains/save-bookmark" }>,
	tabId: number,
) {
	const response = await postBookmark(JSON.stringify(message.payload));
	if (response.status === 401) {
		return queueAuthAndResume({
			type: "save-bookmark",
			tweetUrl: message.payload.tweetUrlOrId,
			tabId,
			tags: message.tags,
			createdAt: Date.now(),
		});
	}

	const parsed = await parseBookmarkResponse(response);
	if (parsed.ok) {
		return {
			ok: true,
			data: parsed.data,
		};
	}

	return readErrorMessage(parsed.payload, "Unable to save this bookmark right now.");
}

async function handleCheckSession(): Promise<CheckSessionMessageResponse> {
	try {
		const response = await getExtensionSession();
		const parsed = await parseSessionResponse(response);
		if (parsed.ok) {
			return {
				ok: true,
				data: parsed.data,
			};
		}
		return readErrorMessage(parsed.payload, "Unable to verify Tenbrains sign-in.");
	} catch (error) {
		return {
			ok: false,
			code: "NETWORK_ERROR",
			message: error instanceof Error ? error.message : "Unable to verify Tenbrains sign-in.",
		};
	}
}

chrome.runtime.onInstalled.addListener(() => {
	void readPendingAuthAction().then(async (pendingAction) => {
		if (pendingAction) {
			await clearPendingAuthAction();
		}
	});
});

chrome.runtime.onMessage.addListener((message: RuntimeRequestMessage, sender, sendResponse) => {
	void (async () => {
		const tabId = sender.tab?.id;
		if (!tabId && message.type !== "tenbrains/check-session") {
			sendResponse({
				ok: false,
				code: "TAB_REQUIRED",
				message: "Tenbrains actions must be started from an X tab.",
			} satisfies ErrorResponse);
			return;
		}

		switch (message.type) {
			case "tenbrains/analyze-tweet":
				sendResponse(await handleAnalyze(message, tabId ?? -1));
				return;
			case "tenbrains/save-bookmark":
				sendResponse(await handleBookmark(message, tabId ?? -1));
				return;
			case "tenbrains/check-session":
				sendResponse(await handleCheckSession());
				return;
			default:
				sendResponse({
					ok: false,
					code: "UNKNOWN_MESSAGE",
					message: "Unknown Tenbrains extension message.",
				} satisfies ErrorResponse);
		}
	})();

	return true;
});
