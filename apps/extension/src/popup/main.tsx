import type { ExtensionSessionStatus } from "@tenbrains/contracts";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { APP_BASE_URL } from "../shared/config.js";
import { checkSession } from "../content/runtime.js";
import "./popup.css";

function PopupApp() {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [session, setSession] = useState<ExtensionSessionStatus | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		void (async () => {
			const response = await checkSession();
			if (!response.ok) {
				setErrorMessage(response.message);
				setStatus("error");
				return;
			}

			setSession(response.data);
			setStatus("ready");
		})();
	}, []);

	const signInHref = `${APP_BASE_URL}/auth/popup-start?redirect_url=%2Fapp`;

	return (
		<main className="popup-shell">
			<section className="popup-card">
				<p className="popup-kicker">Tenbrains for X</p>
				<h1 className="popup-title">Analyze public X posts and save tagged insights to Tenbrains.</h1>
			</section>

			<section className="popup-card popup-row">
				<p className="popup-kicker">Status</p>
				{status === "loading" ? <p className="popup-copy">Checking Tenbrains sign-in...</p> : null}
				{status === "error" ? <p className="popup-copy">{errorMessage}</p> : null}
				{status === "ready" && session ? (
					session.authenticated ? (
						<>
							<p className="popup-copy">
								Signed in as <strong>@{session.user?.xUsername ?? session.user?.id}</strong>.
							</p>
							<div className="popup-link-grid">
								<a className="popup-link" href={`${APP_BASE_URL}/app`} target="_blank" rel="noreferrer">
									Open Dashboard
								</a>
								<a className="popup-link popup-link--secondary" href={`${APP_BASE_URL}/app/bookmarks`} target="_blank" rel="noreferrer">
									Bookmarks
								</a>
							</div>
						</>
					) : (
						<>
							<p className="popup-copy">You need a Tenbrains account connected with X before the extension can analyze or save tweets.</p>
							<a className="popup-link" href={signInHref} target="_blank" rel="noreferrer">
								Sign in with X
							</a>
						</>
					)
				) : null}
			</section>

			<section className="popup-card popup-row">
				<p className="popup-kicker">Privacy</p>
				<p className="popup-meta">Need policy or contact details for review, publishing, or troubleshooting?</p>
				<div className="popup-link-grid">
					<a className="popup-link popup-link--secondary" href={`${APP_BASE_URL}/privacy`} target="_blank" rel="noreferrer">
						Privacy
					</a>
				</div>
			</section>
		</main>
	);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Popup root element not found.");
}

createRoot(rootElement).render(
	<React.StrictMode>
		<PopupApp />
	</React.StrictMode>,
);
