import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { zipSync } from "fflate";

const projectDir = process.cwd();
const distDir = path.join(projectDir, "dist");
const packageJsonPath = path.join(projectDir, "package.json");

async function collectFiles(rootDir, currentDir = rootDir) {
	const entries = await readdir(currentDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const absolutePath = path.join(currentDir, entry.name);
		const relativePath = path.relative(rootDir, absolutePath);
		if (relativePath.endsWith(".zip")) {
			continue;
		}
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(rootDir, absolutePath)));
			continue;
		}
		if (entry.isFile()) {
			files.push(relativePath);
		}
	}

	return files;
}

async function main() {
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
	const zipName = `tenbrains-for-x-${packageJson.version}.zip`;
	const zipPath = path.join(distDir, zipName);
	const distStats = await stat(distDir).catch(() => null);

	if (!distStats?.isDirectory()) {
		throw new Error("Build output not found. Run the extension build first.");
	}

	await rm(zipPath, { force: true });

	const files = await collectFiles(distDir);
	const archiveInput = {};

	for (const relativePath of files) {
		const filePath = path.join(distDir, relativePath);
		archiveInput[relativePath] = await readFile(filePath);
	}

	const zipped = zipSync(archiveInput, {
		level: 9,
	});

	await mkdir(distDir, { recursive: true });
	await writeFile(zipPath, zipped);
	process.stdout.write(`${zipPath}\n`);
}

await main();
