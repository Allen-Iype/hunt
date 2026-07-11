import { describe, expect, it } from "vitest";
import { OpportunityRefSchema, opportunityRefId } from "./opportunity-ref.js";

const NOW = "2026-07-11T10:00:00Z";

const validLead = {
  id: "opp_1",
  sourceId: "greenhouse",
  url: "https://boards.greenhouse.io/acme/jobs/1",
  title: "Senior Engineer",
  queryId: "search_1",
  discoveredAt: NOW,
  status: "new",
  relevance: 0.8,
};

describe("OpportunityRef", () => {
  it("accepts a valid lead", () => {
    expect(OpportunityRefSchema.parse(validLead).id).toBe("opp_1");
  });

  it("defaults status to new", () => {
    const { status, ...noStatus } = validLead;
    void status;
    expect(OpportunityRefSchema.parse(noStatus).status).toBe("new");
  });

  it("REJECTS normalized job structure — a ref is a lead, never a job (ADR-0015 invariant)", () => {
    // requirements/compensation/descriptionText are job fields; .strict() must reject them.
    for (const jobField of [
      { requirements: [{ id: "r1", text: "5y Go" }] },
      { compensation: { raw: "$200k" } },
      { descriptionText: "the full posting body..." },
      { responsibilities: ["lead the team"] },
    ]) {
      const result = OpportunityRefSchema.safeParse({ ...validLead, ...jobField });
      expect(result.success).toBe(false);
    }
  });

  it("derives a deterministic id from (sourceId, url)", () => {
    const a = opportunityRefId("greenhouse", "https://x/1");
    const b = opportunityRefId("greenhouse", "https://x/1");
    const c = opportunityRefId("greenhouse", "https://x/2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("opp_")).toBe(true);
  });
});
