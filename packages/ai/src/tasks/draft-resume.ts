import {
  ResumeDraftSchema,
  type CandidateFact,
  type ComposeContext,
  type ComposeResult,
  type ComposeResumePort,
  type ResumeDraft,
} from "@hunt/core";
import { runStructuredTask, type AiTask, type GatewayOptions } from "../gateway.js";

/**
 * Resume composition (SDD §17 step 2, ADR-0006). The model's creative surface
 * is phrasing and emphasis ONLY: it receives the deterministically-selected
 * candidate facts and must build every bullet from them, citing their ids.
 * It cannot introduce experience, metrics, or technologies the facts don't
 * carry — the claim tracer (§17 step 3) rejects anything that isn't grounded.
 */

interface ComposeResumeInput {
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

export const DRAFT_RESUME_TASK: AiTask<ComposeResumeInput, ResumeDraft> = {
  id: "draft-resume",
  version: 1,
  maxTokens: 3_000,
  instructions: [
    "You compose a tailored resume for a specific job from a fixed set of candidate facts.",
    "Absolute rules (a violation makes the whole resume unusable):",
    "- Use ONLY the candidate facts provided. Never introduce an employer, role, metric, date, or technology that is not present in a fact.",
    "- Every bullet and the summary MUST cite sourceFactIds — the ids of the facts it is built from. Cite only ids from the provided list.",
    "- Do not invent or inflate numbers. If a fact says 40%, you may write 40%; you may not write 90% or \"massive\".",
    "- Only name a technology in a bullet if one of that bullet's cited facts mentions it.",
    "- Rephrase and emphasize for the target job, but the underlying claim must remain true to the cited facts.",
    "- Choose and order the strongest, most relevant facts. Omit weak or irrelevant ones — you need not use every fact.",
    "- summary: one line positioning the candidate for this role, citing the facts it draws on.",
    "- sections: group bullets under headings (e.g. Experience, Projects, Skills). Keep bullets concise and outcome-focused.",
  ].join("\n"),
  outputSchema: ResumeDraftSchema,
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

export function createAiResumeComposer(options: GatewayOptions): ComposeResumePort {
  return {
    async composeResume(input): Promise<ComposeResult<ResumeDraft>> {
      const result = await runStructuredTask(options, DRAFT_RESUME_TASK, {
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
