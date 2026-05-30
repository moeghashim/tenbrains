import { getProviderApiKeyForSession } from "../server/convex-admin.js";

interface SessionUserIdentity {
	id: string;
	email?: string | null;
	name?: string | null;
}

interface EnvMap {
	[key: string]: string | undefined;
	PLATFORM_OPENAI_API_KEY?: string;
}

interface ProviderKeyResolver {
	(input: {
		sessionUser: SessionUserIdentity;
		provider: "openai";
		env?: EnvMap;
	}): Promise<string | null>;
}

export interface ResolveEmbeddingKeyInput {
	sessionUser: SessionUserIdentity;
	env?: EnvMap;
	getProviderApiKeyForSession?: ProviderKeyResolver;
}

function readPlatformOpenAiKey(env: EnvMap): string | null {
	const value = env.PLATFORM_OPENAI_API_KEY?.trim();
	return value && value.length > 0 ? value : null;
}

export async function resolveEmbeddingKey({
	sessionUser,
	env = process.env,
	getProviderApiKeyForSession: resolveProviderKey = getProviderApiKeyForSession,
}: ResolveEmbeddingKeyInput): Promise<string | null> {
	try {
		const userKey = await resolveProviderKey({
			sessionUser,
			provider: "openai",
			env,
		});
		const trimmedUserKey = userKey?.trim();
		if (trimmedUserKey) {
			return trimmedUserKey;
		}
	} catch {
		return readPlatformOpenAiKey(env);
	}

	return readPlatformOpenAiKey(env);
}
