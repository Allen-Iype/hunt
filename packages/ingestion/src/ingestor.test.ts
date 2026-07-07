import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractedJobDraftSchema } from "@hunt/core";
import { createJobIngestor } from "./ingestor.js";
import {
  FIXED_NOW,
  fakeExtractor,
  fixedClock,
  loadFixture,
  memoryEnvelopes,
  memoryVault,
} from "./testing/helpers.js";

afterEach(() => vi.unstubAllGlobals());

function makeIngestor(extractJob?: ReturnType<typeof fakeExtractor>) {
  const vault = memoryVault();
  const envelopes = memoryEnvelopes();
  const ingestor = createJobIngestor({ vault, envelopes, extractJob, clock: fixedClock });
  return { ingestor, vault, envelopes };
}

const PLAIN_DRAFT = ExtractedJobDraftSchema.parse({
  title: "Platform Engineer",
  companyName: "Pied Piper",
  locations: ["Remote, EU"],
  workplaceType: "remote",
  seniority: "senior",
  requirements: [
    { text: "5+ years of infrastructure experience", kind: "must" },
    { text: "Rust experience", kind: "nice" },
  ],
  skills: ["kubernetes", "go", "typescript"],
  compensationRaw: "EUR 95,000 - 120,000 per year",
});

describe("job ingestor pipeline", () => {
  it("pasted JSON-LD page: structured tier, no AI call, envelope persisted first", async () => {
    const extractor = fakeExtractor({ ok: true, draft: PLAIN_DRAFT });
    const { ingestor, vault, envelopes } = makeIngestor(extractor);

    const result = await ingestor.ingest({
      kind: "content",
      content: loadFixture("greenhouse.html"),
      inputRef: "file:greenhouse.html",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.provenance.extractionTier).toBe("structured");
    expect(result.aiUsed).toBe(false);
    expect(extractor.calls).toHaveLength(0);
    expect(result.job.title).toBe("Senior Backend Engineer");
    expect(result.job.companyName).toBe("Initech");
    // Verbatim payload is content-addressed and indexed.
    expect(vault.has(result.envelope.hash)).toBe(true);
    expect(envelopes.getByHash(result.envelope.hash)?.sourceId).toBe("paste");
    expect(result.job.provenance.envelopeHash).toBe(result.envelope.hash);
  });

  it("plain text paste: AI tier fills requirements and skills", async () => {
    const extractor = fakeExtractor({ ok: true, draft: PLAIN_DRAFT });
    const { ingestor } = makeIngestor(extractor);

    const result = await ingestor.ingest({
      kind: "content",
      content: loadFixture("plain-posting.txt"),
      inputRef: "paste:stdin",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.provenance.extractionTier).toBe("ai");
    expect(result.aiUsed).toBe(true);
    expect(extractor.calls).toHaveLength(1);
    expect(result.job.requirements).toHaveLength(2);
    expect(result.job.requirements[0]).toMatchObject({ id: "req_1", kind: "must" });
    expect(result.job.compensation?.raw).toBe("EUR 95,000 - 120,000 per year");
  });

  it("identical content ingests to the identical job id and dedup hash", async () => {
    const { ingestor } = makeIngestor();
    const a = await ingestor.ingest({
      kind: "content",
      content: loadFixture("greenhouse.html"),
      inputRef: "file:a.html",
    });
    const b = await ingestor.ingest({
      kind: "content",
      content: loadFixture("greenhouse.html"),
      inputRef: "file:b.html",
    });
    if (!a.ok || !b.ok) throw new Error("expected success");
    expect(a.job.id).toBe(b.job.id);
    expect(a.job.dedupHash).toBe(b.job.dedupHash);
  });

  it("no AI configured: structured tier still works (no-AI suite)", async () => {
    const { ingestor } = makeIngestor(undefined);
    const result = await ingestor.ingest({
      kind: "content",
      content: loadFixture("lever.html"),
      inputRef: "file:lever.html",
    });
    expect(result.ok).toBe(true);
  });

  it("no AI configured: prose input fails fast with an actionable hint (no-AI suite)", async () => {
    const { ingestor, vault } = makeIngestor(undefined);
    const result = await ingestor.ingest({
      kind: "content",
      content: loadFixture("plain-posting.txt"),
      inputRef: "paste:stdin",
    });
    expect(result).toMatchObject({
      ok: false,
      stage: "normalize",
      hint: expect.stringContaining("ANTHROPIC_API_KEY"),
    });
    // The envelope was still preserved — nothing is lost (ADR-0004).
    expect(vault.store.size).toBe(1);
  });

  it("AI extraction failure surfaces as a normalize error, envelope preserved", async () => {
    const extractor = fakeExtractor({ ok: false, kind: "provider", message: "quota exceeded" });
    const { ingestor, vault } = makeIngestor(extractor);
    const result = await ingestor.ingest({
      kind: "content",
      content: "Just some prose about a job.",
      inputRef: "paste:stdin",
    });
    expect(result).toMatchObject({ ok: false, stage: "normalize" });
    if (result.ok) return;
    expect(result.message).toContain("quota exceeded");
    expect(vault.store.size).toBe(1);
  });

  it("URL ingest: LinkedIn adapter fetches, JSON-LD tier normalizes", async () => {
    vi.stubGlobal("fetch", async () => new Response(loadFixture("linkedin-jsonld.html")));
    const { ingestor, envelopes } = makeIngestor();
    const result = await ingestor.ingest({
      kind: "url",
      url: "https://www.linkedin.com/jobs/view/4012345678",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.provenance.sourceId).toBe("linkedin");
    expect(result.job.provenance.extractionTier).toBe("structured");
    expect(envelopes.getByHash(result.envelope.hash)?.inputRef).toContain("linkedin.com");
  });

  it("URL ingest: DOM tier kicks in when JSON-LD is absent", async () => {
    vi.stubGlobal("fetch", async () => new Response(loadFixture("linkedin-dom.html")));
    const { ingestor } = makeIngestor();
    const result = await ingestor.ingest({
      kind: "url",
      url: "https://www.linkedin.com/jobs/view/4012345678",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.provenance.extractionTier).toBe("dom");
    expect(result.job.title).toBe("Frontend Engineer");
  });

  it("URL ingest: auth wall becomes a fetch-stage error with the paste hint", async () => {
    vi.stubGlobal("fetch", async () => new Response(loadFixture("linkedin-authwall.html")));
    const { ingestor } = makeIngestor();
    const result = await ingestor.ingest({
      kind: "url",
      url: "https://www.linkedin.com/jobs/view/4012345678",
    });
    expect(result).toMatchObject({
      ok: false,
      stage: "fetch",
      hint: expect.stringContaining("hunt import -"),
    });
  });

  it("rejects non-http inputs at resolve stage", async () => {
    const { ingestor } = makeIngestor();
    const result = await ingestor.ingest({ kind: "url", url: "ftp://example.com/job" });
    expect(result).toMatchObject({ ok: false, stage: "resolve" });
  });

  it("stamps deterministic timestamps from the injected clock", async () => {
    const { ingestor } = makeIngestor();
    const result = await ingestor.ingest({
      kind: "content",
      content: loadFixture("greenhouse.html"),
      inputRef: "file:x",
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.job.createdAt).toBe(FIXED_NOW);
    expect(result.envelope.fetchedAt).toBe(FIXED_NOW);
  });
});
