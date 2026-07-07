import { describe, expect, it } from "vitest";
import type { CoverLetterDocument, ResumeDocument } from "@hunt/core";
import { createHtmlRenderer } from "./index.js";
import { escapeHtml } from "./html.js";

const meta = {
  generatorVersion: 1,
  aiTaskId: "draft-resume",
  aiTaskVersion: 1,
  providerId: "test",
  candidateFactIds: ["exp_1"],
  repairRounds: 0,
};

const resume: ResumeDocument = {
  id: "doc_r",
  schemaVersion: 1,
  kind: "resume",
  jobId: "job_1",
  analysisId: "ana_1",
  profileVersion: "2026-07-07T00:00:00Z",
  status: "draft",
  generationMeta: meta,
  contact: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    links: [{ label: "GitHub", url: "https://github.com/ada" }],
  },
  summary: { text: "Backend engineer", sourceFactIds: ["exp_1"] },
  sections: [
    { heading: "Experience", bullets: [{ text: "Built payment systems", sourceFactIds: ["exp_1"] }] },
  ],
  createdAt: "2026-07-07T00:00:00Z",
};

const letter: CoverLetterDocument = {
  id: "doc_c",
  schemaVersion: 1,
  kind: "cover_letter",
  jobId: "job_1",
  analysisId: "ana_1",
  profileVersion: "2026-07-07T00:00:00Z",
  status: "draft",
  generationMeta: { ...meta, aiTaskId: "draft-cover-letter" },
  companyName: "Acme",
  jobTitle: "Senior Engineer",
  hook: { text: "I admire Acme's work", sourceFactIds: ["exp_1"] },
  body: [{ text: "I built payment systems", sourceFactIds: ["exp_1"] }],
  closing: { text: "Thank you", sourceFactIds: ["exp_1"] },
  createdAt: "2026-07-07T00:00:00Z",
};

describe("escapeHtml", () => {
  it("escapes the HTML metacharacters", () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&#39;");
  });
});

describe("createHtmlRenderer", () => {
  const renderer = createHtmlRenderer();

  it("renders a self-contained resume HTML document", () => {
    const out = renderer.renderResume(resume);
    expect(out.contentType).toBe("text/html");
    expect(out.extension).toBe("html");
    expect(out.content).toContain("<!doctype html>");
    expect(out.content).toContain("<style>"); // print CSS embedded, no external assets
    expect(out.content).toContain("Ada Lovelace");
    expect(out.content).toContain("Built payment systems");
    expect(out.content).toContain("@media print");
  });

  it("renders the cover letter hook, body, and closing", () => {
    const out = renderer.renderCoverLetter(letter);
    expect(out.content).toContain("I admire Acme&#39;s work");
    expect(out.content).toContain("I built payment systems");
    expect(out.content).toContain("Thank you");
  });

  it("escapes injected markup from document text (SDD §21)", () => {
    const hostile: ResumeDocument = {
      ...resume,
      sections: [
        {
          heading: "Experience",
          bullets: [{ text: "<img src=x onerror=alert(1)>", sourceFactIds: ["exp_1"] }],
        },
      ],
    };
    const out = renderer.renderResume(hostile);
    expect(out.content).not.toContain("<img src=x");
    expect(out.content).toContain("&lt;img src=x");
  });
});
