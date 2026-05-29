import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import React from "react";

import { BrandMark } from "../../components/brand-mark.js";

const collectedData = [
	"X post URLs, post text, and public tweet metadata needed to analyze a post, save a bookmark, or build an account takeaway snapshot.",
	"Bookmark tags, followed creators, followed subjects, and followed takeaway accounts that you create inside Tenbrains.",
	"Account details needed for sign-in and ownership checks, such as your X user id, username, name, and avatar when those are available through the auth flow or X API.",
	"Provider configuration you explicitly set, such as model preferences and encrypted provider API keys stored for your account.",
];

const storageDetails = [
	"Saved analyses, bookmarks, follows, preferences, provider credential records, and takeaway snapshots are stored in Tenbrains so they can appear across the web app and related workflows.",
	"The extension keeps lightweight browser state needed for sign-in resume and in-progress actions. It does not execute remote code inside x.com.",
	"CLI takeaway state is stored locally on the machine where you run the CLI, alongside your local Tenbrains configuration.",
];

const serviceUsage = [
	"Tenbrains fetches public X metadata on the server side to analyze posts and refresh account takeaways.",
	"AI providers are used to produce structured tweet analysis and account-takeaway summaries from the posts you ask Tenbrains to process.",
	"Tenbrains does not sell personal data.",
];

const controlsAndRetention = [
	"You control what gets saved by choosing which posts to analyze, which bookmarks to keep, and which creators, subjects, or accounts to follow.",
	"Takeaway history is stored so you can inspect prior daily snapshots and the exact posts behind them.",
	"If you remove bookmarks, follows, or provider credentials from the product, Tenbrains stops using those records for future workflows.",
];

const policySections = [
	{
		eyebrow: "Collection",
		title: "Data Collected",
		items: collectedData,
	},
	{
		eyebrow: "Storage",
		title: "Where Data Lives",
		items: storageDetails,
	},
	{
		eyebrow: "Services",
		title: "Third-Party Services",
		items: serviceUsage,
	},
	{
		eyebrow: "Control",
		title: "Retention and Control",
		items: controlsAndRetention,
	},
];

export default function PrivacyPage() {
	return (
		<div className="min-h-screen bg-surface text-on-surface">
			<div className="pointer-events-none fixed inset-0 opacity-60">
				<div className="obsidian-grid absolute inset-0" />
				<div className="obsidian-radial absolute inset-0" />
			</div>

			<nav className="fixed top-0 z-50 w-full border-b border-outline-variant/10 bg-surface/95 backdrop-blur-md">
				<div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4 sm:px-10 lg:px-16">
					<Link href="/" className="group flex items-center gap-3">
						<BrandMark className="h-8 w-8 text-primary transition-transform duration-700 ease-redsun group-hover:-rotate-6 group-hover:scale-105" />
						<span className="font-headline text-2xl font-bold tracking-tight text-primary">Tenbrains</span>
					</Link>
					<Link
						href="/app"
						className="bg-primary-container px-6 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-on-primary-container transition-transform hover:scale-[1.02]"
					>
						Open App
					</Link>
				</div>
			</nav>

			<main className="relative z-10 px-6 pb-24 pt-28 sm:px-10 lg:px-16 lg:pb-32">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10">
					<section className="relative overflow-hidden bg-surface-container-low px-8 py-12 sm:px-12 lg:px-16 lg:py-16">
						<div className="obsidian-noise pointer-events-none absolute inset-0 opacity-15" />
						<div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-end">
							<div>
								<div className="mb-6 flex items-center gap-4">
									<span className="h-2 w-2 bg-primary" />
									<p className="font-label text-[11px] uppercase tracking-[0.5em] text-secondary/70">Privacy Policy</p>
								</div>
								<h1 className="max-w-4xl font-headline text-[3rem] font-bold uppercase leading-[0.95] tracking-[-0.04em] text-on-surface sm:text-[4.6rem]">
									Tenbrains for X
								</h1>
								<p className="mt-6 max-w-3xl font-body text-base leading-7 text-on-surface-variant sm:text-lg">
									This policy explains the data handled by the Tenbrains extension, web app, and related CLI workflows
									when you analyze X posts, save bookmarks, and track daily account takeaways.
								</p>
							</div>
							<div className="border border-outline-variant/20 bg-surface-container-high p-6">
								<p className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/70">Contact</p>
								<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
									Questions about this policy or Tenbrains data handling can be sent to
								</p>
								<a
									href="mailto:tenbrains@10claws.com"
									className="mt-5 inline-flex items-center gap-3 bg-primary-container px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container transition-shadow hover:shadow-[0_0_30px_rgba(110,229,145,0.3)]"
								>
									tenbrains@10claws.com
									<ArrowUpRight className="h-4 w-4 text-on-primary-container/80" />
								</a>
								<p className="mt-5 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/50">
									Tenbrains only runs on https://x.com/* when you choose to analyze a post or save it into your workspace.
								</p>
							</div>
						</div>
					</section>

					<section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
						<div className="border border-outline-variant/10 bg-surface p-8 lg:p-10">
							<div className="flex items-center gap-4">
								<span className="h-2 w-2 bg-secondary/40" />
								<h2 className="font-label text-[11px] uppercase tracking-[0.45em] text-secondary">Overview</h2>
							</div>
							<p className="mt-6 font-body text-base leading-7 text-on-surface-variant">
								Tenbrains is built to help you capture useful posts, keep research trails, and generate daily account
								takeaways without scraping unrelated browsing activity.
							</p>
							<p className="mt-4 font-body text-base leading-7 text-on-surface-variant">
								The extension, web app, and CLI share one product model, but they do not all store the same data in the same
								place. The sections below explain what is collected, where it lives, and which third-party services are
								involved.
							</p>
						</div>
						<div className="border border-outline-variant/10 bg-surface-container-low p-8 lg:p-10">
							<p className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/70">Policy Snapshot</p>
							<div className="mt-6 grid gap-6 sm:grid-cols-3">
								<div className="border-l border-primary/30 pl-4">
									<p className="mb-2 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/40">Scope</p>
									<p className="font-label text-xl text-primary">Web app, extension, and CLI</p>
								</div>
								<div className="border-l border-primary/30 pl-4">
									<p className="mb-2 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/40">Inputs</p>
									<p className="font-label text-xl text-primary">Posts, bookmarks, follows, preferences</p>
								</div>
								<div className="border-l border-primary/30 pl-4">
									<p className="mb-2 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/40">Commitment</p>
									<p className="font-label text-xl text-primary">Tenbrains does not sell personal data</p>
								</div>
							</div>
						</div>
					</section>

					<section className="grid grid-cols-1 gap-px bg-outline-variant/10 md:grid-cols-2">
						{policySections.map((section) => (
							<div key={section.title} className="bg-surface p-8 lg:p-10">
								<p className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/70">{section.eyebrow}</p>
								<h2 className="mt-4 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">{section.title}</h2>
								<ul className="mt-6 flex list-disc flex-col gap-4 pl-5 font-body text-sm leading-7 text-on-surface-variant">
									{section.items.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						))}
					</section>
				</div>
			</main>
		</div>
	);
}
