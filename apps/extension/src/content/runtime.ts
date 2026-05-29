import type {
	SaveBookmarkInput,
} from "@tenbrains/contracts";
import type {
	AnalyzeTweetMessage,
	AnalyzeTweetMessageResponse,
	CheckSessionMessageResponse,
	RuntimeRequestMessage,
	SaveBookmarkMessage,
	SaveBookmarkMessageResponse,
} from "../shared/messages.js";

async function sendRuntimeMessage<TResponse>(message: RuntimeRequestMessage): Promise<TResponse> {
	return (await chrome.runtime.sendMessage(message)) as TResponse;
}

export async function analyzeTweet(tweetUrl: string): Promise<AnalyzeTweetMessageResponse> {
	const message: AnalyzeTweetMessage = {
		type: "tenbrains/analyze-tweet",
		tweetUrl,
	};
	return sendRuntimeMessage<AnalyzeTweetMessageResponse>(message);
}

export async function saveBookmark(payload: SaveBookmarkInput, tags: string[]): Promise<SaveBookmarkMessageResponse> {
	const message: SaveBookmarkMessage = {
		type: "tenbrains/save-bookmark",
		payload,
		tags,
	};
	return sendRuntimeMessage<SaveBookmarkMessageResponse>(message);
}

export async function checkSession(): Promise<CheckSessionMessageResponse> {
	return sendRuntimeMessage<CheckSessionMessageResponse>({
		type: "tenbrains/check-session",
	});
}
