"use client";

import { PROVIDER_OPTIONS, getProviderCatalogEntry, resolveProviderCatalogModel } from "@tenbrains/ai";
import type { ProviderCredentialSummary, ProviderId, UserPreferencesResult } from "@tenbrains/contracts";
import { ChevronDown } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

interface PreferencesPayload {
	preferences: UserPreferencesResult;
	credentials: ProviderCredentialSummary[];
}

interface PreferencesErrorPayload {
	error?: {
		message?: string;
	};
}

const DEFAULT_PREFERENCES: UserPreferencesResult = {
	userId: "pending",
	defaultProvider: "openai",
	defaultModel: resolveProviderCatalogModel("openai"),
	learningMinutes: 10,
	updatedAt: 0,
};

export function AccountSettingsPanel() {
	const [preferences, setPreferences] = useState<UserPreferencesResult>(DEFAULT_PREFERENCES);
	const [credentials, setCredentials] = useState<Record<ProviderId, ProviderCredentialSummary | undefined>>({
		openai: undefined,
		google: undefined,
		xai: undefined,
		anthropic: undefined,
	});
	const [message, setMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null);

	async function loadPreferences() {
		const response = await fetch("/api/me/preferences", { credentials: "same-origin" });
		const payload = (await response.json()) as PreferencesPayload | PreferencesErrorPayload;
		if (!response.ok || !("preferences" in payload) || !("credentials" in payload)) {
			const errorPayload = payload as PreferencesErrorPayload;
			throw new Error(errorPayload.error?.message ?? "Unable to load account settings.");
		}
		setPreferences({
			...payload.preferences,
			defaultModel: resolveProviderCatalogModel(payload.preferences.defaultProvider, payload.preferences.defaultModel),
		});
		setCredentials({
			openai: payload.credentials.find((item) => item.provider === "openai"),
			google: payload.credentials.find((item) => item.provider === "google"),
			xai: payload.credentials.find((item) => item.provider === "xai"),
			anthropic: payload.credentials.find((item) => item.provider === "anthropic"),
		});
	}

	useEffect(() => {
		void loadPreferences().catch((error) => {
			setErrorMessage(error instanceof Error ? error.message : "Unable to load account settings.");
		});
	}, []);

	const modelSuggestions = useMemo(
		() => getProviderCatalogEntry(preferences.defaultProvider).models,
		[preferences.defaultProvider],
	);

	async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setMessage(null);
		setErrorMessage(null);
		try {
			const response = await fetch("/api/me/preferences", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					defaultProvider: preferences.defaultProvider,
					defaultModel: preferences.defaultModel,
					learningMinutes: preferences.learningMinutes,
				}),
			});
			const payload = (await response.json()) as { preferences?: UserPreferencesResult; error?: { message?: string } };
			if (!response.ok || !payload.preferences) {
				setErrorMessage(payload.error?.message ?? "Unable to save preferences.");
				return;
			}
			await loadPreferences();
			setMessage("Preferences saved.");
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unable to save preferences.");
		}
	}

	async function saveProviderKey(provider: ProviderId, apiKey: string) {
		setPendingProvider(provider);
		setMessage(null);
		setErrorMessage(null);
		try {
			const response = await fetch(`/api/me/provider-credentials/${provider}`, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ apiKey }),
			});
			const payload = (await response.json()) as {
				credential?: ProviderCredentialSummary;
				error?: { message?: string };
			};
			if (!response.ok || !payload.credential) {
				setErrorMessage(payload.error?.message ?? `Unable to save ${provider} credentials.`);
				return false;
			}
			await loadPreferences();
			setMessage(`${getProviderCatalogEntry(provider).label} key saved.`);
			return true;
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : `Unable to save ${provider} credentials.`);
			return false;
		} finally {
			setPendingProvider(null);
		}
	}

	async function removeProviderKey(provider: ProviderId) {
		setPendingProvider(provider);
		setMessage(null);
		setErrorMessage(null);
		try {
			const response = await fetch(`/api/me/provider-credentials/${provider}`, {
				method: "DELETE",
				credentials: "same-origin",
			});
			if (!response.ok) {
				const payload = (await response.json()) as { error?: { message?: string } };
				setErrorMessage(payload.error?.message ?? `Unable to remove ${provider} credentials.`);
				return;
			}
			await loadPreferences();
			setMessage(`${getProviderCatalogEntry(provider).label} key removed.`);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : `Unable to remove ${provider} credentials.`);
		} finally {
			setPendingProvider(null);
		}
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="grid gap-px border border-outline-variant/10 bg-outline-variant/10 md:grid-cols-[minmax(0,1fr)_280px]">
				<div className="bg-surface-container p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Defaults</p>
					<h2 className="mt-4 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">
						Preference stack
					</h2>
					<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
						Set the provider, model, and study cadence Tenbrains should reach for first when a workflow does not override them.
					</p>
				</div>
				<div className="bg-surface-container-low p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Signals</p>
					<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
						Saved preferences apply across the analyzer, bookmark exports, and any authenticated workspace session.
					</p>
				</div>
			</div>

			<form action="/api/me/preferences" method="post" onSubmit={savePreferences} className="grid gap-5">
				<div className="grid gap-5 lg:grid-cols-2">
					<div>
						<label htmlFor="defaultProvider" className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary/75">
							Default provider
						</label>
						<div className="relative mt-2">
							<select
								id="defaultProvider"
								name="defaultProvider"
								value={preferences.defaultProvider}
								onChange={(event) => {
									const provider = event.target.value as ProviderId;
									setPreferences((current) => ({
										...current,
										defaultProvider: provider,
										defaultModel: getProviderCatalogEntry(provider).defaultModel,
									}));
								}}
								className="w-full appearance-none border border-outline-variant/20 bg-surface-container-lowest px-5 py-4 pr-14 font-body text-sm text-on-surface focus:border-primary focus:outline-none"
							>
								{PROVIDER_OPTIONS.map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.label}
									</option>
								))}
							</select>
							<ChevronDown
								aria-hidden="true"
								className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary/70"
							/>
						</div>
					</div>
					<div>
						<label htmlFor="defaultModel" className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary/75">
							Default model
						</label>
						<input type="hidden" name="defaultModel" value={preferences.defaultModel} />
						<div className="relative mt-2">
							<select
								id="defaultModel"
								value={resolveProviderCatalogModel(preferences.defaultProvider, preferences.defaultModel)}
								onChange={(event) => {
									setPreferences((current) => ({
										...current,
										defaultModel: event.target.value,
									}));
								}}
								className="w-full appearance-none border border-outline-variant/20 bg-surface-container-lowest px-5 py-4 pr-14 font-body text-sm text-on-surface focus:border-primary focus:outline-none"
							>
								{modelSuggestions.map((model) => (
									<option key={model} value={model}>
										{model}
									</option>
								))}
							</select>
							<ChevronDown
								aria-hidden="true"
								className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary/70"
							/>
						</div>
					</div>
				</div>

				<div>
					<label htmlFor="learningMinutes" className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary/75">
						Minutes per day
					</label>
					<input
						id="learningMinutes"
						name="learningMinutes"
						type="number"
						value={preferences.learningMinutes}
						onChange={(event) => {
							setPreferences((current) => ({
								...current,
								learningMinutes: Number(event.target.value),
							}));
						}}
						min={5}
						max={120}
						className="mt-2 w-full border border-outline-variant/20 bg-surface-container-lowest px-5 py-4 font-body text-sm text-on-surface focus:border-primary focus:outline-none"
					/>
				</div>
				<div className="flex flex-wrap gap-3">
					<button
						type="submit"
						className="bg-primary-container px-6 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-on-primary-container transition-transform hover:scale-[1.02]"
					>
						Save Preferences
					</button>
				</div>
			</form>

			<section className="grid gap-4">
				<div className="grid gap-px border border-outline-variant/10 bg-outline-variant/10 md:grid-cols-[minmax(0,1fr)_280px]">
					<div className="bg-surface-container p-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Credentials</p>
						<h3 className="mt-4 font-headline text-3xl uppercase tracking-[-0.03em] text-on-surface">
							Provider API Keys
						</h3>
						<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
							Attach or rotate provider keys without leaving the workspace. Each provider card reflects the current stored state.
						</p>
					</div>
					<div className="bg-surface-container-low p-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-secondary/70">Storage</p>
						<p className="mt-4 font-body text-sm leading-7 text-on-surface-variant">
							Keys stay account-scoped. Remove a key here to disable that provider across future sessions.
						</p>
					</div>
				</div>
				{PROVIDER_OPTIONS.map((provider) => {
					const summary = credentials[provider.id];
					return (
						<form
							key={provider.id}
							onSubmit={(event) => {
								event.preventDefault();
								const formData = new FormData(event.currentTarget);
								const apiKey = String(formData.get("apiKey") ?? "");
								void (async () => {
									const didSave = await saveProviderKey(provider.id, apiKey);
									if (didSave) {
										event.currentTarget.reset();
									}
								})();
							}}
							className="border border-outline-variant/10 bg-surface-container p-5"
						>
							<div className="flex flex-col gap-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="font-headline text-2xl uppercase tracking-[-0.02em] text-on-surface">{provider.label}</p>
										<p className="mt-2 font-body text-sm text-on-surface-variant">{provider.keyHint}</p>
									</div>
									<p className="font-mono text-[11px] uppercase tracking-[0.24em] text-secondary/75">
										{summary?.configured ? summary.keyHint ?? "Configured" : "Not configured"}
									</p>
								</div>
								<input
									type="password"
									name="apiKey"
									placeholder={provider.envVar}
									className="w-full border border-outline-variant/20 bg-surface-container-lowest px-5 py-3 font-body text-sm text-on-surface placeholder:text-secondary/40 focus:border-primary focus:outline-none"
								/>
								<div className="flex flex-wrap gap-3">
									<button
										type="submit"
										disabled={pendingProvider === provider.id}
										className="bg-primary-container px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-on-primary-container disabled:opacity-60"
									>
										{summary?.configured ? "Update Key" : "Save Key"}
									</button>
									<button
										type="button"
										disabled={!summary?.configured || pendingProvider === provider.id}
										onClick={() => {
											void removeProviderKey(provider.id);
										}}
										className="border border-outline-variant/20 px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
									>
										Remove Key
									</button>
								</div>
							</div>
						</form>
					);
				})}
			</section>

			{message ? (
				<p className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface">
					{message}
				</p>
			) : null}
			{errorMessage ? (
				<p role="alert" className="border border-primary/30 bg-primary/10 px-4 py-3 font-body text-sm text-on-surface">
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
