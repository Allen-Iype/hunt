#!/usr/bin/env node
import { run } from "./run.js";

const { exitCode, output } = run(process.argv.slice(2));
console.log(output);
process.exitCode = exitCode;
