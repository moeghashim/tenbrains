export interface PopupAuthSuccessMessage {
	type: "twitter-auth-success";
	redirectUrl?: string;
}

interface StartTwitterPopupAuthOptions {
	callbackUrl: string;
	onSuccess: (redirectUrl: string) => void;
	onPopupBlocked?: () => void;
	onPopupClosed?: () => void;
	onPopupTimedOut?: () => void;
	timeoutMs?: number;
}

export function buildTwitterAuthStartPath(callbackUrl: string): string {
	return `/auth/popup-start?redirect_url=${encodeURIComponent(callbackUrl)}`;
}

function isPopupAuthSuccessMessage(value: unknown): value is PopupAuthSuccessMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return record.type === "twitter-auth-success";
}

export function startTwitterPopupAuth(options: StartTwitterPopupAuthOptions): () => void {
	const popupStartPath = buildTwitterAuthStartPath(options.callbackUrl);
	const popup = window.open(
		popupStartPath,
		"tenbrains-twitter-auth",
		"popup=yes,width=540,height=760,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes",
	);

	if (!popup) {
		options.onPopupBlocked?.();
		return () => {};
	}

	popup.focus();

	let cleanedUp = false;
	let popupInterval: number | null = null;
	let popupTimeout: number | null = null;
	let completed = false;

	const messageHandler = (event: MessageEvent) => {
		if (event.origin !== window.location.origin) {
			return;
		}
		if (!isPopupAuthSuccessMessage(event.data)) {
			return;
		}

		completed = true;
		cleanup();
		const nextPath =
			typeof event.data.redirectUrl === "string" && event.data.redirectUrl.startsWith("/")
				? event.data.redirectUrl
				: options.callbackUrl;
		options.onSuccess(nextPath);
	};

	const cleanup = () => {
		if (cleanedUp) {
			return;
		}
		cleanedUp = true;
		window.removeEventListener("message", messageHandler);
		if (popupInterval !== null) {
			window.clearInterval(popupInterval);
			popupInterval = null;
		}
		if (popupTimeout !== null) {
			window.clearTimeout(popupTimeout);
			popupTimeout = null;
		}
	};

	window.addEventListener("message", messageHandler);
	popupInterval = window.setInterval(() => {
		if (!popup.closed) {
			return;
		}
		cleanup();
		if (!completed) {
			options.onPopupClosed?.();
		}
	}, 300);
	popupTimeout = window.setTimeout(() => {
		cleanup();
		if (completed) {
			return;
		}
		try {
			popup.close();
		} catch {
			// no-op
		}
		options.onPopupTimedOut?.();
	}, options.timeoutMs ?? 45000);

	return cleanup;
}
