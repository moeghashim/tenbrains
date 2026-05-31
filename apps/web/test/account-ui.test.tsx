import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccountPage from "../app/account/page.js";
import AppHomePage from "../app/app/page.js";

test("app home page mirrors the landing analyzer shell", async () => {
	const page = await AppHomePage({});
	const html = renderToStaticMarkup(page);
	const bookmarksIndex = html.indexOf('href="/app/bookmarks"');
	const followingIndex = html.indexOf('href="/app/following"');
	const takeawayIndex = html.indexOf('href="/app/takeaway"');
	const suggestionsIndex = html.indexOf('href="/app/suggestions"');

	assert.match(html, /id=\"hero-analyze-button\"/);
	assert.match(html, /id=\"nav-cta\"[^>]*href=\"\/auth\/popup-start\?redirect_url=%2Fapp\"/);
	assert.match(html, /href=\"\/app\/bookmarks\"[^>]*>Bookmarks<\/a>/);
	assert.match(html, /href=\"\/app\/following\"[^>]*>Following<\/a>/);
	assert.match(html, /href=\"\/app\/takeaway\"[^>]*>Takeaway<\/a>/);
	assert.match(html, /href=\"\/app\/suggestions\"[^>]*>Suggestions<\/a>/);
	assert.match(html, /id=\"hero-tweet-url\"/);
	assert.match(html, /X analysis workspace/);
	assert.match(html, /Turn X posts into/);
	assert.match(html, /Start with one post, keep the trail/);
	assert.doesNotMatch(html, /Learning Tracks/);
	assert.ok(bookmarksIndex >= 0 && followingIndex > bookmarksIndex && takeawayIndex > followingIndex && suggestionsIndex > takeawayIndex);
});

test("account page includes preferences and sign-out actions", () => {
	const html = renderToStaticMarkup(<AccountPage />);
	assert.match(html, /id=\"nav-logo\"/);
	assert.match(html, /id=\"nav-cta\"[^>]*href=\"\/app\"/);
	assert.match(html, /Account Settings/);
	assert.match(html, /Back to Workspace/);
	assert.match(html, /action=\"\/api\/me\/preferences\"/);
	assert.match(html, /name=\"defaultProvider\"/);
	assert.match(html, /name=\"defaultModel\"/);
	assert.match(html, /name=\"learningMinutes\"/);
	assert.match(html, /Provider API Keys/);
	assert.match(html, /id=\"sign-out-button\"/);
	assert.match(html, /id=\"nav-sign-out\"/);
	assert.match(html, /Save Preferences/);
	assert.match(html, /Sign Out/);
});
