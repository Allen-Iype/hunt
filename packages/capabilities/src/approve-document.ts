import type {
  DocumentRepository,
  GeneratedDocument,
  Id,
} from "@hunt/core";

/**
 * ApproveDocument capability (SDD §17 step 5): the mandatory human-review
 * gate. A document is not sendable until a human approves it. Approval is a
 * one-way transition — an already-approved document is immutable (SDD §11),
 * so re-approval is rejected rather than silently repeated. Fully
 * deterministic, no AI.
 *
 * The presentation layer is responsible for actually showing the rendered
 * document to the user before calling this (SDD §7); the capability records
 * the decision and, optionally, where the reviewed render lives.
 */

export interface ApproveDocumentDeps {
  documents: DocumentRepository;
}

export interface ApproveDocumentInput {
  documentId: Id;
  /** Path to the rendered file the user reviewed, recorded on the document. */
  renderPath?: string;
}

export type ApproveDocumentResult =
  | { ok: true; document: GeneratedDocument }
  | { ok: false; stage: "input" | "state" | "storage"; message: string; hint?: string };

export function createApproveDocument(deps: ApproveDocumentDeps) {
  return function approveDocument(input: ApproveDocumentInput): ApproveDocumentResult {
    const existing = deps.documents.getById(input.documentId);
    if (!existing) {
      return {
        ok: false,
        stage: "input",
        message: `document not found: ${input.documentId}`,
        hint: "generate one first: hunt resume <job-id> or hunt letter <job-id>",
      };
    }
    if (existing.status === "approved") {
      return {
        ok: false,
        stage: "state",
        message: `document ${input.documentId} is already approved (approved documents are immutable)`,
      };
    }

    const approved: GeneratedDocument = {
      ...existing,
      status: "approved",
      ...(input.renderPath ? { renderPath: input.renderPath } : {}),
    };
    try {
      deps.documents.save(approved);
    } catch (err) {
      return {
        ok: false,
        stage: "storage",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: true, document: approved };
  };
}
