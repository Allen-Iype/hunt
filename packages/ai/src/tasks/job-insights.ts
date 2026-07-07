import {
  JobInsightsSchema,
  type JobInsights,
  type JobInsightsPort,
  type JobInsightsResult,
} from "@hunt/core";
import { runStructuredTask, type AiTask, type GatewayOptions } from "../gateway.js";

const MAX_INPUT_CHARS = 24_000;

interface JobInsightsInput {
  title: string;
  descriptionText: string;
  matchedSkills: readonly string[];
  missingSkills: readonly string[];
}

export const JOB_INSIGHTS_TASK: AiTask<JobInsightsInput, JobInsights> = {
  id: "job-insights",
  version: 1,
  maxTokens: 2_000,
  instructions: [
    "You analyze a job posting for a specific candidate.",
    "Rules:",
    "- Ground every statement in the posting text or the provided match results. Never invent.",
    "- requirements: candidate qualifications from the posting. kind is \"must\" only when the posting marks it required, \"nice\" when marked preferred/bonus/plus, otherwise \"unknown\". Pick the closest category.",
    "- seniority: infer the role's level from responsibilities and expectations; \"unspecified\" when unclear.",
    "- redFlags: observable concerns in the posting itself (vague scope, unpaid on-call, buzzword-only description). Empty when none — do not manufacture concerns.",
    "- implicitExpectations: expectations implied but not stated. Empty when none.",
    "- gapNarrative: 2-4 sentences on how the candidate's matched/missing skills bear on this role. Refer only to the provided skill lists.",
  ].join("\n"),
  outputSchema: JobInsightsSchema,
  renderInput: ({ title, descriptionText, matchedSkills, missingSkills }) => {
    const text =
      descriptionText.length > MAX_INPUT_CHARS
        ? `${descriptionText.slice(0, MAX_INPUT_CHARS)}\n[truncated]`
        : descriptionText;
    return [
      `Job title: ${title}`,
      `Candidate's matched skills: ${matchedSkills.join(", ") || "(none)"}`,
      `Candidate's missing skills: ${missingSkills.join(", ") || "(none)"}`,
      `Posting:`,
      `---`,
      text,
    ].join("\n");
  },
};

export function createAiJobInsights(options: GatewayOptions): JobInsightsPort {
  return {
    async getJobInsights(input): Promise<JobInsightsResult> {
      const result = await runStructuredTask(options, JOB_INSIGHTS_TASK, input);
      if (result.ok) return { ok: true, insights: result.output };
      return {
        ok: false,
        kind: result.kind === "replay-miss" ? "provider" : result.kind,
        message: result.message,
      };
    },
  };
}
