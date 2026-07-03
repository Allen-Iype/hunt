/**
 * CLI argument handling, kept pure (argv in, result out) so it is testable
 * without spawning a process. The bin entrypoint (index.ts) does the I/O.
 *
 * No argument-parsing dependency: `--version` and usage output do not justify
 * one. Revisit when real commands land (M2+).
 */

export const CLI_VERSION = "0.0.1";

export interface RunResult {
  exitCode: number;
  output: string;
}

const USAGE = `hunt — a local-first AI career operating system

Usage:
  hunt --version    Print the Hunt version

Commands arrive with upcoming milestones (import, analyze, resume, letter, track).`;

export function run(argv: readonly string[]): RunResult {
  const [first] = argv;

  if (first === "--version" || first === "-v") {
    return { exitCode: 0, output: CLI_VERSION };
  }

  if (first === undefined || first === "--help" || first === "-h") {
    return { exitCode: first === undefined ? 1 : 0, output: USAGE };
  }

  return { exitCode: 1, output: `Unknown command: ${first}\n\n${USAGE}` };
}
