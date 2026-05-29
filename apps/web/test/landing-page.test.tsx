import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { renderToStaticMarkup } from "react-dom/server";

import LandingPage from "../app/page.js";

test("landing page renders headline and core sections", async () => {
	const page = await LandingPage({});
	const html = renderToStaticMarkup(page);
	assert.match(html, /Turn X posts into/);
	assert.match(html, /structured learning/);
	assert.match(html, /X analysis workspace/);
	assert.match(html, /Core Workflows/);
	assert.match(html, /Start with one post, keep the trail/);
});

test("landing page ctas route to auth pages", async () => {
	const page = await LandingPage({});
	const html = renderToStaticMarkup(page);
	const bookmarksIndex = html.indexOf('href="/app/bookmarks"');
	const followingIndex = html.indexOf('href="/app/following"');
	const takeawayIndex = html.indexOf('href="/app/takeaway"');
	const suggestionsIndex = html.indexOf('href="/app/suggestions"');

	assert.match(html, /id=\"nav-cta\"[^>]*href=\"\/auth\/popup-start\?redirect_url=%2Fapp\"/);
	assert.match(html, /href=\"\/app\/bookmarks\"[^>]*>Bookmarks<\/a>/);
	assert.match(html, /href=\"\/app\/following\"[^>]*>Following<\/a>/);
	assert.match(html, /href=\"\/app\/takeaway\"[^>]*>Takeaway<\/a>/);
	assert.match(html, /href=\"\/app\/suggestions\"[^>]*>Suggestions<\/a>/);
	assert.match(html, /href=\"\/privacy\"[^>]*>Privacy<\/a>/);
	assert.match(html, /id=\"hero-analyze-button\"/);
	assert.match(html, /Connect<\/a>/);
	assert.match(html, /Authenticate with X/);
	assert.match(html, /https:\/\/github\.com\/moeghashim\/tenbrains/);
	assert.match(html, /10claws\.com/);
	assert.doesNotMatch(html, /Tenbrains on X/);
	assert.doesNotMatch(html, /href=\"https:\/\/x\.com\/moeghashim\"/);
	assert.doesNotMatch(html, /href=\"https:\/\/10claws\.com\"/);
	assert.ok(bookmarksIndex >= 0 && followingIndex > bookmarksIndex && takeawayIndex > followingIndex && suggestionsIndex > takeawayIndex);
});

test("landing page analyzer keeps the tweet input but hides provider and model selectors", async () => {
	const page = await LandingPage({});
	const html = renderToStaticMarkup(page);
	assert.match(html, /id=\"hero-tweet-url\"/);
	assert.doesNotMatch(html, /id=\"hero-provider\"/);
	assert.doesNotMatch(html, /id=\"hero-model\"/);
});

test("landing page keeps responsive class markers for desktop and mobile", async () => {
	const page = await LandingPage({});
	const html = renderToStaticMarkup(page);
	assert.match(html, /md:flex/);
	assert.match(html, /lg:grid-cols-4/);
	assert.match(html, /sm:text-\[5rem\]/);
});
