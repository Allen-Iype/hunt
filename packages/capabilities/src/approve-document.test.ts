import { describe, expect, it } from "vitest";
import type { DocumentRepository, GeneratedDocument, ResumeDocument } from "@hunt/core";
import { createApproveDocument } from "./approve-document.js";

const draftDoc: ResumeDocument = {
  id: "doc_r1",
  schemaVersion: 1,
  kind: "resume",
  jobId: "job_x",
  analysisId: "ana_1",
  profileVersion: "2026-07-07T00:00:00Z",
  status: "draft",
  generationMeta: {
    generatorVersion: 1,
    aiTaskId: "draft-resume",
    aiTaskVersion: 1,
    providerId: "test",
    candidateFactIds: ["exp_1"],
    repairRounds: 0,
  },
  contact: { name: "Ada", links: [] },
  summary: { text: "Engineer", sourceFactIds: ["exp_1"] },
  sections: [{ heading: "Experience", bullets: [{ text: "Built things", sourceFactIds: ["exp_1"] }] }],
  createdAt: "2026-07-07T00:00:00Z",
};

function fakeRepo(initial?: GeneratedDocument) {
  const store = new Map<string, GeneratedDocument>();
  if (initial) store.set(initial.id, initial);
  const documents: DocumentRepository = {
    save: (d) => {
      store.set(d.id, d);
    },
    getById: (id) => store.get(id) ?? null,
    listForJob: () => [...store.values()],
    getLatestForJob: () => null,
  };
  return { documents, store };
}

describe("ApproveDocument", () => {
  it("flips a draft to approved (the review gate, SDD §17 step 5)", () => {
    const { documents, store } = fakeRepo(draftDoc);
    const result = createApproveDocument({ documents })({
      documentId: "doc_r1",
      renderPath: "/docs/r.html",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.status).toBe("approved");
    expect(result.document.renderPath).toBe("/docs/r.html");
    expect(store.get("doc_r1")!.status).toBe("approved");
  });

  it("rejects re-approval (approved documents are immutable)", () => {
    const { documents } = fakeRepo({ ...draftDoc, status: "approved" });
    const result = createApproveDocument({ documents })({ documentId: "doc_r1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("state");
  });

  it("errors on an unknown document id", () => {
    const { documents } = fakeRepo();
    const result = createApproveDocument({ documents })({ documentId: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("input");
  });
});
