import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  ProfileInputSchema,
  resolveProfileInput,
  type ExtractResumePort,
  type ExtractResumeResult,
  type ExtractedResumeDraft,
} from "@hunt/core";
import { createImportResume } from "./import-resume.js";

const DRAFT: ExtractedResumeDraft = {
  basics: {
    name: "Gokul P S",
    email: "gokul@example.com",
    headline: "Backend Engineer",
    links: [{ label: "GitHub", url: "https://github.com/example" }],
  },
  experience: [
    {
      company: "Acme Corp",
      role: "Software Engineer",
      startDate: "2021-03",
      endDate: "2024-01",
      location: "Remote",
      summary: "Payments platform.",
      achievements: [
        { text: "Cut p99 latency 800ms → 120ms", skills: ["performance", "node.js"] },
      ],
    },
  ],
  skills: [{ name: "typescript", level: "expert", years: 5 }],
  projects: [
    { name: "Hunt", description: "Local-first career OS", url: "https://example.com", skills: ["typescript"] },
  ],
  education: [{ institution: "State University", degree: "BSc", field: "CS" }],
  certifications: [{ name: "AWS SA", issuer: "Amazon" }],
};

function fakeExtractor(result: ExtractResumeResult): ExtractResumePort {
  return { extractResume: async () => result };
}

describe("ImportResume", () => {
  it("stamps verified:false on every proposed fact", async () => {
    const importResume = createImportResume({ resumeExtractor: fakeExtractor({ ok: true, draft: DRAFT }) });
    const result = await importResume({ resumeText: "…a resume…" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = ProfileInputSchema.parse(parseYaml(result.yaml));
    expect(parsed.experience[0]?.verified).toBe(false);
    expect(parsed.experience[0]?.achievements[0]?.verified).toBe(false);
    expect(parsed.skills[0]?.verified).toBe(false);
    expect(parsed.projects[0]?.verified).toBe(false);
    expect(parsed.education[0]?.verified).toBe(false);
    expect(parsed.certifications[0]?.verified).toBe(false);
  });

  it("produces YAML that round-trips through the confirm step (resolveProfileInput)", async () => {
    const importResume = createImportResume({ resumeExtractor: fakeExtractor({ ok: true, draft: DRAFT }) });
    const result = await importResume({ resumeText: "…a resume…" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The generated YAML must be a valid ProfileInput and resolve to a Profile —
    // this is exactly what `hunt profile import` will do to it.
    const input = ProfileInputSchema.parse(parseYaml(result.yaml));
    const resolved = resolveProfileInput(input, "2026-07-12T00:00:00.000Z");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.profile.basics.name).toBe("Gokul P S");
    // Unverified state survives the deterministic-id assignment.
    expect(resolved.profile.experience[0]?.verified).toBe(false);
    expect(resolved.profile.skills[0]?.verified).toBe(false);
    expect(result.summary).toEqual({
      experience: 1,
      achievements: 1,
      skills: 1,
      projects: 1,
      education: 1,
      certifications: 1,
    });
  });

  it("fails with a needs-AI hint when no extractor is configured", async () => {
    const importResume = createImportResume({ resumeExtractor: undefined });
    const result = await importResume({ resumeText: "…a resume…" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("extract");
    expect(result.message).toContain("no AI provider");
    expect(result.hint).toContain("ANTHROPIC_API_KEY");
  });

  it("rejects empty resume text before calling the model", async () => {
    let called = false;
    const spy: ExtractResumePort = {
      extractResume: async () => {
        called = true;
        return { ok: true, draft: DRAFT };
      },
    };
    const result = await createImportResume({ resumeExtractor: spy })({ resumeText: "   \n  " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("input");
    expect(called).toBe(false);
  });

  it("normalizes imprecise resume dates to ISO and drops 'Present' end dates", async () => {
    const draft: ExtractedResumeDraft = {
      basics: { name: "X", links: [] },
      experience: [
        { company: "A", role: "R", startDate: "2019", endDate: "Present", achievements: [] },
        { company: "B", role: "R2", startDate: "Mar 2021", endDate: "2022-06", achievements: [] },
      ],
      skills: [],
      projects: [],
      education: [],
      certifications: [],
    };
    const result = await createImportResume({ resumeExtractor: fakeExtractor({ ok: true, draft }) })({
      resumeText: "…",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = ProfileInputSchema.parse(parseYaml(result.yaml));
    expect(parsed.experience[0]?.startDate).toBe("2019-01-01");
    expect(parsed.experience[0]?.endDate).toBeUndefined(); // "Present" ⇒ current position
    expect(parsed.experience[1]?.startDate).toBe("2021-03-01");
    expect(parsed.experience[1]?.endDate).toBe("2022-06-01");
  });

  it("surfaces an extraction failure as an extract-stage error", async () => {
    const importResume = createImportResume({
      resumeExtractor: fakeExtractor({ ok: false, kind: "provider", message: "quota exceeded" }),
    });
    const result = await importResume({ resumeText: "…a resume…" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("extract");
    expect(result.message).toContain("quota exceeded");
  });
});
