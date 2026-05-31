import React from "react";

import { AppWorkspaceNav } from "../../../components/app-workspace-nav.js";
import { BookmarksBrowser } from "../../../components/bookmarks-browser.js";

export default function AppBookmarksPage() {
	return (
		<div className="min-h-screen bg-surface text-on-surface">
			<AppWorkspaceNav activeItem="Bookmarks" signedIn />
			<main className="px-6 pb-16 pt-10 sm:px-10 lg:px-16">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10">
					<section className="overflow-hidden border border-outline-variant/10 bg-surface-container-low">
						<div className="obsidian-radial absolute inset-0 opacity-70" />
						<div className="relative z-10 p-8 md:p-10">
							<p className="font-mono text-[11px] uppercase tracking-[0.38em] text-primary">Archive node</p>
							<h1 className="mt-4 font-headline text-4xl uppercase tracking-[-0.03em] text-on-surface md:text-5xl">Bookmarks</h1>
							<p className="mt-4 max-w-3xl font-body text-sm leading-7 text-on-surface-variant md:text-base">
								Review saved tweets by tag, move between grid and ledger views, and open the full record in a right-side intelligence panel.
							</p>
							<div className="mt-8">
							<BookmarksBrowser />
						</div>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
