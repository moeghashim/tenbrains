import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { ensureMountTarget, findTweetArticles } from "../src/shared/dom.js";

function createDom() {
	return new JSDOM(`
		<body>
			<article data-testid="tweet">
				<div>
					<a href="https://x.com/ctatedev/status/2028960626685386994">Tweet link</a>
					<div role="group"><button>Reply</button></div>
				</div>
			</article>
		</body>
	`);
}

test("findTweetArticles discovers tweet article nodes", () => {
	const dom = createDom();
	assert.equal(findTweetArticles(dom.window.document).length, 1);
});

test("ensureMountTarget inserts a single Tenbrains host per tweet article", () => {
	const dom = createDom();
	const article = dom.window.document.querySelector<HTMLElement>("article[data-testid='tweet']");
	assert.ok(article);

	const firstTarget = ensureMountTarget(article);
	const secondTarget = ensureMountTarget(article);

	assert.ok(firstTarget);
	assert.ok(secondTarget);
	assert.equal(firstTarget?.tweetUrl, "https://x.com/ctatedev/status/2028960626685386994");
	assert.equal(firstTarget?.host, secondTarget?.host);
	assert.equal(article?.querySelectorAll("[data-tenbrains-root='true']").length, 1);
});
