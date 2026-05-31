"use client";

import { signOut } from "next-auth/react";
import React from "react";

export function NavSignOutButton() {
	const [isSigningOut, setIsSigningOut] = React.useState(false);

	const handleClick = async () => {
		if (isSigningOut) {
			return;
		}
		setIsSigningOut(true);
		try {
			await signOut({ callbackUrl: "/" });
		} catch {
			setIsSigningOut(false);
		}
	};

	return (
		<button
			id="nav-sign-out"
			type="button"
			onClick={() => {
				void handleClick();
			}}
			disabled={isSigningOut}
			aria-label="Sign out"
			className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary/70 transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
		>
			{isSigningOut ? "Signing Out..." : "Sign Out"}
		</button>
	);
}
