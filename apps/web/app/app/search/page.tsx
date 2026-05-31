import React from "react";

import { AppWorkspaceNav } from "../../../components/app-workspace-nav.js";
import { SemanticSearchBrowser } from "../../../components/semantic-search-browser.js";

export default function AppSearchPage() {
	return (
		<div className="min-h-screen bg-surface text-on-surface">
			<AppWorkspaceNav activeItem="Search" />
			<main className="px-6 pb-16 pt-10 sm:px-10 lg:px-16">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10">
					<section className="relative overflow-hidden border border-outline-variant/10 bg-surface-container-low">
						<div className="obsidian-radial absolute inset-0 opacity-70" />
						<div className="relative z-10 p-8 md:p-10">
							<p className="font-mono text-[11px] uppercase tracking-[0.38em] text-primary">Semantic recall</p>
							<h1 className="mt-4 font-headline text-4xl uppercase tracking-[-0.03em] text-on-surface md:text-5xl">
								Search
							</h1>
							<p className="mt-4 max-w-3xl font-body text-sm leading-7 text-on-surface-variant md:text-base">
								Search the meaning of your saved bookmarks, tweet analyses, and takeaway snapshots from one workspace.
							</p>
							<div className="mt-8">
								<SemanticSearchBrowser />
							</div>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
