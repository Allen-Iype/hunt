import { z } from "zod";
import { IdSchema, SchemaVersionSchema, TimestampSchema } from "./common.js";

/**
 * Canonical Application model (SDD §11, §12). Draft (M0).
 *
 * Applications are the one event-sourced aggregate in Hunt: the append-only
 * event log is the source of truth, `status` is a materialized convenience.
 * The transition-validation state machine lands in M1; M0 drafts the shapes.
 */

export const ApplicationStatusSchema = z.enum([
  "discovered",
  "interested",
  "preparing",
  "applied",
  "screen",
  "tech",
  "onsite",
  "offer_pending",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ApplicationEventKindSchema = z.enum([
  "status_changed",
  "note_added",
  "document_attached",
  "contact_added",
]);

export const ApplicationEventSchema = z.object({
  id: IdSchema,
  applicationId: IdSchema,
  /** Monotonic per-application sequence number (assigned by storage). */
  seq: z.number().int().nonnegative(),
  kind: ApplicationEventKindSchema,
  /** Kind-specific payload; per-kind schemas are tightened in M1 alongside the state machine. */
  data: z.record(z.string(), z.unknown()),
  occurredAt: TimestampSchema,
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

export const ApplicationSchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  jobId: IdSchema,
  status: ApplicationStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Application = z.infer<typeof ApplicationSchema>;
