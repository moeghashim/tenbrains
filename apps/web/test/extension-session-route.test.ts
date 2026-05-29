import assert from "node:assert/strict";
import test from "node:test";

import { handleExtensionSessionGet } from "../app/api/extension/session/route.js";

test("GET /api/extension/session returns unauthenticated when no session exists", async () => {
	const response = await handleExtensionSessionGet({
		getServerAuthSession: async () => null,
	});

	assert.equal(response.status, 200);
	const payload = (await response.json()) as {
		authenticated: boolean;
		user?: {
			id: string;
		};
	};
	assert.equal(payload.authenticated, false);
	assert.equal("user" in payload, false);
});

test("GET /api/extension/session returns a stable user payload for authenticated sessions", async () => {
	const response = await handleExtensionSessionGet({
		getServerAuthSession: async () => ({
			user: {
				id: "user_1",
				name: "Tenbrains",
				xUsername: "tenbrains",
			},
		}),
	});

	assert.equal(response.status, 200);
	const payload = (await response.json()) as {
		authenticated: boolean;
		user?: {
			id: string;
			xUsername?: string;
			name?: string | null;
		};
	};
	assert.equal(payload.authenticated, true);
	assert.equal(payload.user?.id, "user_1");
	assert.equal(payload.user?.xUsername, "tenbrains");
	assert.equal(payload.user?.name, "Tenbrains");
});
