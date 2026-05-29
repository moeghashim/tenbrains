import { normalizeTweetUrl, resolveTweetUrlFromArticle } from "./tweet-url.js";

export const ARTICLE_SELECTOR = "article[data-testid='tweet']";
export const MOUNT_ATTRIBUTE = "data-tenbrains-mounted";
export const ROOT_ATTRIBUTE = "data-tenbrains-root";

export interface TweetMountTarget {
	article: HTMLElement;
	host: HTMLDivElement;
	tweetUrl: string;
}

export function findTweetArticles(root: ParentNode = document): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR));
}

export function findExistingMountHost(article: HTMLElement): HTMLDivElement | null {
	return article.querySelector<HTMLDivElement>(`[${ROOT_ATTRIBUTE}='true']`);
}

function findInsertionAnchor(article: HTMLElement): Element | null {
	const actionGroup = article.querySelector("div[role='group']");
	if (actionGroup?.parentElement) {
		return actionGroup.parentElement;
	}
	return article.lastElementChild;
}

export function ensureMountTarget(article: HTMLElement): TweetMountTarget | null {
	const tweetUrl = resolveTweetUrlFromArticle(article);
	if (!tweetUrl) {
		return null;
	}

	const existingHost = findExistingMountHost(article);
	if (existingHost) {
		article.setAttribute(MOUNT_ATTRIBUTE, "true");
		return { article, host: existingHost, tweetUrl };
	}

	const host = article.ownerDocument.createElement("div");
	host.setAttribute(ROOT_ATTRIBUTE, "true");
	host.dataset.tweetUrl = tweetUrl;

	const insertionAnchor = findInsertionAnchor(article);
	if (insertionAnchor?.parentElement) {
		insertionAnchor.insertAdjacentElement("afterend", host);
	} else {
		article.append(host);
	}

	article.setAttribute(MOUNT_ATTRIBUTE, "true");
	return {
		article,
		host,
		tweetUrl,
	};
}

export function readTweetUrlFromHost(host: HTMLElement): string | null {
	return normalizeTweetUrl(host.dataset.tweetUrl ?? "");
}
