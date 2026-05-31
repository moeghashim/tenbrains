import Link from "next/link";
import React from "react";

import { BrandMark } from "./brand-mark.js";
import { NavSignOutButton } from "./nav-sign-out-button.js";
import { workspaceMenuLinks, type WorkspaceMenuItem } from "./workspace-menu.js";

export interface AppWorkspaceNavProps {
	activeItem?: WorkspaceMenuItem;
	ctaHref?: string;
	ctaLabel?: string;
	signedIn?: boolean;
}

export function AppWorkspaceNav({
	activeItem,
	ctaHref = "/account",
	ctaLabel = "Account Settings",
	signedIn = false,
}: Readonly<AppWorkspaceNavProps>) {
	return (
		<nav className="sticky top-0 z-40 border-b border-outline-variant/10 bg-surface/95 backdrop-blur-md">
			<div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4 sm:px-10 lg:px-16">
				<Link href="/" id="nav-logo" className="group flex items-center gap-2">
					<BrandMark className="h-8 w-8 transition-transform duration-700 ease-redsun group-hover:-rotate-6 group-hover:scale-105" />
					<span className="font-headline text-2xl font-bold tracking-tight text-primary">Tenbrains</span>
				</Link>

				<div className="hidden items-center gap-10 md:flex">
					{workspaceMenuLinks.map((item) => (
						<Link
							key={item.label}
							href={item.href}
							className={`font-mono text-sm uppercase tracking-[0.32em] transition-colors duration-300 hover:text-primary ${
								item.label === activeItem ? "border-b border-primary pb-1 text-primary" : "text-secondary/70"
							}`}
						>
							{item.label}
						</Link>
					))}
				</div>

				<div className="flex items-center gap-5">
					<Link
						href={ctaHref}
						id="nav-cta"
						className="bg-primary-container px-6 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-on-primary-container transition-transform hover:scale-[1.02]"
					>
						{ctaLabel}
					</Link>
					{signedIn ? <NavSignOutButton /> : null}
				</div>
			</div>
		</nav>
	);
}
