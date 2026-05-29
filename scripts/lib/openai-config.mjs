import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_CONFIG_DIR = path.join(homedir(), ".config", "tenbrains");
const LEGACY_CONFIG_DIR = path.join(homedir(), ".config", "rabbitbrain");
const CONFIG_DIR = process.env.TENBRAINS_CONFIG_DIR
	? path.resolve(process.env.TENBRAINS_CONFIG_DIR)
	: process.env.RABBITBRAIN_CONFIG_DIR
		? path.resolve(process.env.RABBITBRAIN_CONFIG_DIR)
		: DEFAULT_CONFIG_DIR;

export const OPENAI_CONFIG_PATH = path.join(CONFIG_DIR, "openai-analyze.json");
const LEGACY_OPENAI_CONFIG_PATH = path.join(LEGACY_CONFIG_DIR, "openai-analyze.json");

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const RECOMMENDED_MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];

export async function readOpenAIConfig() {
	try {
		const raw = await readFile(OPENAI_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		return parsed;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			if (CONFIG_DIR !== LEGACY_CONFIG_DIR) {
				const legacyConfig = await readLegacyOpenAIConfig();
				if (legacyConfig) {
					return legacyConfig;
				}
			}
			return {};
		}
		throw new Error(`Failed to read OpenAI config at ${OPENAI_CONFIG_PATH}: ${String(error)}`);
	}
}

async function readLegacyOpenAIConfig() {
	try {
		const raw = await readFile(LEGACY_OPENAI_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		return parsed;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw new Error(`Failed to read legacy OpenAI config at ${LEGACY_OPENAI_CONFIG_PATH}: ${String(error)}`);
	}
}

export async function writeOpenAIConfig(config) {
	await mkdir(CONFIG_DIR, { recursive: true });
	const tempPath = `${OPENAI_CONFIG_PATH}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	await chmod(tempPath, 0o600);
	await rename(tempPath, OPENAI_CONFIG_PATH);
}
