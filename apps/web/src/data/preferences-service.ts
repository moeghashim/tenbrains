import { resolveProviderCatalogModel } from "@tenbrains/ai";
import {
	type ProviderId,
	UserPreferencesInputSchema,
	UserPreferencesResultSchema,
	type UserPreferencesInput,
	type UserPreferencesResult,
} from "@tenbrains/contracts";

export interface StoredUser {
	id: string;
	xUserId: string;
	email: string | null;
	name: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface PreferencesStore {
	usersByXId: Map<string, StoredUser>;
	preferencesByUserId: Map<string, UserPreferencesResult>;
	nextUserId: number;
}

export interface UserIdentityInput {
	xUserId: string;
	email?: string | null;
	name?: string | null;
}

const DEFAULT_PREFERENCES: Omit<UserPreferencesResult, "userId" | "updatedAt"> = {
	defaultProvider: "openai",
	defaultModel: resolveProviderCatalogModel("openai"),
	learningMinutes: 10,
};

export const DEFAULT_PROVIDER: ProviderId = "openai";

export function createPreferencesStore(): PreferencesStore {
	return {
		usersByXId: new Map<string, StoredUser>(),
		preferencesByUserId: new Map<string, UserPreferencesResult>(),
		nextUserId: 1,
	};
}

export function upsertUserByXId(store: PreferencesStore, identity: UserIdentityInput, now: number): StoredUser {
	const existing = store.usersByXId.get(identity.xUserId);
	if (existing) {
		const updated: StoredUser = {
			...existing,
			email: identity.email ?? existing.email,
			name: identity.name ?? existing.name,
			updatedAt: now,
		};
		store.usersByXId.set(identity.xUserId, updated);
		return updated;
	}

	const created: StoredUser = {
		id: `user_${store.nextUserId}`,
		xUserId: identity.xUserId,
		email: identity.email ?? null,
		name: identity.name ?? null,
		createdAt: now,
		updatedAt: now,
	};
	store.nextUserId += 1;
	store.usersByXId.set(identity.xUserId, created);
	return created;
}

export function getOrCreatePreferences(store: PreferencesStore, userId: string, now: number): UserPreferencesResult {
	const existing = store.preferencesByUserId.get(userId);
	if (existing) {
		return existing;
	}

	const created = UserPreferencesResultSchema.parse({
		userId,
		...DEFAULT_PREFERENCES,
		updatedAt: now,
	});
	store.preferencesByUserId.set(userId, created);
	return created;
}

export function updatePreferences(
	store: PreferencesStore,
	userId: string,
	input: UserPreferencesInput,
	now: number,
): UserPreferencesResult {
	const parsedInput = UserPreferencesInputSchema.parse(input);
	const updated = UserPreferencesResultSchema.parse({
		userId,
		...parsedInput,
		updatedAt: now,
	});
	store.preferencesByUserId.set(userId, updated);
	return updated;
}
