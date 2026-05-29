import type {
	AnalyzeTweetResponse,
	ExtensionSessionStatus,
	SaveBookmarkInput,
	SavedBookmark,
} from "@tenbrains/contracts";

export type PendingAuthActionType = "analyze" | "save-bookmark";

export interface PendingAuthAction {
	type: PendingAuthActionType;
	tweetUrl: string;
	tabId: number;
	tags?: string[];
	createdAt: number;
}

export interface SuccessResponse<T> {
	ok: true;
	data: T;
}

export interface ErrorResponse {
	ok: false;
	code: string;
	message: string;
	authStarted?: boolean;
}

export interface AnalyzeTweetMessage {
	type: "tenbrains/analyze-tweet";
	tweetUrl: string;
}

export interface SaveBookmarkMessage {
	type: "tenbrains/save-bookmark";
	payload: SaveBookmarkInput;
	tags: string[];
}

export interface CheckSessionMessage {
	type: "tenbrains/check-session";
}

export type RuntimeRequestMessage = AnalyzeTweetMessage | SaveBookmarkMessage | CheckSessionMessage;

export type AnalyzeTweetMessageResponse = SuccessResponse<AnalyzeTweetResponse> | ErrorResponse;
export type SaveBookmarkMessageResponse = SuccessResponse<SavedBookmark> | ErrorResponse;
export type CheckSessionMessageResponse = SuccessResponse<ExtensionSessionStatus> | ErrorResponse;

export interface ResumePendingActionMessage {
	type: "tenbrains/resume-pending-action";
	pendingAction: PendingAuthAction;
}

export type RuntimeEventMessage = ResumePendingActionMessage;
