import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("hunt analyze (integration: deterministic, no AI)", () => {
  const cleanEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  async function importedJobId(huntHome: string): Promise<string> {
    const imported = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    expect(imported.exitCode).toBe(0);
    return /job id: (job_[0-9a-f]+)/.exec(imported.output)![1]!;
  }

  it("analyzes an imported job against the profile (M3 exit criterion)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const jobId = await importedJobId(huntHome);

    const result = await run(["analyze", jobId], { huntHome });
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Fit \d+\/100 — Senior Backend Engineer @ Initech/);
    // The Greenhouse fixture demands Go/Kubernetes; the example profile lacks them.
    expect(result.output).toContain("Missing skills:");
    expect(result.output).toContain("kubernetes");
    expect(result.output).toContain("Seniority:");
    expect(result.output).toContain("Compensation: 85000–105000 EUR per year");
    expect(result.output).toContain("deterministic");
    expect(result.output).toContain("no AI provider configured");
  });

  it("re-analysis is stable: same score, same analysis id", async () => {
    cleanEnv();
    const huntHome = tempHome();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const jobId = await importedJobId(huntHome);

    const first = await run(["analyze", jobId], { huntHome });
    const second = await run(["analyze", jobId], { huntHome });
    const scoreOf = (out: string) => /Fit (\d+)\/100/.exec(out)![1];
    const idOf = (out: string) => /Analysis id: (ana_[0-9a-f]+)/.exec(out)![1];
    expect(scoreOf(second.output)).toBe(scoreOf(first.output));
    expect(idOf(second.output)).toBe(idOf(first.output));
  });

  it("fails helpfully for an unknown job id", async () => {
    cleanEnv();
    const huntHome = tempHome();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const result = await run(["analyze", "job_nope"], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("job not found");
  });

  it("fails helpfully when no profile exists", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const jobId = await importedJobId(huntHome);
    const result = await run(["analyze", jobId], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("hunt profile import");
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

describe("hunt resume / letter / approve (full generation pipeline, M4 exit)", () => {
  const clearAiEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  /**
   * A fake Ollama that reads the composer prompt, grabs a real candidate fact
   * id from it, and returns a draft grounded in that fact — exercising the
   * real gateway → provider → claim-trace → render → persist path. `mode`
   * controls whether the first draft is clean, or fabricates a metric so the
   * bounded repair loop must engage.
   */
  function fakeComposerOllama(kind: "resume" | "letter", mode: "clean" | "repair-first") {
    let calls = 0;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const prompt = JSON.parse(body).messages.map((m: { content: string }) => m.content).join("\n");
        const factId = /\b(exp_[0-9a-f]+|ach_[0-9a-f]+|skill_[0-9a-f]+)\b/.exec(prompt)?.[1] ?? "exp_0";
        calls++;
        const fabricate = mode === "repair-first" && calls === 1;
        const bulletText = fabricate
          ? "Delivered 9999% throughput gains"
          : "Delivered measurable engineering impact";
        const bullet = { text: bulletText, sourceFactIds: [factId] };
        const content =
          kind === "resume"
            ? JSON.stringify({
                summary: { text: "Senior software engineer", sourceFactIds: [factId] },
                sections: [{ heading: "Experience", bullets: [bullet] }],
              })
            : JSON.stringify({
                hook: { text: "I am excited about this role", sourceFactIds: [factId] },
                body: [bullet],
                closing: { text: "Thank you for your consideration", sourceFactIds: [factId] },
              });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ message: { content } }));
      });
    });
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (typeof address === "object" && address) resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  async function setup(huntHome: string): Promise<string> {
    clearAiEnv();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const imported = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    const jobId = /job id: (job_[0-9a-f]+)/.exec(imported.output)![1]!;
    await run(["analyze", jobId], { huntHome }); // deterministic, no AI needed
    return jobId;
  }

  it("generates a grounded resume draft, renders HTML, and approves it", async () => {
    const huntHome = tempHome();
    const jobId = await setup(huntHome);
    const url = await fakeComposerOllama("resume", "clean");
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(clearAiEnv);

    const gen = await run(["resume", jobId], { huntHome });
    expect(gen.exitCode).toBe(0);
    expect(gen.output).toContain("Drafted resume:");
    expect(gen.output).toMatch(/rendered: .*resume\.html/);
    expect(gen.output).toContain("hunt approve");

    const docId = /Drafted resume: (doc_[0-9a-f]+)/.exec(gen.output)![1]!;
    const renderedPath = /rendered: (\S+resume\.html)/.exec(gen.output)![1]!;
    // The rendered file is a self-contained HTML document on disk.
    const html = readFileSync(renderedPath, "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Delivered measurable engineering impact");

    const approve = await run(["approve", docId], { huntHome });
    expect(approve.exitCode).toBe(0);
    expect(approve.output).toContain("now marked sendable");

    // Re-approval is refused (approved documents are immutable).
    const again = await run(["approve", docId], { huntHome });
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain("already approved");
  });

  it("engages the bounded repair loop when the first draft fabricates a metric", async () => {
    const huntHome = tempHome();
    const jobId = await setup(huntHome);
    const url = await fakeComposerOllama("resume", "repair-first");
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(clearAiEnv);

    const gen = await run(["resume", jobId], { huntHome });
    expect(gen.exitCode).toBe(0);
    expect(gen.output).toContain("repair rounds: 1");
  });

  it("generates a grounded cover letter draft", async () => {
    const huntHome = tempHome();
    const jobId = await setup(huntHome);
    const url = await fakeComposerOllama("letter", "clean");
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(clearAiEnv);

    const gen = await run(["letter", jobId], { huntHome });
    expect(gen.exitCode).toBe(0);
    expect(gen.output).toContain("Drafted letter:");
    expect(gen.output).toMatch(/rendered: .*cover_letter\.html/);
  });

  it("refuses to generate without an AI provider (composition needs a model)", async () => {
    const huntHome = tempHome();
    const jobId = await setup(huntHome);
    // No AI env set.
    const gen = await run(["resume", jobId], { huntHome });
    expect(gen.exitCode).toBe(1);
    expect(gen.output).toContain("no AI provider configured");
  });

  it("requires an analysis before generating", async () => {
    clearAiEnv();
    const huntHome = tempHome();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const imported = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    const jobId = /job id: (job_[0-9a-f]+)/.exec(imported.output)![1]!;
    // Skip analyze; configure AI so we reach the analysis check, not the provider check.
    const url = await fakeComposerOllama("resume", "clean");
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(clearAiEnv);

    const gen = await run(["resume", jobId], { huntHome });
    expect(gen.exitCode).toBe(1);
    expect(gen.output).toContain("hunt analyze");
  });
});
