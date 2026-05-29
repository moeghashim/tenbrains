import type { Metadata } from "next";
import { Inter, Noto_Serif, Space_Grotesk, Space_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import React from "react";

import { AgentationDevtools } from "../components/agentation-devtools.js";
import "./globals.css";

const notoSerif = Noto_Serif({
	subsets: ["latin"],
	weight: ["400", "700"],
	variable: "--font-headline",
});

const inter = Inter({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-label",
});

const spaceMono = Space_Mono({
	subsets: ["latin"],
	weight: ["400", "700"],
	variable: "--font-mono",
});

export const metadata: Metadata = {
	title: "Tenbrains | Analyze X Posts, Bookmarks, and Daily Takeaways",
	description:
		"Tenbrains turns X posts into structured analysis, bookmarks, follows, and daily account takeaways across the web app, CLI, and extension.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" className={`${notoSerif.variable} ${inter.variable} ${spaceGrotesk.variable} ${spaceMono.variable} scroll-smooth`}>
			<head>
				<Script async src="https://www.googletagmanager.com/gtag/js?id=G-0E82J7EL3V" strategy="afterInteractive" />
				<Script id="google-analytics" strategy="afterInteractive">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'G-0E82J7EL3V');
					`}
				</Script>
			</head>
			<body className="font-body antialiased">
				{children}
				<AgentationDevtools />
			</body>
		</html>
	);
}
