import { describe, expect, it } from "vitest";
import type { CandidateFact } from "../models/candidate-fact.js";
import { traceClaims, type ClaimBullet } from "./claim-trace.js";

const facts: CandidateFact[] = [
  {
    id: "exp_1",
    kind: "experience",
    text: "Senior Engineer at Acme — built payment systems in typescript and react",
    skills: ["typescript", "react"],
    relevance: 0.9,
  },
  {
    id: "ach_1",
    kind: "achievement",
    text: "Cut checkout latency by 40% and scaled to 2m daily users",
    skills: ["typescript"],
    parentId: "exp_1",
    relevance: 0.95,
  },
];

function bullet(text: string, sourceFactIds: string[], path = "b1"): ClaimBullet {
  return { path, text, sourceFactIds };
}

describe("traceClaims", () => {
  it("passes a bullet grounded in a cited fact", () => {
    const result = traceClaims([bullet("Built payment systems in TypeScript", ["exp_1"])], facts);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects a bullet citing an unknown fact id (invented experience)", () => {
    const result = traceClaims([bullet("Led the platform team", ["exp_999"])], facts);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.kind)).toContain("unknown-fact");
  });

  it("rejects a fabricated/inflated metric not in the cited facts", () => {
    // Fact says 40%; bullet claims 90%.
    const result = traceClaims([bullet("Cut latency by 90%", ["ach_1"])], facts);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.kind)).toContain("unsupported-number");
  });

  it("accepts a metric that does appear in the cited fact", () => {
    const result = traceClaims([bullet("Cut latency by 40% for 2m users", ["ach_1"])], facts);
    expect(result.ok).toBe(true);
  });

  it("rejects a technology the cited facts do not evidence", () => {
    // exp_1 evidences typescript/react, not kubernetes.
    const result = traceClaims([bullet("Deployed services on Kubernetes", ["exp_1"])], facts);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.kind)).toContain("unsupported-skill");
  });

  it("accepts a technology evidenced by any cited fact", () => {
    const result = traceClaims([bullet("Shipped React front-ends", ["exp_1"])], facts);
    expect(result.ok).toBe(true);
  });

  it("flags an empty bullet", () => {
    const result = traceClaims([bullet("   ", ["exp_1"])], facts);
    expect(result.violations.map((v) => v.kind)).toContain("empty");
  });

  it("flags an over-long bullet", () => {
    const result = traceClaims([bullet("a".repeat(500), ["exp_1"])], facts);
    expect(result.violations.map((v) => v.kind)).toContain("too-long");
  });

  it("ignores 4-digit years as claim metrics", () => {
    const yearFact: CandidateFact = {
      id: "edu_1",
      kind: "education",
      text: "BSc Computer Science, graduated",
      skills: [],
      relevance: 0.4,
    };
    const result = traceClaims([bullet("Graduated in 2018", ["edu_1"])], [yearFact]);
    expect(result.ok).toBe(true);
  });

  it("still traces the supported cite when a bullet mixes known and unknown ids", () => {
    const result = traceClaims([bullet("Built payments in TypeScript", ["exp_1", "exp_999"])], facts);
    // The unknown id is a violation, but the lexical check runs against exp_1.
    expect(result.violations.map((v) => v.kind)).toEqual(["unknown-fact"]);
  });

  it("reports the bullet path in violations", () => {
    const result = traceClaims([bullet("On Kubernetes", ["exp_1"], "sections[0].bullets[2]")], facts);
    expect(result.violations[0]?.path).toBe("sections[0].bullets[2]");
  });
});
