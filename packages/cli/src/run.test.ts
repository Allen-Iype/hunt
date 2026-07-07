import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CLI_VERSION, run } from "./run.js";

const EXAMPLE_PROFILE = fileURLToPath(
  new URL("../../../examples/profile.example.yaml", import.meta.url),
);
const fixture = (name: string) =>
  fileURLToPath(new URL(`../../ingestion/src/testing/fixtures/${name}`, import.meta.url));

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "hunt-cli-test-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe("hunt CLI basics", () => {
  it("prints the version for --version and -v", async () => {
    expect(await run(["--version"])).toEqual({ exitCode: 0, output: CLI_VERSION });
    expect(await run(["-v"])).toEqual({ exitCode: 0, output: CLI_VERSION });
  });

  it("prints usage and exits 0 for --help", async () => {
    const result = await run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Usage:");
  });

  it("prints usage and exits 1 when invoked with no arguments", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage:");
  });

  it("reports unknown commands and exits 1", async () => {
    const result = await run(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: frobnicate");
  });
});

describe("hunt profile (integration)", () => {
  it("imports the example profile and shows it", async () => {
    const huntHome = tempHome();
    const imported = await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    expect(imported.exitCode).toBe(0);
    expect(imported.output).toContain("Imported profile for Ada Example");

    const shown = await run(["profile", "show"], { huntHome });
    expect(shown.exitCode).toBe(0);
    expect(shown.output).toContain("Ada Example — Senior Software Engineer");
  });

  it("surfaces validation errors with the failing field", async () => {
    const huntHome = tempHome();
    const badFile = join(huntHome, "bad.yaml");
    writeFileSync(badFile, "basics:\n  email: ada@example.com\n");
    const result = await run(["profile", "import", badFile], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Profile import failed (validate)");
    expect(result.output).toContain("name");
  });

  it("tells the user how to start when no profile exists", async () => {
    const result = await run(["profile", "show"], { huntHome: tempHome() });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("hunt profile import");
  });
});

describe("hunt import (integration: no AI configured)", () => {
  const cleanEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  it("imports a JSON-LD page from a file via the structured tier (M2 exit criterion)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const result = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Imported: Senior Backend Engineer @ Initech");
    expect(result.output).toContain("extraction: structured");
  });

  it("imports postings from multiple site shapes (M2 exit criterion)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    for (const [file, title] of [
      ["greenhouse.html", "Senior Backend Engineer"],
      ["lever.html", "Staff Platform Engineer"],
      ["linkedin-jsonld.html", "Senior Software Engineer"],
    ] as const) {
      const result = await run(["import", "--file", fixture(file)], { huntHome });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(title);
    }
  });

  it("re-import reports the dedup outcome", async () => {
    cleanEnv();
    const huntHome = tempHome();
    await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    const again = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    expect(again.exitCode).toBe(0);
    expect(again.output).toContain("Re-imported (updated existing)");
  });

  it("plain text without AI fails fast with configuration guidance (no-AI suite)", async () => {
    cleanEnv();
    const result = await run(["import", "--file", fixture("plain-posting.txt")], {
      huntHome: tempHome(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("ANTHROPIC_API_KEY");
  });

  it("rejects inputs that are neither URL, file, nor stdin marker", async () => {
    const result = await run(["import", "job.pdf"], { huntHome: tempHome() });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Expected a job URL");
  });
});

describe("hunt import (full AI path through a local fake Ollama)", () => {
  function fakeOllama(responseJson: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: { content: responseJson } }));
    });
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (typeof address === "object" && address) {
          resolve({ url: `http://127.0.0.1:${address.port}`, server });
        }
      });
    });
  }

  it("extracts a plain-text posting end to end via the real gateway and provider", async () => {
    const { url } = await fakeOllama(
      JSON.stringify({
        title: "Platform Engineer",
        companyName: "Pied Piper",
        locations: ["Remote, EU"],
        workplaceType: "remote",
        seniority: "senior",
        requirements: [{ text: "5+ years of infrastructure experience", kind: "must" }],
        skills: ["kubernetes", "go"],
        compensationRaw: "EUR 95,000 - 120,000 per year",
      }),
    );
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(() => {
      delete process.env.HUNT_AI_PROVIDER;
      delete process.env.HUNT_OLLAMA_URL;
    });

    const result = await run(["import", "--file", fixture("plain-posting.txt")], {
      huntHome: tempHome(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Imported: Platform Engineer @ Pied Piper");
    expect(result.output).toContain("extraction: ai");
  });

  it("reports a config error for an unknown provider name", async () => {
    process.env.HUNT_AI_PROVIDER = "clippy";
    cleanups.push(() => {
      delete process.env.HUNT_AI_PROVIDER;
    });
    const result = await run(["import", "--file", fixture("plain-posting.txt")], {
      huntHome: tempHome(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('unknown HUNT_AI_PROVIDER "clippy"');
  });
});
