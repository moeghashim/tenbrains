import Link from "next/link";
import React from "react";

import { AppWorkspaceNav } from "../../components/app-workspace-nav.js";
import { AccountSettingsPanel } from "../../components/account-settings-panel.js";
import { SignOutButton } from "../../components/sign-out-button.js";

export default function AccountPage() {
	return (
		<div className="min-h-screen bg-surface text-on-surface">
			<AppWorkspaceNav ctaHref="/app" ctaLabel="Back to Workspace" />
			<main className="px-6 pb-16 pt-10 sm:px-10 lg:px-16">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10">
					<section className="relative overflow-hidden border border-outline-variant/10 bg-surface-container-low">
						<div className="obsidian-radial absolute inset-0 opacity-70" />
						<div className="relative z-10 p-8 md:p-10">
							<div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
								<div className="max-w-3xl">
									<p className="font-mono text-[11px] uppercase tracking-[0.38em] text-primary">Identity node</p>
									<h1 className="mt-4 font-headline text-4xl uppercase tracking-[-0.03em] text-on-surface md:text-5xl">
										Account Settings
									</h1>
									<p className="mt-4 max-w-2xl font-body text-sm leading-7 text-on-surface-variant md:text-base">
										Configure your default model stack, keep provider keys current, and control the session that powers the rest of the Tenbrains workspace.
									</p>
								</div>

								<div className="grid gap-px border border-outline-variant/10 bg-outline-variant/10 sm:grid-cols-2 lg:min-w-[420px]">
									<div className="bg-surface-container p-5">
										<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Workspace</p>
										<p className="mt-3 font-body text-sm leading-6 text-on-surface-variant">
											Return to the analyzer and bookmark views after updating your defaults.
										</p>
									</div>
									<Link
										href="/app"
										className="flex items-center justify-between gap-4 bg-surface-container px-5 py-5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:text-primary"
									>
										<span>Back to Workspace</span>
										<span aria-hidden="true">/</span>
									</Link>
								</div>
							</div>

							<div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
								<div className="border border-outline-variant/10 bg-surface p-6 md:p-8">
									<AccountSettingsPanel />
								</div>
								<aside className="flex flex-col gap-4">
									<div className="border border-outline-variant/10 bg-surface-container p-6">
										<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Control notes</p>
										<h2 className="mt-4 font-headline text-2xl uppercase tracking-[-0.02em] text-on-surface">
											Session and access
										</h2>
										<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
											Provider keys are stored per account so analysis defaults follow you across the workspace.
										</p>
									</div>
									<div className="border border-outline-variant/10 bg-surface-container p-6">
										<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Session</p>
										<div className="mt-4">
											<SignOutButton />
										</div>
									</div>
								</aside>
							</div>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
