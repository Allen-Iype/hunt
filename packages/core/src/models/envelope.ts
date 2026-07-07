import { z } from "zod";
import { TimestampSchema } from "./common.js";

/**
 * Raw envelope metadata (SDD §8): the universal ingestion currency. The
 * verbatim payload itself lives in the content-addressed vault under `hash`;
 * this model is the metadata describing where it came from.
 */
export const RawEnvelopeSchema = z.object({
  /** SHA-256 hex of the verbatim payload; vault address. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  sourceId: z.string().min(1),
  adapterVersion: z.string().min(1),
  /** MIME-ish type of the payload, e.g. "text/html", "text/plain". */
  contentType: z.string().min(1),
  /** What the adapter was given: a URL, "paste:stdin", a file path, … */
  inputRef: z.string().min(1),
  fetchedAt: TimestampSchema,
  /** Adapter-specific extras (e.g. final URL after redirects). Opaque to core. */
  sourceMeta: z.record(z.string(), z.string()).optional(),
});
export type RawEnvelope = z.infer<typeof RawEnvelopeSchema>;
