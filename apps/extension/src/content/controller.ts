import type {
	PendingAuthAction,
	ResumePendingActionMessage,
	RuntimeEventMessage,
} from "../shared/messages.js";
import { normalizeTweetUrl } from "../shared/tweet-url.js";

export interface TweetActionController {
	resumePendingAction: (pendingAction: PendingAuthAction) => void;
}

const controllersByTweetUrl = new Map<string, TweetActionController>();

export function registerTweetActionController(tweetUrl: string, controller: TweetActionController): () => void {
	const normalizedTweetUrl = normalizeTweetUrl(tweetUrl);
	if (!normalizedTweetUrl) {
		return () => {};
	}

	controllersByTweetUrl.set(normalizedTweetUrl, controller);
	return () => {
		const currentController = controllersByTweetUrl.get(normalizedTweetUrl);
		if (currentController === controller) {
			controllersByTweetUrl.delete(normalizedTweetUrl);
		}
	};
}

export function dispatchRuntimeEvent(message: RuntimeEventMessage): void {
	if (message.type !== "tenbrains/resume-pending-action") {
		return;
	}

	const normalizedTweetUrl = normalizeTweetUrl(message.pendingAction.tweetUrl);
	if (!normalizedTweetUrl) {
		return;
	}

	const controller = controllersByTweetUrl.get(normalizedTweetUrl);
	controller?.resumePendingAction(message.pendingAction);
}

export function readResumePendingActionMessage(
	value: unknown,
): ResumePendingActionMessage | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const maybeMessage = value as Partial<ResumePendingActionMessage>;
	if (maybeMessage.type !== "tenbrains/resume-pending-action" || !maybeMessage.pendingAction) {
		return null;
	}

	return maybeMessage as ResumePendingActionMessage;
}
