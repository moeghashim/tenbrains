import assert from "node:assert/strict";
import test from "node:test";

import { dispatchRuntimeEvent, registerTweetActionController } from "../src/content/controller.js";

test("dispatchRuntimeEvent resumes the controller registered for a tweet URL", () => {
	let resumed = false;
	const dispose = registerTweetActionController("https://x.com/ctatedev/status/2028960626685386994", {
		resumePendingAction() {
			resumed = true;
		},
	});

	dispatchRuntimeEvent({
		type: "tenbrains/resume-pending-action",
		pendingAction: {
			type: "analyze",
			tweetUrl: "https://x.com/ctatedev/status/2028960626685386994",
			tabId: 3,
			createdAt: 1,
		},
	});

	dispose();
	assert.equal(resumed, true);
});
