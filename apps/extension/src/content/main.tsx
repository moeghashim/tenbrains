import React from "react";
import { createRoot, type Root } from "react-dom/client";

import { dispatchRuntimeEvent, readResumePendingActionMessage } from "./controller.js";
import contentStyles from "./content.css?inline";
import { TweetActionApp } from "./TweetActionApp.js";
import { ensureMountTarget, findTweetArticles } from "../shared/dom.js";

interface MountedRoot {
	root: Root;
}

const mountedRoots = new WeakMap<HTMLElement, MountedRoot>();
let animationFrameId = 0;

function ensureShadowContainer(host: HTMLElement): HTMLElement {
	const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
	let styleElement = shadowRoot.querySelector("style[data-tenbrains-styles]");
	if (!styleElement) {
		styleElement = document.createElement("style");
		styleElement.setAttribute("data-tenbrains-styles", "true");
		styleElement.textContent = contentStyles;
		shadowRoot.append(styleElement);
	}

	let container = shadowRoot.querySelector<HTMLElement>("[data-tenbrains-shadow-container]");
	if (!container) {
		container = document.createElement("div");
		container.setAttribute("data-tenbrains-shadow-container", "true");
		shadowRoot.append(container);
	}

	return container;
}

function mountTweetActions() {
	for (const article of findTweetArticles()) {
		const target = ensureMountTarget(article);
		if (!target) {
			continue;
		}
		if (mountedRoots.has(target.host)) {
			continue;
		}

		const container = ensureShadowContainer(target.host);
		const root = createRoot(container);
		root.render(<TweetActionApp tweetUrl={target.tweetUrl} />);
		mountedRoots.set(target.host, { root });
	}
}

function scheduleMount() {
	if (animationFrameId !== 0) {
		return;
	}

	animationFrameId = window.requestAnimationFrame(() => {
		animationFrameId = 0;
		mountTweetActions();
	});
}

function observeTimeline() {
	const observer = new MutationObserver(() => {
		scheduleMount();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

chrome.runtime.onMessage.addListener((message) => {
	const resumeMessage = readResumePendingActionMessage(message);
	if (!resumeMessage) {
		return;
	}
	dispatchRuntimeEvent(resumeMessage);
});

mountTweetActions();
observeTimeline();
