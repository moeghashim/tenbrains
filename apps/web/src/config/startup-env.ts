import { readXApiConfigFromEnv } from "@tenbrains/x-client";

type EnvMap = Record<string, string | undefined>;

export interface StartupEnv {
	authSecret: string;
	authXId: string;
	authXSecret: string;
	convexUrl: string;
	convexDeployment: string;
	convexDeployKey: string;
	userSecretsEncryptionKey: string;
}

export interface MiddlewareStartupEnv {
	authSecret: string;
}

let hasValidated = false;
let hasValidatedMiddleware = false;

function readRequiredEnv(name: string, env: EnvMap): string {
	const value = env[name];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value.trim();
}

function validateProductionConvexTarget(convexDeployment: string, env: EnvMap): void {
	if (env.VERCEL_ENV !== "production") {
		return;
	}
	if (convexDeployment.startsWith("dev:")) {
		throw new Error(
			`Invalid production Convex deployment target: ${convexDeployment}. Production must not use a dev deployment.`,
		);
	}
}

export function validateStartupEnv(env: EnvMap = process.env): StartupEnv {
	readXApiConfigFromEnv(env as NodeJS.ProcessEnv);
	const convexDeployment = readRequiredEnv("CONVEX_DEPLOYMENT", env);
	validateProductionConvexTarget(convexDeployment, env);
	return {
		authSecret: readRequiredEnv("AUTH_SECRET", env),
		authXId: readRequiredEnv("AUTH_X_ID", env),
		authXSecret: readRequiredEnv("AUTH_X_SECRET", env),
		convexUrl: readRequiredEnv("NEXT_PUBLIC_CONVEX_URL", env),
		convexDeployment,
		convexDeployKey: readRequiredEnv("CONVEX_DEPLOY_KEY", env),
		userSecretsEncryptionKey: readRequiredEnv("USER_SECRETS_ENCRYPTION_KEY", env),
	};
}

export function validateStartupEnvIfNeeded(env: EnvMap = process.env): void {
	if (env.NODE_ENV === "test" || env.SKIP_STARTUP_ENV_VALIDATION === "1") {
		return;
	}
	if (hasValidated) {
		return;
	}
	validateStartupEnv(env);
	hasValidated = true;
}

export function validateMiddlewareEnv(env: EnvMap = process.env): MiddlewareStartupEnv {
	return {
		authSecret: readRequiredEnv("AUTH_SECRET", env),
	};
}

export function validateMiddlewareEnvIfNeeded(env: EnvMap = process.env): void {
	if (env.NODE_ENV === "test" || env.SKIP_STARTUP_ENV_VALIDATION === "1") {
		return;
	}
	if (hasValidatedMiddleware) {
		return;
	}
	validateMiddlewareEnv(env);
	hasValidatedMiddleware = true;
}
