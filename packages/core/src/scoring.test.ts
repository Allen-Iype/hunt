import { describe, expect, it } from "vitest";
import {
  computeFitScore,
  deriveCandidateSeniority,
  seniorityAlignment,
} from "./scoring.js";
import { ProfileSchema } from "./models/profile.js";
import { SCHEMA_VERSION } from "./models/common.js";

describe("computeFitScore", () => {
  it("perfect coverage and alignment scores 100", () => {
    const { score } = computeFitScore({
      mustCoverage: [1, 1],
      skillOverlap: 1,
      jobSeniority: "senior",
      candidateSeniority: "senior",
    });
    expect(score).toBe(100);
  });

  it("is deterministic", () => {
    const input = {
      mustCoverage: [0.5, 1],
      skillOverlap: 0.4,
      jobSeniority: "senior",
      candidateSeniority: "mid",
    } as const;
    expect(computeFitScore(input)).toEqual(computeFitScore(input));
  });

  it("renormalizes weights when must coverage is unavailable", () => {
    const { score, breakdown } = computeFitScore({
      mustCoverage: [],
      skillOverlap: 1,
      jobSeniority: "unspecified",
      candidateSeniority: "senior",
    });
    expect(breakdown.map((c) => c.component)).toEqual(["skillOverlap", "seniorityAlignment"]);
    // (0.3*1 + 0.2*0.7) / 0.5 = 0.88
    expect(score).toBe(88);
  });

  it("scores on seniority alone when nothing else is detectable", () => {
    const { score, breakdown } = computeFitScore({
      mustCoverage: [],
      skillOverlap: null,
      jobSeniority: "senior",
      candidateSeniority: "senior",
    });
    expect(breakdown).toHaveLength(1);
    expect(score).toBe(100);
  });

  it("weights must coverage heaviest", () => {
    const low = computeFitScore({
      mustCoverage: [0],
      skillOverlap: 1,
      jobSeniority: "senior",
      candidateSeniority: "senior",
    });
    expect(low.score).toBe(50); // 0.5*0 + 0.3*1 + 0.2*1
  });
});

describe("seniorityAlignment", () => {
  it("is 1 on exact match, degrades with distance, neutral when unknowable", () => {
    expect(seniorityAlignment("senior", "senior")).toBe(1);
    expect(seniorityAlignment("senior", "staff")).toBe(0.7);
    expect(seniorityAlignment("junior", "principal")).toBe(0.3);
    expect(seniorityAlignment("unspecified", "senior")).toBe(0.7);
    expect(seniorityAlignment("manager", "senior")).toBe(0.7);
  });
});

describe("deriveCandidateSeniority", () => {
  const profileWithSpan = (startDate: string) =>
    ProfileSchema.parse({
      id: "profile_default",
      schemaVersion: SCHEMA_VERSION,
      basics: { name: "Ada" },
      experience: [{ id: "e1", company: "C", role: "R", startDate }],
      updatedAt: "2026-07-07T10:00:00Z",
    });

  const NOW = "2026-07-07T00:00:00Z";

  it("maps experience span to rank", () => {
    expect(deriveCandidateSeniority(profileWithSpan("2025-01-01"), NOW)).toBe("junior");
    expect(deriveCandidateSeniority(profileWithSpan("2023-01-01"), NOW)).toBe("mid");
    expect(deriveCandidateSeniority(profileWithSpan("2019-01-01"), NOW)).toBe("senior");
    expect(deriveCandidateSeniority(profileWithSpan("2015-01-01"), NOW)).toBe("staff");
    expect(deriveCandidateSeniority(profileWithSpan("2010-01-01"), NOW)).toBe("principal");
  });

  it("is unspecified with no experience", () => {
    const empty = ProfileSchema.parse({
      id: "profile_default",
      schemaVersion: SCHEMA_VERSION,
      basics: { name: "Ada" },
      updatedAt: NOW,
    });
    expect(deriveCandidateSeniority(empty, NOW)).toBe("unspecified");
  });
});
