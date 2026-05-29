import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "../src/background/api.js";

test("resolveApiUrl only allows Tenbrains endpoints used by the extension", () => {
	assert.equal(resolveApiUrl("/api/analyze").endsWith("/api/analyze"), true);
	assert.equal(resolveApiUrl("/api/bookmarks").endsWith("/api/bookmarks"), true);
	assert.equal(resolveApiUrl("/api/extension/session").endsWith("/api/extension/session"), true);
	assert.throws(() => resolveApiUrl("/api/admin/users"), /Blocked extension API path/);
});
