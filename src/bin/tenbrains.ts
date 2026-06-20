#!/usr/bin/env node
import "./preflight.js";
import { run } from "../cli.js";

run(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`tenbrains: fatal: ${message}\n`);
  process.exitCode = 1;
});
