import {
  ExtractedResumeDraftSchema,
  type ExtractResumePort,
  type ExtractResumeResult,
  type ExtractedResumeDraft,
} from "@hunt/core";
import { runStructuredTask, type AiTask, type GatewayOptions } from "../gateway.js";

/** Resumes beyond this length are truncated: the tail is rarely load-bearing. */
const MAX_INPUT_CHARS = 24_000;

export const EXTRACT_RESUME_TASK: AiTask<{ text: string }, ExtractedResumeDraft> = {
  id: "extract-resume",
  version: 1,
  maxTokens: 3_000,
  instructions: [
    "You extract structured facts from a candidate's resume.",
    "Rules:",
    "- Report ONLY facts stated in the resume. Never infer, embellish, or fill gaps.",
    "- Omit optional fields the resume does not state; leave arrays empty rather than guessing.",
    "- basics: the candidate's name (required), plus email/phone/location/headline and links if present.",
    "- experience: each role held — company, title (role), and dates. Copy dates as written; do not invent day/month precision the resume lacks.",
    "- achievements: bullet points under a role, verbatim in substance. skills: concrete technologies named in that bullet, lowercase.",
    "- skills: technologies/methodologies the resume lists as skills, lowercase; set level/years only if the resume states them.",
    "- projects: named projects with their description; url only if a link is given.",
    "- education and certifications: only what is written; omit fields not stated.",
    "- Never assert anything about verification, seniority, or fit — you extract, you do not judge.",
  ].join("\n"),
  outputSchema: ExtractedResumeDraftSchema,
  renderInput: ({ text }) =>
    `Extract the resume below.\n---\n${text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}\n[truncated]` : text}`,
};

/**
 * Implements core's domain-shaped ExtractResumePort (ADR-0013) over the gateway.
 */
export function createAiResumeExtractor(options: GatewayOptions): ExtractResumePort {
  return {
    async extractResume(input): Promise<ExtractResumeResult> {
      const result = await runStructuredTask(options, EXTRACT_RESUME_TASK, input);
      if (result.ok) return { ok: true, draft: result.output };
      return {
        ok: false,
        kind: result.kind === "replay-miss" ? "provider" : result.kind,
        message: result.message,
      };
    },
  };
}
