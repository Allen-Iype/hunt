import {
  ExtractedJobDraftSchema,
  type ExtractJobPort,
  type ExtractJobResult,
  type ExtractedJobDraft,
} from "@hunt/core";
import { runStructuredTask, type AiTask, type GatewayOptions } from "../gateway.js";

/** Postings beyond this length are truncated: tails are boilerplate, not facts. */
const MAX_INPUT_CHARS = 24_000;

export const EXTRACT_JOB_TASK: AiTask<{ text: string }, ExtractedJobDraft> = {
  id: "extract-job",
  version: 1,
  maxTokens: 2_000,
  instructions: [
    "You extract structured data from job postings.",
    "Rules:",
    "- Report ONLY facts stated in the posting. Never infer, embellish, or fill gaps.",
    "- Omit optional fields that the posting does not state; use \"unspecified\" enum values when unsure.",
    "- requirements: candidate qualifications. kind is \"must\" only when the posting marks it required; \"nice\" when marked preferred/bonus; otherwise \"unknown\".",
    "- responsibilities: what the role does day to day.",
    "- skills: concrete technologies/methodologies named in the posting, lowercase.",
    "- compensationRaw: the pay text verbatim if present.",
    "- postedAt: ISO format, only if a posting date is stated.",
  ].join("\n"),
  outputSchema: ExtractedJobDraftSchema,
  renderInput: ({ text }) =>
    `Extract the job posting below.\n---\n${text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}\n[truncated]` : text}`,
};

/**
 * Implements core's domain-shaped ExtractJobPort (ADR-0013) over the gateway.
 */
export function createAiJobExtractor(options: GatewayOptions): ExtractJobPort {
  return {
    async extractJob(input): Promise<ExtractJobResult> {
      const result = await runStructuredTask(options, EXTRACT_JOB_TASK, input);
      if (result.ok) return { ok: true, draft: result.output };
      return {
        ok: false,
        kind: result.kind === "replay-miss" ? "provider" : result.kind,
        message: result.message,
      };
    },
  };
}
