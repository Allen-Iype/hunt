import {
  RawEnvelopeSchema,
  type EnvelopeRepository,
  type ExtractJobPort,
  type ExtractedJobDraft,
  type ExtractionTier,
  type IngestJobInput,
  type IngestJobResult,
  type JobIngestor,
  type RawEnvelope,
  type RawVault,
} from "@hunt/core";
import type { SourceAdapter } from "./adapters/types.js";
import { assembleJob } from "./assemble.js";
import { FetchError } from "./fetch.js";
import { htmlToText, looksLikeHtml } from "./html.js";
import { extractJobPostingJsonLd } from "./jsonld.js";
import { resolveAdapter } from "./registry.js";

const PASTE_ADAPTER_VERSION = "0.1.0";

export interface JobIngestorDeps {
  vault: RawVault;
  envelopes: EnvelopeRepository;
  /** Tier-3 fallback; absent = no-AI mode, structured/DOM tiers still work. */
  extractJob?: ExtractJobPort | undefined;
  /** Injectable clock for deterministic tests. */
  clock?: () => string;
}

const NO_AI_HINT =
  "this posting has no structured data, so AI extraction is needed — " +
  "set ANTHROPIC_API_KEY (cloud) or HUNT_AI_PROVIDER=ollama (local), " +
  "or import a page that includes JobPosting JSON-LD";

/**
 * The two-phase pipeline (SDD §9, ADR-0004): persist the verbatim envelope
 * first, then normalize through tiers (JSON-LD → source DOM → AI). Nothing
 * is lost on normalization failure — the envelope is already in the vault.
 */
export function createJobIngestor(deps: JobIngestorDeps): JobIngestor {
  const clock = deps.clock ?? (() => new Date().toISOString());

  function persistEnvelope(
    payload: string,
    sourceId: string,
    adapterVersion: string,
    contentType: string,
    inputRef: string,
  ): RawEnvelope {
    const hash = deps.vault.put(payload);
    const envelope = RawEnvelopeSchema.parse({
      hash,
      sourceId,
      adapterVersion,
      contentType,
      inputRef,
      fetchedAt: clock(),
    });
    deps.envelopes.save(envelope);
    return envelope;
  }

  async function normalize(
    payload: string,
    isHtml: boolean,
    adapter: SourceAdapter | null,
  ): Promise<
    | { ok: true; draft: ExtractedJobDraft; descriptionText: string; tier: ExtractionTier }
    | { ok: false; message: string; hint?: string }
  > {
    if (isHtml) {
      const structured = extractJobPostingJsonLd(payload);
      if (structured) return { ok: true, ...structured, tier: "structured" };

      const dom = adapter?.domExtract?.(payload);
      if (dom) return { ok: true, ...dom, tier: "dom" };
    }

    const text = isHtml ? htmlToText(payload) : payload.trim();
    if (text.length === 0) {
      return { ok: false, message: "the input contains no readable text" };
    }
    if (!deps.extractJob) {
      return { ok: false, message: "no AI provider configured", hint: NO_AI_HINT };
    }
    const extracted = await deps.extractJob.extractJob({ text });
    if (!extracted.ok) {
      return { ok: false, message: `AI extraction failed (${extracted.kind}): ${extracted.message}` };
    }
    return { ok: true, draft: extracted.draft, descriptionText: text, tier: "ai" };
  }

  return {
    async ingest(input: IngestJobInput): Promise<IngestJobResult> {
      let payload: string;
      let isHtml: boolean;
      let adapter: SourceAdapter | null = null;
      let envelope: RawEnvelope;

      if (input.kind === "url") {
        adapter = resolveAdapter(input.url);
        if (!adapter) {
          return {
            ok: false,
            stage: "resolve",
            message: `no adapter accepts this input: ${input.url}`,
            hint: "give an http(s) job URL, or paste the posting: hunt import -",
          };
        }
        try {
          payload = await adapter.fetchUrl(input.url);
        } catch (err) {
          return {
            ok: false,
            stage: "fetch",
            message: err instanceof Error ? err.message : String(err),
            ...(err instanceof FetchError && err.hint ? { hint: err.hint } : {}),
          };
        }
        isHtml = true;
        envelope = persistEnvelope(payload, adapter.id, adapter.version, "text/html", input.url);
      } else {
        payload = input.content;
        isHtml = input.contentTypeHint ? input.contentTypeHint === "html" : looksLikeHtml(payload);
        envelope = persistEnvelope(
          payload,
          "paste",
          PASTE_ADAPTER_VERSION,
          isHtml ? "text/html" : "text/plain",
          input.inputRef,
        );
      }

      const normalized = await normalize(payload, isHtml, adapter);
      if (!normalized.ok) {
        return {
          ok: false,
          stage: "normalize",
          message: normalized.message,
          ...(normalized.hint ? { hint: normalized.hint } : {}),
        };
      }

      const job = assembleJob({
        draft: normalized.draft,
        descriptionText: normalized.descriptionText,
        envelope,
        tier: normalized.tier,
        now: clock(),
      });
      return { ok: true, job, envelope, aiUsed: normalized.tier === "ai" };
    },
  };
}
