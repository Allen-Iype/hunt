import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplicationStatus, GeneratedDocument, IngestJobInput } from "@hunt/core";
import type { TrackAction } from "@hunt/capabilities";
import { createContainer, resolveHuntHome } from "./container.js";

/**
 * CLI argument handling, kept thin: parse input, invoke one capability,
 * render the result (SDD §7). Storage is only opened for commands that
 * need it.
 */

/** Single source of truth for the version: the package manifest (clears M0 debt). */
export const CLI_VERSION: string = (() => {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

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
  hunt profile from-resume <path>  Seed a reviewable profile.yaml from an existing resume (needs AI)
  hunt profile import <path>     Import (or update) your profile from a profile.yaml
  hunt profile show              Show a summary of the imported profile
  hunt import <url>              Import a job posting from a URL (LinkedIn or any job page)
  hunt import --file <path>      Import a job posting from a saved HTML/text file
  hunt import -                  Import a job posting pasted on stdin
  hunt analyze <job-id>          Analyze an imported job against your profile
  hunt resume <job-id>           Generate a tailored, fact-grounded resume (draft)
  hunt letter <job-id>           Generate a tailored, fact-grounded cover letter (draft)
  hunt approve <doc-id>          Mark a reviewed document as approved (sendable)

  hunt track <job-id> --status <s>   Move an application through its lifecycle (creates it on first use)
  hunt track <job-id> --note "..."   Add a note to the application
  hunt track <job-id> --attach <doc-id>   Attach a generated document to the application
  hunt list [--status <s>]       List imported jobs with fit score and tracking status
  hunt show <job-id|app-id>      Show a job: analysis, documents, and application timeline
  hunt backup [<dir>]            Snapshot ~/.hunt (database + vault + documents) to a directory

  hunt searches add <name> [--board <gh-slug>]... [--lever <slug>]... [--ashby <slug>]... [--role <r>]... [--skill <s>]... [--location <l>]...
                                 Save a standing search (which boards to watch + your intent).
                                 Mix platforms: --board greenhouse-slug --lever lever-slug --ashby ashby-slug
  hunt searches list             List saved searches
  hunt searches remove <id>      Delete a saved search
  hunt discover <search-id>      Find jobs from the search's boards, ranked to your intent
  hunt discover --import <opp-id>  Import a discovered lead into a job (then analyze/generate)

Application statuses: discovered · interested · preparing · applied · screen · tech ·
  onsite · offer_pending · offer · accepted · declined · rejected · withdrawn · ghosted

AI configuration (job extraction fallback, and required for resume/letter generation):
  ANTHROPIC_API_KEY=...          use Anthropic (cloud)
  HUNT_AI_PROVIDER=ollama        use Ollama (local); HUNT_AI_MODEL / HUNT_OLLAMA_URL to override

Generated documents are drafts until you review the rendered HTML and run 'hunt approve'.`;

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
    return await runProfile(rest, options);
  }
  if (command === "import") {
    return runImport(rest, options);
  }
  if (command === "analyze") {
    return runAnalyze(rest, options);
  }
  if (command === "resume") {
    return runGenerate("resume", rest, options);
  }
  if (command === "letter") {
    return runGenerate("cover_letter", rest, options);
  }
  if (command === "approve") {
    return runApprove(rest, options);
  }
  if (command === "track") {
    return runTrack(rest, options);
  }
  if (command === "list") {
    return runList(rest, options);
  }
  if (command === "show") {
    return runShow(rest, options);
  }
  if (command === "backup") {
    return runBackup(rest, options);
  }
  if (command === "searches") {
    return runSearches(rest, options);
  }
  if (command === "discover") {
    return runDiscover(rest, options);
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

/** Slug for the user-facing documents folder: <company>-<role>-<date>. */
function documentSlug(companyName: string, title: string, createdAt: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "untitled";
  const date = createdAt.slice(0, 10);
  return `${clean(companyName)}-${clean(title)}-${date}`;
}

/**
 * Write a rendered document into the user-facing vault folder (SDD §12:
 * documents/<company>-<role>-<date>/). Returns the absolute path.
 */
function writeRendered(
  huntHome: string,
  doc: GeneratedDocument,
  companyName: string,
  title: string,
  content: string,
  extension: string,
): string {
  const dir = join(huntHome, "documents", documentSlug(companyName, title, doc.createdAt));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${doc.kind}.${extension}`);
  writeFileSync(file, content, "utf8");
  return file;
}

async function runGenerate(
  kind: "resume" | "cover_letter",
  args: readonly string[],
  options: RunOptions,
): Promise<RunResult> {
  const label = kind === "resume" ? "resume" : "letter";
  const jobId = args[0];
  if (!jobId) {
    return { exitCode: 1, output: `Usage: hunt ${label} <job-id>  (the id printed by hunt import)` };
  }
  const huntHome = options.huntHome ?? resolveHuntHome();
  const container = createContainer(huntHome);
  try {
    if (container.aiConfigError) {
      return { exitCode: 1, output: `AI configuration error: ${container.aiConfigError}` };
    }
    const result =
      kind === "resume"
        ? await container.generateResume({ jobId })
        : await container.generateCoverLetter({ jobId });

    if (!result.ok) {
      const lines = [`Generation failed (${result.stage}): ${result.message}`];
      if (result.hint) lines.push(`Hint: ${result.hint}`);
      if (result.violations && result.violations.length > 0) {
        lines.push(`Ungrounded claims that could not be repaired:`);
        for (const v of result.violations) lines.push(`  [${v.path}] ${v.message}`);
      }
      return { exitCode: 1, output: lines.join("\n") };
    }

    const doc = result.document;
    const companyName = doc.kind === "cover_letter" ? doc.companyName : "";
    const jobTitle = doc.kind === "cover_letter" ? doc.jobTitle : "";
    // For a resume the company/title come from the job, not the document.
    const job = container.storage.jobs.getById(doc.jobId);
    const path = writeRendered(
      huntHome,
      doc,
      companyName || job?.companyName || "company",
      jobTitle || job?.title || "role",
      result.render.content,
      result.render.extension,
    );
    return { exitCode: 0, output: renderGenerateResult(label, result, path) };
  } finally {
    container.close();
  }
}

function renderGenerateResult(
  label: string,
  result: {
    document: GeneratedDocument;
    candidateCount: number;
  },
  path: string,
): string {
  const doc = result.document;
  const bulletCount =
    doc.kind === "resume"
      ? 1 + doc.sections.reduce((n, s) => n + s.bullets.length, 0)
      : 2 + doc.body.length;
  const meta = doc.generationMeta;
  const lines = [
    `Drafted ${label}: ${doc.id}`,
    `  rendered: ${path}`,
    `  grounded: ${bulletCount} bullet(s), each cited to your profile facts`,
    `  facts offered: ${result.candidateCount} · repair rounds: ${meta.repairRounds} · model: ${meta.providerId}`,
    ``,
    `Review the rendered HTML (open it / print to PDF), then make it sendable:`,
    `  hunt approve ${doc.id}`,
  ];
  return lines.join("\n");
}

async function runApprove(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const docId = args[0];
  if (!docId) {
    return { exitCode: 1, output: "Usage: hunt approve <doc-id>  (the id printed by hunt resume/letter)" };
  }
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    const existing = container.storage.documents.getById(docId);
    const result = container.approveDocument({
      documentId: docId,
      ...(existing?.renderPath ? { renderPath: existing.renderPath } : {}),
    });
    if (!result.ok) {
      return {
        exitCode: 1,
        output: `Approve failed (${result.stage}): ${result.message}` + (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    return {
      exitCode: 0,
      output: `Approved ${result.document.kind} ${result.document.id} — it is now marked sendable.`,
    };
  } finally {
    container.close();
  }
}

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "discovered", "interested", "preparing", "applied", "screen", "tech", "onsite",
  "offer_pending", "offer", "accepted", "declined", "rejected", "withdrawn", "ghosted",
];

/** Parse `hunt track` flags into exactly one action. */
function parseTrackAction(args: readonly string[]): TrackAction | { error: string } {
  const [flag, ...rest] = args;
  const value = rest.join(" ").trim();
  if (flag === "--status") {
    if (!APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
      return { error: `unknown status "${value || "(none)"}"\nValid: ${APPLICATION_STATUSES.join(", ")}` };
    }
    return { kind: "transition", to: value as ApplicationStatus };
  }
  if (flag === "--note") {
    if (!value) return { error: "--note needs text: hunt track <job-id> --note \"...\"" };
    return { kind: "note", text: value };
  }
  if (flag === "--attach") {
    if (!value) return { error: "--attach needs a document id: hunt track <job-id> --attach <doc-id>" };
    return { kind: "attach", ref: value, label: "document" };
  }
  if (flag === "--contact") {
    if (!value) return { error: "--contact needs a name: hunt track <job-id> --contact \"Name\"" };
    return { kind: "contact", name: value };
  }
  return {
    error: "Usage: hunt track <job-id> (--status <s> | --note \"...\" | --attach <doc-id> | --contact \"Name\")",
  };
}

function runTrack(args: readonly string[], options: RunOptions): RunResult {
  const [jobId, ...actionArgs] = args;
  if (!jobId) {
    return { exitCode: 1, output: "Usage: hunt track <job-id> --status <s> | --note \"...\" | --attach <doc-id>" };
  }
  const action = parseTrackAction(actionArgs);
  if ("error" in action) return { exitCode: 1, output: action.error };

  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    // For --attach, verify the document exists and belongs to this job (guard-rail).
    if (action.kind === "attach") {
      const doc = container.storage.documents.getById(action.ref);
      if (!doc) {
        return { exitCode: 1, output: `Document not found: ${action.ref} (see 'hunt show ${jobId}')` };
      }
      action.label = doc.kind;
    }
    const result = container.trackApplication({ jobId, action });
    if (!result.ok) {
      return {
        exitCode: 1,
        output: `Track failed (${result.stage}): ${result.message}` + (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    const a = result.application;
    const created = result.created ? " (application created)" : "";
    let line: string;
    switch (result.event.kind) {
      case "status_changed":
        line = `Status → ${a.status}${created}`;
        break;
      case "note_added":
        line = `Note added${created} · status: ${a.status}`;
        break;
      case "document_attached":
        line = `Attached ${result.event.data.ref}${created} · status: ${a.status}`;
        break;
      case "contact_added":
        line = `Contact added${created} · status: ${a.status}`;
        break;
    }
    return { exitCode: 0, output: `${line}\nApplication: ${a.id}` };
  } finally {
    container.close();
  }
}

function runList(args: readonly string[], options: RunOptions): RunResult {
  let statusFilter: ApplicationStatus | undefined;
  if (args[0] === "--status") {
    const value = args[1];
    if (!value || !APPLICATION_STATUSES.includes(value as ApplicationStatus)) {
      return { exitCode: 1, output: `Usage: hunt list [--status <s>]\nValid: ${APPLICATION_STATUSES.join(", ")}` };
    }
    statusFilter = value as ApplicationStatus;
  }
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    const items = container.queries.list(statusFilter ? { status: statusFilter } : undefined);
    if (items.length === 0) {
      return {
        exitCode: 0,
        output: statusFilter
          ? `No jobs with status "${statusFilter}".`
          : "No jobs imported yet. Import one: hunt import <url|-|--file>",
      };
    }
    const lines = items.map((i) => {
      const fit = i.latestFitScore === null ? " -- " : `${String(i.latestFitScore).padStart(3)}`;
      const status = i.application?.status ?? "untracked";
      return `${fit}/100  [${status.padEnd(13)}]  ${i.job.title} @ ${i.job.companyName}  (${i.job.id})`;
    });
    return { exitCode: 0, output: [`Fit   Status           Job`, ...lines].join("\n") };
  } finally {
    container.close();
  }
}

function runShow(args: readonly string[], options: RunOptions): RunResult {
  const id = args[0];
  if (!id) {
    return { exitCode: 1, output: "Usage: hunt show <job-id|app-id>" };
  }
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    const d = container.queries.detail(id);
    if (!d) {
      return { exitCode: 1, output: `Not found: ${id} (a job id from 'hunt import' or an application id)` };
    }
    const lines: string[] = [
      `${d.job.title} @ ${d.job.companyName}`,
      `  ${d.job.locations.join("; ") || "location unspecified"} · ${d.job.workplaceType} · ${d.job.seniority}`,
      `  job id: ${d.job.id}`,
    ];
    if (d.analysis) {
      lines.push(
        `Analysis: fit ${d.analysis.fitScore}/100 · matched ${d.analysis.skills.matched.length} · missing ${d.analysis.skills.missing.length}` +
          (d.analysis.skills.missing.length ? ` (${d.analysis.skills.missing.join(", ")})` : ""),
      );
    } else {
      lines.push(`Analysis: none yet — run 'hunt analyze ${d.job.id}'`);
    }
    if (d.documents.length > 0) {
      lines.push(`Documents:`);
      for (const doc of d.documents) {
        lines.push(`  ${doc.kind} [${doc.status}] ${doc.id}${doc.renderPath ? ` → ${doc.renderPath}` : ""}`);
      }
    }
    if (d.application) {
      lines.push(`Application: ${d.application.id} · status: ${d.application.status}`);
      lines.push(`Timeline:`);
      for (const e of d.events) {
        lines.push(`  ${e.occurredAt}  ${formatEvent(e)}`);
      }
    } else {
      lines.push(`Application: not tracked — start with 'hunt track ${d.job.id} --status applied'`);
    }
    return { exitCode: 0, output: lines.join("\n") };
  } finally {
    container.close();
  }
}

function formatEvent(e: import("@hunt/core").ApplicationEvent): string {
  switch (e.kind) {
    case "status_changed":
      return `${e.data.from} → ${e.data.to}${e.data.note ? ` (${e.data.note})` : ""}`;
    case "note_added":
      return `note: ${e.data.text}`;
    case "document_attached":
      return `attached ${e.data.label ?? "document"}: ${e.data.ref}`;
    case "contact_added":
      return `contact: ${e.data.name}${e.data.role ? ` (${e.data.role})` : ""}`;
  }
}

function runBackup(args: readonly string[], options: RunOptions): RunResult {
  const huntHome = options.huntHome ?? resolveHuntHome();
  // Default target: a timestamped-ish dir the user names; here we require a dir
  // for determinism (no wall-clock in output), defaulting to <home>/backups/latest.
  const dest = args[0] ?? join(huntHome, "backups", "latest");
  const container = createContainer(huntHome);
  try {
    const result = container.storage.backup(dest);
    const parts = [
      `Backup written to ${dest}`,
      `  database: ${result.dbPath}`,
      `  vault: ${result.vaultCopied ? "copied" : "(none)"} · documents: ${result.documentsCopied ? "copied" : "(none)"}`,
    ];
    return { exitCode: 0, output: parts.join("\n") };
  } catch (err) {
    return {
      exitCode: 1,
      output: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    container.close();
  }
}

/** Collect all values passed for a repeatable flag (e.g. --skill go --skill rust). */
function collectFlag(args: readonly string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) out.push(args[i + 1]!);
  }
  return out;
}

const SEARCHES_ADD_USAGE =
  "Usage: hunt searches add <name> [--board <greenhouse-slug>]... [--lever <slug>]... [--ashby <slug>]... [--role <r>]... [--skill <s>]... [--location <l>]...";

/** Render a search's sources as `adapterId:board`, so mixed-platform boards read unambiguously. */
function formatSources(sources: readonly { adapterId: string; board: string }[]): string {
  return sources.map((x) => `${x.adapterId}:${x.board}`).join(", ");
}

function runSearches(args: readonly string[], options: RunOptions): RunResult {
  const [sub, ...rest] = args;
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    if (sub === "add") {
      const name = rest[0];
      if (!name || name.startsWith("-")) {
        return { exitCode: 1, output: SEARCHES_ADD_USAGE };
      }
      // Per-source flags (ADR-0015 ATS tier): --board defaults to Greenhouse
      // (back-compat); --lever/--ashby name a board on those platforms. All
      // repeatable and mixable within one search.
      const sources = [
        ...collectFlag(rest, "--board").map((board) => ({ adapterId: "greenhouse", board })),
        ...collectFlag(rest, "--lever").map((board) => ({ adapterId: "lever", board })),
        ...collectFlag(rest, "--ashby").map((board) => ({ adapterId: "ashby", board })),
      ];
      if (sources.length === 0) {
        return {
          exitCode: 1,
          output: "A search needs at least one board: --board <greenhouse-slug>, --lever <slug>, or --ashby <slug>",
        };
      }
      const result = container.savedSearches.add({
        name,
        query: {
          roles: collectFlag(rest, "--role"),
          skills: collectFlag(rest, "--skill"),
          locations: collectFlag(rest, "--location"),
        },
        sources,
      });
      if (!result.ok) return { exitCode: 1, output: `Could not save search: ${result.message}` };
      const s = result.search;
      return {
        exitCode: 0,
        output: `Saved search "${s.name}" (${s.id})\n  boards: ${formatSources(s.sources)}\n  discover with: hunt discover ${s.id}`,
      };
    }
    if (sub === "list") {
      const searches = container.savedSearches.list();
      if (searches.length === 0) return { exitCode: 0, output: "No saved searches. Add one: hunt searches add <name> --board <slug>" };
      return {
        exitCode: 0,
        output: searches
          .map((s) => `${s.id}  ${s.name}  [boards: ${formatSources(s.sources)}]`)
          .join("\n"),
      };
    }
    if (sub === "remove") {
      const id = rest[0];
      if (!id) return { exitCode: 1, output: "Usage: hunt searches remove <search-id>" };
      container.savedSearches.remove(id);
      return { exitCode: 0, output: `Removed search ${id}` };
    }
    return { exitCode: 1, output: "Usage: hunt searches <add|list|remove> ..." };
  } finally {
    container.close();
  }
}

async function runDiscover(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const container = createContainer(options.huntHome ?? resolveHuntHome());
  try {
    // hunt discover --import <opp-id>
    if (args[0] === "--import") {
      const oppId = args[1];
      if (!oppId) return { exitCode: 1, output: "Usage: hunt discover --import <opp-id>" };
      const result = await container.importOpportunityRef(oppId);
      if (!result.ok) {
        return {
          exitCode: 1,
          output: `Import failed (${result.stage}): ${result.message}` + (result.hint ? `\nHint: ${result.hint}` : ""),
        };
      }
      return {
        exitCode: 0,
        output: `Imported ${result.job.title} @ ${result.job.companyName} (${result.dedup})\n  job id: ${result.job.id}\n  next: hunt analyze ${result.job.id}`,
      };
    }

    const searchId = args[0];
    if (!searchId) {
      return { exitCode: 1, output: "Usage: hunt discover <search-id>   (list searches with: hunt searches list)" };
    }
    const result = await container.discoverJobs(searchId);
    if (!result.ok) {
      return {
        exitCode: 1,
        output: `Discovery failed (${result.stage}): ${result.message}` + (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    return { exitCode: 0, output: renderDiscovery(result) };
  } finally {
    container.close();
  }
}

function renderDiscovery(result: {
  search: import("@hunt/core").SavedSearch;
  refs: import("@hunt/core").OpportunityRef[];
  skipped: number;
  usedProfile: boolean;
}): string {
  const { search, refs, skipped, usedProfile } = result;
  if (refs.length === 0) {
    return `No new opportunities for "${search.name}"${skipped > 0 ? ` (${skipped} already seen)` : ""}.`;
  }
  const lines = [
    `${refs.length} new opportunit${refs.length === 1 ? "y" : "ies"} for "${search.name}"` +
      `${skipped > 0 ? `, ${skipped} already seen` : ""} — ranked to your intent${usedProfile ? " + profile" : ""}:`,
  ];
  for (const r of refs) {
    const rel = `${Math.round(r.relevance * 100)}%`;
    lines.push(
      `  [${rel}] ${r.title}${r.companyName ? ` @ ${r.companyName}` : ""}${r.location ? ` · ${r.location}` : ""}`,
      `        ${r.id} · import: hunt discover --import ${r.id}`,
    );
  }
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

/**
 * `hunt profile from-resume <path> | --file <path> | -` → extract facts (AI) →
 * write a reviewable my-profile.yaml (every fact unverified). Refuses to clobber
 * an existing output file; `-o <path>` chooses the destination.
 */
async function runProfileFromResume(rest: readonly string[], huntHome: string): Promise<RunResult> {
  // Read the resume text from a path, --file <path>, or - (stdin paste).
  const [source, maybeSecond] = rest;
  let resumeText: string;
  let sourceRef: string;
  if (source === "-") {
    resumeText = readFileSync(0, "utf8");
    sourceRef = "stdin";
  } else {
    const path = source === "--file" ? maybeSecond : source;
    if (!path || path.startsWith("-")) {
      return {
        exitCode: 1,
        output: "Usage: hunt profile from-resume <path> | --file <path> | -   [-o <out.yaml>]",
      };
    }
    try {
      resumeText = readFileSync(path, "utf8");
    } catch (err) {
      return {
        exitCode: 1,
        output: `Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    sourceRef = path;
  }

  // Output path: -o <path>, else ./my-profile.yaml. Never clobber.
  const outFlag = collectFlag(rest, "-o");
  const outPath = outFlag[0] ?? "my-profile.yaml";
  if (existsSync(outPath)) {
    return {
      exitCode: 1,
      output: `${outPath} already exists — remove it or choose another with -o <path> (I won't overwrite your file).`,
    };
  }

  const container = createContainer(huntHome);
  try {
    const result = await container.importResume({ resumeText });
    if (!result.ok) {
      return {
        exitCode: 1,
        output: `Resume import failed (${result.stage}): ${result.message}` + (result.hint ? `\nHint: ${result.hint}` : ""),
      };
    }
    try {
      writeFileSync(outPath, result.yaml, { flag: "wx" });
    } catch (err) {
      return {
        exitCode: 1,
        output: `Could not write ${outPath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const s = result.summary;
    return {
      exitCode: 0,
      output:
        `Wrote ${outPath} from ${sourceRef} — every fact is UNVERIFIED.\n` +
        `  experience: ${s.experience} (${s.achievements} achievements) · skills: ${s.skills} · ` +
        `projects: ${s.projects} · education: ${s.education} · certifications: ${s.certifications}\n` +
        `  review & edit it, then confirm: hunt profile import ${outPath}`,
    };
  } finally {
    container.close();
  }
}

async function runProfile(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const [subcommand, ...rest] = args;
  const huntHome = options.huntHome ?? resolveHuntHome();

  if (subcommand === "from-resume") {
    return runProfileFromResume(rest, huntHome);
  }

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
