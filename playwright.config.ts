import { defineConfig } from "@playwright/test";
import { globSync } from "node:fs";
import { homedir } from "node:os";

const executablePath =
  process.env.CHROME_PATH ??
  globSync(`${homedir()}/.agent-browser/browsers/chrome-*/chrome`).at(-1);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:8787",
    headless: true,
    launchOptions: { executablePath },
  },
  reporter: "list",
});
