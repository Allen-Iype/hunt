import { readFileSync } from "node:fs";
import type { IngestJobInput } from "@hunt/core";
import { createContainer, resolveHuntHome } from "./container.js";

/**
 * CLI argument handling, kept thin: parse input, invoke one capability,
 * render the result (SDD §7). Storage is only opened for commands that
 * need it.
 */

export const CLI_VERSION = "0.0.1";

export interface RunResult {
  exitCode: number;
  output: string;
}

export interface RunOptions {
  /** Hunt data directory; defaults to $HUNT_HOME or ~/.hunt. */
  huntHome?: string;
}

const USAGE = `hunt — a local-first AI career operating system

Usage:
  hunt --version                 Print the Hunt version
  hunt profile import <path>     Import (or update) your profile from a profile.yaml
  hunt profile show              Show a summary of the imported profile
  hunt import <url>              Import a job posting from a URL (LinkedIn or any job page)
  hunt import --file <path>      Import a job posting from a saved HTML/text file
  hunt import -                  Import a job posting pasted on stdin
  hunt analyze <job-id>          Analyze an imported job against your profile

AI configuration (only needed for postings without structured data):
  ANTHROPIC_API_KEY=...          use Anthropic (cloud)
  HUNT_AI_PROVIDER=ollama        use Ollama (local); HUNT_AI_MODEL / HUNT_OLLAMA_URL to override

More commands arrive with upcoming milestones (analyze, resume, letter, track).`;

export async function run(
  argv: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "-v") {
    return { exitCode: 0, output: CLI_VERSION };
  }
  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }
  if (command === "profile") {
    return runProfile(rest, options);
  }
  if (command === "import") {
    return runImport(rest, options);
  }
  if (command === "analyze") {
    return runAnalyze(rest, options);
  }
  return { exitCode: 1, output: `Unknown command: ${command}\n\n${USAGE}` };
}

async function runAnalyze(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const jobId = args[0];
  if (!jobId) {
    return { exitCode: 1, output: "Usage: hunt analyze <job-id>  (the id printed by hunt import)" };
  }
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    if (container.aiConfigError) {
      return { exitCode: 1, output: `AI configuration error: ${container.aiConfigError}` };
    }
    const result = await container.analyzeJob({ jobId });
    if (!result.ok) {
      return {
        exitCode: 1,
        output:
          `Analysis failed (${result.stage}): ${result.message}` +
          (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    return { exitCode: 0, output: renderAnalysis(result) };
  } finally {
    container.close();
  }
}

function renderAnalysis(result: {
  analysis: import("@hunt/core").JobAnalysis;
  job: import("@hunt/core").Job;
  aiNote?: string;
}): RunResult["output"] {
  const { analysis: a, job } = result;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lines = [
    `Fit ${a.fitScore}/100 — ${job.title} @ ${job.companyName}`,
    `  ${a.breakdown
      .map((c) => `${c.component}: ${pct(c.value)} (w ${c.weight})`)
      .join(" · ")}`,
    `Matched skills: ${a.skills.matched.map((m) => m.name).join(", ") || "(none)"}`,
    `Missing skills: ${a.skills.missing.join(", ") || "(none)"}`,
    `Seniority: ${a.seniority.value} (${a.seniority.source})`,
  ];
  if (a.compensation?.min !== undefined) {
    const range =
      a.compensation.min === a.compensation.max
        ? `${a.compensation.min}`
        : `${a.compensation.min}–${a.compensation.max}`;
    lines.push(
      `Compensation: ${range}${a.compensation.currency ? ` ${a.compensation.currency}` : ""}${a.compensation.period ? ` per ${a.compensation.period}` : ""}`,
    );
  }
  if (a.requirements.length > 0) {
    lines.push(`Requirements (${a.fieldProvenance.requirements}):`);
    for (const r of a.requirements) {
      const coverage = r.coverage === null ? "n/a" : pct(r.coverage);
      lines.push(`  [${r.kind}] ${r.text} — coverage ${coverage}`);
    }
  }
  if (a.redFlags.length > 0) {
    lines.push(`Red flags:`, ...a.redFlags.map((f) => `  - ${f}`));
  }
  if (a.gapNarrative) {
    lines.push(`Gaps: ${a.gapNarrative}`);
  }
  lines.push(`Analysis id: ${a.id} (analyzer v${a.analyzerVersion}, ${a.aiUsed ? "AI-assisted" : "deterministic"})`);
  if (result.aiNote) lines.push(`Note: ${result.aiNote}`);
  return lines.join("\n");
}

async function runImport(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const huntHome = options.huntHome ?? resolveHuntHome();

  let input: IngestJobInput;
  const [first, second] = args;
  if (first === "--file") {
    if (!second) return { exitCode: 1, output: "Usage: hunt import --file <path>" };
    let content: string;
    try {
      content = readFileSync(second, "utf8");
    } catch (err) {
      return {
        exitCode: 1,
        output: `Cannot read ${second}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    input = { kind: "content", content, inputRef: `file:${second}` };
  } else if (first === "-") {
    const content = readFileSync(0, "utf8");
    if (content.trim().length === 0) {
      return { exitCode: 1, output: "Nothing on stdin. Paste the posting, then press Ctrl-D." };
    }
    input = { kind: "content", content, inputRef: "paste:stdin" };
  } else if (first && /^https?:\/\//i.test(first)) {
    input = { kind: "url", url: first };
  } else {
    return {
      exitCode: 1,
      output: `Expected a job URL, --file <path>, or - (stdin). Got: ${first ?? "(nothing)"}`,
    };
  }

  const container = createContainer(huntHome);
  try {
    if (container.aiConfigError) {
      return { exitCode: 1, output: `AI configuration error: ${container.aiConfigError}` };
    }
    const result = await container.importJob(input);
    if (!result.ok) {
      return {
        exitCode: 1,
        output:
          `Import failed (${result.stage}): ${result.message}` +
          (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    const { job, company, extractionTier, dedup } = result;
    const lines = [
      `${dedup === "new" ? "Imported" : "Re-imported (updated existing)"}: ${job.title} @ ${company.name}`,
      `  location: ${job.locations.join("; ") || "unspecified"} · seniority: ${job.seniority} · extraction: ${extractionTier}`,
      `  job id: ${job.id}`,
    ];
    if (extractionTier !== "ai" && job.requirements.length === 0) {
      lines.push(`  note: requirements not extracted at this tier — job analysis (M3) will handle that`);
    }
    return { exitCode: 0, output: lines.join("\n") };
  } finally {
    container.close();
  }
}

function runProfile(args: readonly string[], options: RunOptions): RunResult {
  const [subcommand, ...rest] = args;
  const huntHome = options.huntHome ?? resolveHuntHome();

  if (subcommand === "import") {
    const path = rest[0];
    if (!path) {
      return { exitCode: 1, output: "Usage: hunt profile import <path-to-profile.yaml>" };
    }
    let yamlSource: string;
    try {
      yamlSource = readFileSync(path, "utf8");
    } catch (err) {
      return {
        exitCode: 1,
        output: `Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const container = createContainer(huntHome);
    try {
      const result = container.importProfile({ yamlSource });
      if (!result.ok) {
        return { exitCode: 1, output: `Profile import failed (${result.stage}):\n${result.message}` };
      }
      const s = result.summary;
      return {
        exitCode: 0,
        output:
          `Imported profile for ${result.profile.basics.name}\n` +
          `  experience: ${s.experience} (${s.achievements} achievements)\n` +
          `  skills: ${s.skills} · projects: ${s.projects} · education: ${s.education} · certifications: ${s.certifications}`,
      };
    } finally {
      container.close();
    }
  }

  if (subcommand === "show") {
    const container = createContainer(huntHome);
    try {
      const profile = container.getProfile();
      if (!profile) {
        return {
          exitCode: 1,
          output: "No profile found. Import one with: hunt profile import <path-to-profile.yaml>",
        };
      }
      const lines = [
        `${profile.basics.name}${profile.basics.headline ? ` — ${profile.basics.headline}` : ""}`,
        `Updated: ${profile.updatedAt}`,
        `Experience:`,
        ...profile.experience.map(
          (e) =>
            `  ${e.role} @ ${e.company} (${e.startDate} → ${e.endDate ?? "present"})` +
            (e.achievements.length > 0 ? ` · ${e.achievements.length} achievements` : ""),
        ),
        `Skills: ${profile.skills.map((s) => s.name).join(", ") || "(none)"}`,
      ];
      return { exitCode: 0, output: lines.join("\n") };
    } finally {
      container.close();
    }
  }

  return {
    exitCode: 1,
    output: `Unknown profile subcommand: ${subcommand ?? "(none)"}\n\n${USAGE}`,
  };
}
