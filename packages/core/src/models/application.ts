import { z } from "zod";
import { IdSchema, SchemaVersionSchema, TimestampSchema } from "./common.js";

/**
 * Canonical Application model (SDD §11, §12).
 *
 * Applications are the one event-sourced aggregate in Hunt (ADR-0010): the
 * append-only event log is the source of truth, `status` is a materialized
 * convenience. Transition rules live in state-machine.ts.
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

/** Fields shared by every event; `data` is typed per kind below. */
const eventBase = {
  id: IdSchema,
  applicationId: IdSchema,
  /** Monotonic per-application sequence number, assigned by storage on append. */
  seq: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
};

export const StatusChangedDataSchema = z.object({
  from: ApplicationStatusSchema,
  to: ApplicationStatusSchema,
  note: z.string().min(1).optional(),
});

export const NoteAddedDataSchema = z.object({
  text: z.string().min(1),
});

export const DocumentAttachedDataSchema = z.object({
  /** Reference to a generated document (M4) or an external file path. */
  ref: z.string().min(1),
  label: z.string().min(1).optional(),
});

export const ContactAddedDataSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  email: z.email().optional(),
  url: z.url().optional(),
});

export const ApplicationEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...eventBase, kind: z.literal("status_changed"), data: StatusChangedDataSchema }),
  z.object({ ...eventBase, kind: z.literal("note_added"), data: NoteAddedDataSchema }),
  z.object({ ...eventBase, kind: z.literal("document_attached"), data: DocumentAttachedDataSchema }),
  z.object({ ...eventBase, kind: z.literal("contact_added"), data: ContactAddedDataSchema }),
]);
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
export type ApplicationEventKind = ApplicationEvent["kind"];

/** An event as submitted for append: storage assigns `seq`. */
export type NewApplicationEvent = ApplicationEvent extends infer E
  ? E extends { seq: number }
    ? Omit<E, "seq">
    : never
  : never;

export const ApplicationSchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  jobId: IdSchema,
  status: ApplicationStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Application = z.infer<typeof ApplicationSchema>;
