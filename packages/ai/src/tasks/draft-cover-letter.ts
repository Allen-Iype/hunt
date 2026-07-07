import {
  CoverLetterDraftSchema,
  type CandidateFact,
  type ComposeContext,
  type ComposeCoverLetterPort,
  type ComposeResult,
  type CoverLetterDraft,
} from "@hunt/core";
import { runStructuredTask, type AiTask, type GatewayOptions } from "../gateway.js";

/**
 * Cover-letter composition (SDD §13, §17). Same grounding rails as the
 * resume: hook, body claims, and closing are each a bullet that must cite the
 * candidate facts it is built from — the claim tracer validates them
 * identically. Prose is warmer than a resume, but no claim may outrun a fact.
 */

interface ComposeCoverLetterInput {
  context: ComposeContext;
  candidateFacts: readonly CandidateFact[];
  repairFeedback?: string | undefined;
}

const MAX_CONTEXT_CHARS = 6_000;

function renderFacts(facts: readonly CandidateFact[]): string {
  return facts
    .map((f) => {
      const skills = f.skills.length > 0 ? ` [skills: ${f.skills.join(", ")}]` : "";
      return `${f.id} (${f.kind}): ${f.text}${skills}`;
    })
    .join("\n");
}

export const DRAFT_COVER_LETTER_TASK: AiTask<ComposeCoverLetterInput, CoverLetterDraft> = {
  id: "draft-cover-letter",
  version: 1,
  maxTokens: 2_500,
  instructions: [
    "You compose a tailored cover letter for a specific job from a fixed set of candidate facts.",
    "Absolute rules (a violation makes the whole letter unusable):",
    "- Use ONLY the candidate facts provided. Never introduce an employer, role, metric, date, or technology absent from a fact.",
    "- hook, every body item, and closing MUST cite sourceFactIds from the provided list.",
    "- Do not invent or inflate numbers, and only name a technology when a cited fact mentions it.",
    "- You may write warmer, connective prose than a resume, but every concrete claim must trace to a cited fact. Motivation/enthusiasm sentences still must cite the fact that motivates them.",
    "- hook: an opening that connects the candidate to this specific role.",
    "- body: 2-4 claims that show fit, each grounded in facts.",
    "- closing: a brief, specific sign-off.",
  ].join("\n"),
  outputSchema: CoverLetterDraftSchema,
  renderInput: ({ context, candidateFacts, repairFeedback }) => {
    const ctx =
      context.jobContext.length > MAX_CONTEXT_CHARS
        ? `${context.jobContext.slice(0, MAX_CONTEXT_CHARS)}\n[truncated]`
        : context.jobContext;
    const parts = [
      `Target role: ${context.jobTitle} at ${context.companyName}`,
      `Skills the role wants that the candidate lacks (do NOT claim these): ${
        context.missingSkills.join(", ") || "(none)"
      }`,
      `Job context:`,
      `---`,
      ctx,
      `---`,
      `Candidate facts (cite these ids):`,
      renderFacts(candidateFacts),
    ];
    if (repairFeedback) {
      parts.push(
        ``,
        `Your previous draft had grounding violations. Fix EACH one — remove the unsupported claim or cite a fact that supports it:`,
        repairFeedback,
      );
    }
    return parts.join("\n");
  },
};

export function createAiCoverLetterComposer(options: GatewayOptions): ComposeCoverLetterPort {
  return {
    async composeCoverLetter(input): Promise<ComposeResult<CoverLetterDraft>> {
      const result = await runStructuredTask(options, DRAFT_COVER_LETTER_TASK, {
        context: input.context,
        candidateFacts: input.candidateFacts,
        repairFeedback: input.repairFeedback,
      });
      if (result.ok) {
        return {
          ok: true,
          draft: result.output,
          providerId: result.providerId,
          taskVersion: result.taskVersion,
        };
      }
      return {
        ok: false,
        kind: result.kind === "replay-miss" ? "provider" : result.kind,
        message: result.message,
      };
    },
  };
}
