import {
	ArrowUpRight,
	AudioLines,
	BrainCircuit,
	Orbit,
	ScanSearch,
} from "lucide-react";
import Link from "next/link";
import React from "react";

import { HeroTweetAnalyzer } from "../components/hero-tweet-analyzer.js";
import { BrandMark } from "../components/brand-mark.js";
import { Reveal } from "../components/reveal.js";
import { workspaceMenuLinks } from "../components/workspace-menu.js";
import { getServerAuthSession } from "../src/auth/auth.js";

const twitterLoginPath = "/auth/popup-start?redirect_url=%2Fapp";

const architectureCards = [
	{
		title: "Analyze Posts",
		description:
			"Paste any X URL or post ID to extract the topic, summary, intent, and five novel concepts worth learning.",
		icon: AudioLines,
		iconClassName: "text-primary",
	},
	{
		title: "Save What Matters",
		description:
			"Keep tagged bookmarks and creator or subject follows in one workspace so good posts do not disappear into the timeline.",
		icon: Orbit,
		iconClassName: "text-secondary",
	},
	{
		title: "Track Accounts",
		description:
			"Follow X accounts and turn their latest posts into concise daily takeaways with source-post evidence and history.",
		icon: BrainCircuit,
		iconClassName: "text-primary",
	},
	{
		title: "Work Anywhere",
		description:
			"Use the web app, CLI, or extension depending on the workflow, without changing the underlying Tenbrains model.",
		icon: ScanSearch,
		iconClassName: "text-secondary",
	},
];

export interface LandingPageProps {
	searchParams?: Promise<{
		tweetUrlOrId?: string | string[];
		analyze?: string | string[];
	}>;
}

function firstQueryValue(value?: string | string[]): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

async function resolveIsAuthenticated(): Promise<boolean> {
	try {
		const session = await getServerAuthSession();
		const userId = session?.user?.id?.trim() ?? "";
		return userId.length > 0;
	} catch {
		return false;
	}
}

export default async function LandingPage({ searchParams }: Readonly<LandingPageProps>) {
	const resolvedSearchParams = (await searchParams) ?? {};
	const initialTweetUrlOrId = firstQueryValue(resolvedSearchParams.tweetUrlOrId) ?? "";
	const autoAnalyze = firstQueryValue(resolvedSearchParams.analyze) === "1";
	const isAuthenticated = await resolveIsAuthenticated();
	const navCtaHref = isAuthenticated ? "/account" : twitterLoginPath;
	const navCtaLabel = isAuthenticated ? "Account" : "Connect";
	const footerCtaLabel = isAuthenticated ? "Open Workspace" : "Authenticate with X";
	const footerCtaHref = isAuthenticated ? "/app" : twitterLoginPath;
	const githubRepoUrl = "https://github.com/moeghashim/tenbrains";

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
					<div className="hidden items-center gap-12 md:flex">
						{workspaceMenuLinks.map((item) => (
							<Link
								key={item.label}
								href={item.href}
								className="font-mono text-sm uppercase tracking-[0.35em] text-secondary transition-colors hover:text-primary"
							>
								{item.label}
							</Link>
						))}
					</div>
					<Link
						href={navCtaHref}
						id="nav-cta"
						className="bg-primary-container px-6 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-on-primary-container transition-transform hover:scale-[1.02]"
					>
						{navCtaLabel}
					</Link>
				</div>
			</nav>

			<main className="relative z-10 pt-20">
				<section className="relative overflow-hidden px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
					<div className="mx-auto flex min-h-[640px] w-full max-w-[1440px] flex-col items-center justify-center text-center">
						<Reveal className="flex w-full flex-col items-center">
							<div className="mb-6 flex items-center gap-4">
								<span className="h-2 w-2 bg-primary" />
								<p className="font-label text-[11px] uppercase tracking-[0.5em] text-secondary/70">
									X analysis workspace
								</p>
							</div>
							<h1 className="max-w-5xl font-headline text-[3.25rem] font-bold uppercase leading-[0.95] tracking-[-0.04em] text-on-surface sm:text-[5rem] lg:text-[6.4rem]">
								Turn X posts into
								<span className="text-glow text-primary"> structured learning</span>
							</h1>
							<p className="mt-6 max-w-2xl font-body text-base leading-7 text-on-surface-variant sm:text-lg">
								Tenbrains analyzes tweets, saves bookmarks, tracks creators, and builds daily account takeaways so useful
								ideas are easier to revisit than the timeline they came from.
							</p>
							<div className="mt-10 w-full max-w-4xl">
								<HeroTweetAnalyzer
									initialTweetUrlOrId={initialTweetUrlOrId}
									autoAnalyze={autoAnalyze}
									showProviderSelector={false}
									showModelSelector={false}
									theme="obsidian"
								/>
							</div>
							<p className="mt-4 font-label text-[10px] uppercase tracking-[0.45em] text-secondary/40">
								Web app, CLI, and X extension workflows
							</p>
						</Reveal>
					</div>
				</section>

				<section className="border-y border-outline-variant/10 bg-surface-container-low px-6 py-20 sm:px-10 lg:px-16 lg:py-32">
					<div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-16">
						<Reveal className="space-y-8">
							<div className="flex items-center gap-4">
								<span className="h-2 w-2 bg-secondary/30" />
								<h2 className="font-label text-[11px] uppercase tracking-[0.5em] text-secondary">Input</h2>
							</div>
							<div className="bg-surface-container-lowest p-8 font-label text-sm leading-7 text-secondary/70">
								<p className="mb-4 text-[10px] uppercase tracking-[0.38em] text-primary/50">What goes in</p>
								<ul className="space-y-3">
									<li>Analyze any X post from a URL or status ID.</li>
									<li>Save tagged bookmarks to build a reusable research trail.</li>
									<li>Follow creators and subjects in the web app or from analysis results.</li>
									<li>Refresh account takeaways from the latest 20 posts of followed accounts.</li>
								</ul>
							</div>
						</Reveal>

						<Reveal className="relative space-y-8">
							<div className="flex items-center gap-4">
								<span className="h-2 w-2 bg-primary" />
								<h2 className="font-label text-[11px] uppercase tracking-[0.5em] text-primary">Output</h2>
							</div>
							<div className="emerald-glow relative overflow-hidden bg-surface-container-high p-8">
								<div className="absolute right-6 top-6 font-label text-[10px] uppercase tracking-[0.35em] text-primary/70">
									From the product
								</div>
								<div className="space-y-6">
									<div>
										<p className="mb-2 font-label text-[10px] uppercase tracking-[0.35em] text-primary/60">
											What comes back
										</p>
										<p className="font-headline text-2xl italic leading-tight text-on-surface">
											A post becomes a usable record: core topic, concise summary, author intent, five novel concepts, and
											optional next-step learning.
										</p>
									</div>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div className="border-l border-primary/30 pl-4">
											<p className="mb-1 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/40">For a post</p>
											<p className="font-label text-2xl text-primary">Analysis + learning track</p>
										</div>
										<div className="border-l border-primary/30 pl-4">
											<p className="mb-1 font-label text-[10px] uppercase tracking-[0.35em] text-secondary/40">For an account</p>
											<p className="font-label text-2xl text-primary">Daily takeaway history</p>
										</div>
									</div>
								</div>
							</div>
						</Reveal>
					</div>
				</section>

				<section className="px-6 py-20 sm:px-10 lg:px-16 lg:py-32">
					<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-16">
						<Reveal className="flex flex-col gap-6 border-b border-outline-variant/10 pb-8 md:flex-row md:items-end md:justify-between">
							<div>
								<h2 className="font-headline text-4xl uppercase tracking-[-0.03em] text-on-surface sm:text-5xl">
									Core Workflows
								</h2>
								<p className="mt-4 max-w-2xl font-body text-base leading-7 text-on-surface-variant">
									The public product has grown past one analyzer. Tenbrains now connects post analysis, bookmarks,
									following, account takeaways, and CLI refresh flows into one working system.
								</p>
							</div>
							<p className="font-label text-[10px] uppercase tracking-[0.45em] text-secondary/40">Built from the current README and progress log</p>
						</Reveal>

						<div className="grid grid-cols-1 gap-px bg-outline-variant/10 md:grid-cols-2 lg:grid-cols-4">
							{architectureCards.map((card) => {
								const Icon = card.icon;
								return (
									<Reveal key={card.title} className="group bg-surface p-10 transition-colors hover:bg-surface-container-low">
										<div className="flex h-14 w-14 items-center justify-center border border-outline-variant/20 bg-surface-container-lowest">
											<Icon className={`h-8 w-8 transition-colors group-hover:text-primary ${card.iconClassName}`} />
										</div>
										<div className="mt-8">
											<h3 className="mb-4 font-mono text-sm uppercase tracking-[0.28em] text-secondary">{card.title}</h3>
											<p className="font-label text-xs uppercase leading-7 tracking-[0.2em] text-secondary/50">
												{card.description}
											</p>
										</div>
									</Reveal>
								);
							})}
						</div>
					</div>
				</section>

				<section className="px-6 pb-24 sm:px-10 lg:px-16 lg:pb-32">
					<Reveal className="mx-auto flex w-full max-w-[1440px] flex-col items-center overflow-hidden bg-surface-container-low px-8 py-16 text-center sm:px-12 lg:px-20 lg:py-20">
						<div className="obsidian-noise pointer-events-none absolute inset-0 opacity-15" />
						<div className="relative z-10 flex max-w-4xl flex-col items-center">
							<h2 className="font-headline text-[3rem] uppercase tracking-[-0.04em] text-on-surface sm:text-[4.5rem] lg:text-[5.5rem]">
								Start with one post, keep the trail
							</h2>
							<p className="mt-6 max-w-2xl font-label text-xs uppercase tracking-[0.34em] text-secondary/60 sm:text-[13px]">
								Sign in with X to analyze posts in the web app, save bookmarks, follow creators, and build daily takeaways
								you can inspect and refresh over time.
							</p>
							<Link
								href={footerCtaHref}
								id="final-cta"
								className="mt-10 inline-flex items-center gap-3 bg-primary-container px-10 py-5 font-mono text-xs font-bold uppercase tracking-[0.38em] text-on-primary-container transition-shadow hover:shadow-[0_0_30px_rgba(110,229,145,0.3)]"
							>
								{footerCtaLabel}
								<ArrowUpRight className="h-4 w-4 text-on-primary-container/80" />
							</Link>
							<div className="mt-10 flex items-center gap-6 opacity-40">
								<div className="h-px w-16 bg-secondary" />
								<span className="font-label text-[10px] uppercase tracking-[0.45em] text-secondary">Ready for the next useful post</span>
								<div className="h-px w-16 bg-secondary" />
							</div>
						</div>
					</Reveal>
				</section>
			</main>

			<footer className="relative z-10 border-t border-outline-variant/10 bg-surface px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 md:flex-row md:items-center md:justify-between">
					<div className="font-label text-[10px] uppercase tracking-[0.24em] text-secondary/60">
						© 2026 Tenbrains. Built by @moeghashim as part of 10claws.com.
					</div>
					<div className="flex flex-wrap justify-end gap-8 self-end md:ml-auto">
						<Link
							href="/privacy"
							className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/60 transition-colors hover:text-primary"
						>
							Privacy
						</Link>
						<a
							href={githubRepoUrl}
							className="font-mono text-[10px] uppercase tracking-[0.24em] text-secondary/60 transition-colors hover:text-primary"
						>
							GitHub
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
