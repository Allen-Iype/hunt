import type { CoverLetterDocument, RenderOutput, RenderPort, ResumeDocument } from "@hunt/core";
import { renderCoverLetterHtml, renderResumeHtml } from "./html.js";

/**
 * The HTML render adapter (SDD §17 step 4). Implements core's RenderPort.
 * Self-contained HTML with embedded print CSS; PDF is out of V1 (ADR-0014)
 * and, when it arrives, is a new adapter behind this same port.
 */
export function createHtmlRenderer(): RenderPort {
  return {
    renderResume(doc: ResumeDocument): RenderOutput {
      return { contentType: "text/html", content: renderResumeHtml(doc), extension: "html" };
    },
    renderCoverLetter(doc: CoverLetterDocument): RenderOutput {
      return { contentType: "text/html", content: renderCoverLetterHtml(doc), extension: "html" };
    },
  };
}

export { escapeHtml, renderCoverLetterHtml, renderResumeHtml } from "./html.js";
