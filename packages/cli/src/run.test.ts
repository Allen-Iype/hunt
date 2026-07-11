import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const cliFixture = (name: string) =>
  fileURLToPath(new URL(`./testing/fixtures/${name}`, import.meta.url));

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

describe("hunt profile from-resume (integration)", () => {
  const cleanEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  it("fails fast with clear guidance when no AI provider is configured", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const resume = join(huntHome, "resume.txt");
    writeFileSync(resume, "Gokul P S\nSoftware Engineer at Acme, 2021–2024\n");
    const out = join(huntHome, "my-profile.yaml");
    const result = await run(["profile", "from-resume", resume, "-o", out], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("(extract)");
    expect(result.output).toContain("no AI provider");
    expect(result.output).toContain("ANTHROPIC_API_KEY");
    // No provider ⇒ nothing written.
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to overwrite an existing output file (before touching AI)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const resume = join(huntHome, "resume.txt");
    writeFileSync(resume, "Gokul P S\n");
    const out = join(huntHome, "exists.yaml");
    writeFileSync(out, "keep me\n");
    const result = await run(["profile", "from-resume", resume, "-o", out], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("already exists");
    expect(readFileSync(out, "utf8")).toBe("keep me\n");
  });

  it("reads a DOCX resume through to extraction (then needs-AI, no provider configured)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const out = join(huntHome, "out.yaml");
    // The DOCX is parsed to text successfully; only fact extraction needs AI, so
    // the failure is the extract stage — proving the reader is wired in.
    const result = await run(["profile", "from-resume", cliFixture("sample-resume.docx"), "-o", out], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("(extract)");
    expect(result.output).toContain("no AI provider");
    expect(existsSync(out)).toBe(false);
  });

  it("reads a PDF resume through to extraction (then needs-AI, no provider configured)", async () => {
    cleanEnv();
    const huntHome = tempHome();
    const out = join(huntHome, "out.yaml");
    const result = await run(["profile", "from-resume", cliFixture("sample-resume.pdf"), "-o", out], { huntHome });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("(extract)");
    expect(result.output).toContain("no AI provider");
  });

  it("shows usage when given no source", async () => {
    const result = await run(["profile", "from-resume"], { huntHome: tempHome() });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Usage: hunt profile from-resume");
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

describe("hunt track / list / show / backup (deterministic, no AI)", () => {
  const clearAiEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  async function importedJob(huntHome: string): Promise<string> {
    clearAiEnv();
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const imported = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    return /job id: (job_[0-9a-f]+)/.exec(imported.output)![1]!;
  }

  it("auto-creates an application on first track and records the timeline", async () => {
    const huntHome = tempHome();
    const jobId = await importedJob(huntHome);

    const t1 = await run(["track", jobId, "--status", "applied"], { huntHome });
    expect(t1.exitCode).toBe(0);
    expect(t1.output).toContain("Status → applied (application created)");

    const t2 = await run(["track", jobId, "--note", "Referred by Sam"], { huntHome });
    expect(t2.exitCode).toBe(0);

    const show = await run(["show", jobId], { huntHome });
    expect(show.output).toContain("status: applied");
    expect(show.output).toContain("discovered → applied");
    expect(show.output).toContain("note: Referred by Sam");
  });

  it("rejects an invalid transition with the state machine's reason", async () => {
    const huntHome = tempHome();
    const jobId = await importedJob(huntHome);
    await run(["track", jobId, "--status", "applied"], { huntHome });
    const bad = await run(["track", jobId, "--status", "accepted"], { huntHome });
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain('invalid transition "applied" → "accepted"');
  });

  it("rejects an unknown status value", async () => {
    const huntHome = tempHome();
    const jobId = await importedJob(huntHome);
    const bad = await run(["track", jobId, "--status", "hired"], { huntHome });
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain('unknown status "hired"');
  });

  it("list shows fit score and tracking status, filterable by status", async () => {
    const huntHome = tempHome();
    const jobId = await importedJob(huntHome);
    await run(["analyze", jobId], { huntHome });

    const untracked = await run(["list"], { huntHome });
    expect(untracked.output).toContain("untracked");
    expect(untracked.output).toContain("28/100");

    await run(["track", jobId, "--status", "applied"], { huntHome });
    const applied = await run(["list", "--status", "applied"], { huntHome });
    expect(applied.output).toContain("applied");
    const none = await run(["list", "--status", "offer"], { huntHome });
    expect(none.output).toContain('No jobs with status "offer"');
  });

  it("backup snapshots the home into a target directory", async () => {
    const huntHome = tempHome();
    await importedJob(huntHome);
    const dest = join(huntHome, "backup1");
    const result = await run(["backup", dest], { huntHome });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Backup written to");
    expect(existsSync(join(dest, "hunt.db"))).toBe(true);
  });

  it("track --attach requires an existing document", async () => {
    const huntHome = tempHome();
    const jobId = await importedJob(huntHome);
    const bad = await run(["track", jobId, "--attach", "doc_missing"], { huntHome });
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain("Document not found");
  });
});

describe("hunt full V1 loop (import → analyze → resume → approve → track → show)", () => {
  const clearAiEnv = () => {
    for (const key of ["ANTHROPIC_API_KEY", "HUNT_AI_PROVIDER", "HUNT_AI_MODEL", "HUNT_OLLAMA_URL"]) {
      delete process.env[key];
    }
  };

  function fakeResumeOllama() {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const prompt = JSON.parse(body).messages.map((m: { content: string }) => m.content).join("\n");
        const factId = /\b(exp_[0-9a-f]+|ach_[0-9a-f]+|skill_[0-9a-f]+)\b/.exec(prompt)?.[1] ?? "exp_0";
        const content = JSON.stringify({
          summary: { text: "Senior software engineer", sourceFactIds: [factId] },
          sections: [{ heading: "Experience", bullets: [{ text: "Delivered engineering impact", sourceFactIds: [factId] }] }],
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

  it("runs the complete product loop end to end", async () => {
    const huntHome = tempHome();
    clearAiEnv();

    // 1. profile + 2. import + 3. analyze (deterministic)
    await run(["profile", "import", EXAMPLE_PROFILE], { huntHome });
    const imported = await run(["import", "--file", fixture("greenhouse.html")], { huntHome });
    expect(imported.exitCode).toBe(0);
    const jobId = /job id: (job_[0-9a-f]+)/.exec(imported.output)![1]!;
    expect((await run(["analyze", jobId], { huntHome })).exitCode).toBe(0);

    // 4. resume (AI) + 5. approve
    const url = await fakeResumeOllama();
    process.env.HUNT_AI_PROVIDER = "ollama";
    process.env.HUNT_OLLAMA_URL = url;
    cleanups.push(clearAiEnv);
    const gen = await run(["resume", jobId], { huntHome });
    expect(gen.exitCode).toBe(0);
    const docId = /Drafted resume: (doc_[0-9a-f]+)/.exec(gen.output)![1]!;
    expect((await run(["approve", docId], { huntHome })).exitCode).toBe(0);

    // 6. track: apply, then attach the approved resume to the application
    expect((await run(["track", jobId, "--status", "applied"], { huntHome })).exitCode).toBe(0);
    const attach = await run(["track", jobId, "--attach", docId], { huntHome });
    expect(attach.exitCode).toBe(0);

    // 7. show: the whole story in one place
    const show = await run(["show", jobId], { huntHome });
    expect(show.output).toContain("fit 28/100");
    expect(show.output).toContain(`resume [approved] ${docId}`);
    expect(show.output).toContain("status: applied");
    expect(show.output).toContain(`attached resume: ${docId}`);
  });
});

describe("hunt searches (integration: multi-source, no AI)", () => {
  it("saves a search mixing Greenhouse, Lever, and Ashby boards", async () => {
    const huntHome = tempHome();
    const added = await run(
      [
        "searches", "add", "faang",
        "--board", "stripe",
        "--lever", "palantir",
        "--ashby", "Ramp",
        "--role", "backend engineer",
        "--skill", "go",
      ],
      { huntHome },
    );
    expect(added.exitCode).toBe(0);
    // Sources render qualified as adapterId:board so platforms are unambiguous.
    expect(added.output).toContain("greenhouse:stripe");
    expect(added.output).toContain("lever:palantir");
    expect(added.output).toContain("ashby:Ramp");

    const listed = await run(["searches", "list"], { huntHome });
    expect(listed.output).toContain("faang");
    expect(listed.output).toContain("greenhouse:stripe");
    expect(listed.output).toContain("lever:palantir");
    expect(listed.output).toContain("ashby:Ramp");
  });

  it("--board still defaults to Greenhouse (back-compat)", async () => {
    const added = await run(["searches", "add", "gh-only", "--board", "stripe"], {
      huntHome: tempHome(),
    });
    expect(added.exitCode).toBe(0);
    expect(added.output).toContain("greenhouse:stripe");
  });

  it("requires at least one board", async () => {
    const added = await run(["searches", "add", "empty", "--role", "engineer"], {
      huntHome: tempHome(),
    });
    expect(added.exitCode).toBe(1);
    expect(added.output).toContain("at least one board");
  });
});
