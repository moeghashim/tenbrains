import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PrivacyPage from "../app/privacy/page.js";

test("privacy page discloses extension data handling and contact details", () => {
	const html = renderToStaticMarkup(<PrivacyPage />);
	assert.match(html, /Tenbrains for X/);
	assert.match(html, /analyze X posts, save bookmarks, and track daily account takeaways/i);
	assert.match(html, /only runs on https:\/\/x.com/);
	assert.match(html, /Policy Snapshot/);
	assert.match(html, /Data Collected/);
	assert.match(html, /Where Data Lives/);
	assert.match(html, /Third-Party Services/);
	assert.match(html, /Retention and Control/);
	assert.match(html, /does not execute remote code inside x\.com/i);
	assert.match(html, /CLI takeaway state is stored locally/i);
	assert.match(html, /AI providers are used to produce structured tweet analysis/i);
	assert.match(html, /tenbrains@10claws\.com/);
	assert.doesNotMatch(html, /Open Support/);
	assert.doesNotMatch(html, /support@tenbrains\.app/);
});
