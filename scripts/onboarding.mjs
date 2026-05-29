#!/usr/bin/env node

import { execFile } from "node:child_process";
import process from "node:process";
import readline from "node:readline/promises";
import { promisify } from "node:util";
import { readOpenAIConfig } from "./lib/openai-config.mjs";

const execFileAsync = promisify(execFile);

function printUsage() {
	console.log(
		[
			"Usage:",
			"  npm run onboarding",
			"  npm run onboarding -- --yes",
			"",
			"Options:",
			"  --yes       Auto-run suggested setup steps",
			"  -h, --help  Show help",
		].join("\n"),
	);
}

function parseArgs(argv) {
	let yes = false;
	for (const arg of argv) {
		if (arg === "--yes") {
			yes = true;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			printUsage();
			process.exit(0);
		}
		throw new Error(`Unexpected argument: ${arg}`);
	}
	return { yes };
}

function hasOAuth2User(statusOutput) {
	const lines = statusOutput.split("\n");
	for (const line of lines) {
		const match = line.match(/oauth2:\s*(.+)\s*$/i);
		if (!match) {
			continue;
		}
		const value = match[1].trim();
		if (value && value !== "(none)" && value !== "-" && value !== "–") {
			return true;
		}
	}
	return false;
}

async function runWithInherit(cmd, args) {
	return new Promise((resolve, reject) => {
		const child = execFile(cmd, args, { stdio: "inherit" }, (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
		child.on("error", reject);
	});
}

async function askYesNo(rl, prompt, defaultYes = true) {
	const suffix = defaultYes ? " [Y/n]: " : " [y/N]: ";
	const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();
	if (!answer) {
		return defaultYes;
	}
	return answer === "y" || answer === "yes";
}

async function main() {
	const { yes } = parseArgs(process.argv.slice(2));
	const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
	const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

	try {
		console.log("Tenbrains onboarding");
		console.log("======================");

		let xurlInstalled = false;
		try {
			const { stdout } = await execFileAsync("xurl", ["version"]);
			xurlInstalled = true;
			console.log(`xurl detected: ${stdout.trim()}`);
		} catch {
			console.log("xurl not found on PATH.");
			console.log("Install xurl first:");
			console.log("  brew install --cask xdevplatform/tap/xurl");
		}

		if (xurlInstalled) {
			let statusOutput = "";
			try {
				const { stdout } = await execFileAsync("xurl", ["auth", "status"]);
				statusOutput = stdout;
			} catch (error) {
				statusOutput = String(error?.stdout || "");
			}

			const oauthReady = hasOAuth2User(statusOutput);
			if (oauthReady) {
				console.log("X auth status: ready (OAuth2 user found).");
			} else {
				console.log("X auth status: not ready (no OAuth2 user found).");
				const doAuth = yes || (interactive && (await askYesNo(rl, "Run `xurl auth oauth2` now?")));
				if (doAuth) {
					await runWithInherit("xurl", ["auth", "oauth2"]);
				} else if (!interactive && !yes) {
					console.log("Non-interactive mode: skipped `xurl auth oauth2`.");
				}
			}
		}

		const openaiConfig = await readOpenAIConfig();
		const hasOpenAIKey = typeof openaiConfig.apiKey === "string" && openaiConfig.apiKey.length > 0;
		if (hasOpenAIKey) {
			console.log(`OpenAI setup: ready (default model: ${openaiConfig.defaultModel || "not set"}).`);
		} else {
			console.log("OpenAI setup: not configured.");
			const doOpenAISetup =
				yes || (interactive && (await askYesNo(rl, "Run OpenAI setup now (`npm run xurl:analyze:auth`)?")));
			if (doOpenAISetup) {
				await runWithInherit("npm", ["run", "xurl:analyze:auth"]);
			} else if (!interactive && !yes) {
				console.log("Non-interactive mode: skipped OpenAI setup.");
			}
		}

		console.log("\nDone. Quick checks:");
		console.log("  npm run xurl:status");
		console.log("  npm run xurl:whoami");
		console.log('  npm run xurl:analyze -- "https://x.com/user/status/1234567890"');
	} finally {
		rl?.close();
	}
}

main().catch((error) => {
	console.error(`Error: ${error.message || String(error)}`);
	printUsage();
	process.exit(1);
});
