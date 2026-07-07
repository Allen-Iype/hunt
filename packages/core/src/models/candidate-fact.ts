import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * A CandidateFact is the flattened, ID'd view of a single profile fact that
 * the composer is allowed to cite (SDD §17 step 1). Deterministic fact
 * selection produces the candidate set; the AI may cite ONLY these IDs, and
 * claim tracing (§17 step 3) validates every citation against this set.
 *
 * `kind` records which part of the profile the fact came from. `text` is the
 * verbatim claim material — the lexical claim check compares a bullet's
 * numbers/technologies against the `text` of the facts it cites. `skills` are
 * the dictionary skills detected in (or declared by) the fact.
 */
export const CandidateFactKindSchema = z.enum([
  "experience",
  "achievement",
  "skill",
  "project",
  "education",
  "certification",
]);
export type CandidateFactKind = z.infer<typeof CandidateFactKindSchema>;

export const CandidateFactSchema = z.object({
  id: IdSchema,
  kind: CandidateFactKindSchema,
  /** The verbatim claim material this fact contributes (role@company, achievement text, …). */
  text: z.string().min(1),
  /** Dictionary skills this fact evidences; used by relevance ranking and the lexical check. */
  skills: z.array(z.string().min(1)),
  /** For achievements: the parent experience id — lets the composer group by role. */
  parentId: IdSchema.optional(),
  /** Deterministic relevance score (0..1) against the job analysis; higher = more relevant. */
  relevance: z.number().min(0).max(1),
});
export type CandidateFact = z.infer<typeof CandidateFactSchema>;
