#!/usr/bin/env node
import { loadEnvFile } from "./load-env.js";
import { run } from "./run.js";

// Load .env into process.env before anything reads configuration.
loadEnvFile();

const { exitCode, output } = await run(process.argv.slice(2));
console.log(output);
process.exitCode = exitCode;
