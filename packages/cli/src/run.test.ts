import { describe, expect, it } from "vitest";
import { CLI_VERSION, run } from "./run.js";

describe("hunt CLI", () => {
  it("prints the version for --version", () => {
    expect(run(["--version"])).toEqual({ exitCode: 0, output: CLI_VERSION });
  });

  it("prints the version for -v", () => {
    expect(run(["-v"])).toEqual({ exitCode: 0, output: CLI_VERSION });
  });

  it("prints usage and exits 0 for --help", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Usage:");
  });

  it("prints usage and exits 1 when invoked with no arguments", () => {
    const result = run([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
  });

  it("reports unknown commands and exits 1", () => {
    const result = run(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: frobnicate");
  });
});
