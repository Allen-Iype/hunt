import type { Database } from "better-sqlite3";
import { RawEnvelopeSchema, type EnvelopeRepository, type RawEnvelope } from "@hunt/core";

export function createEnvelopeRepository(db: Database): EnvelopeRepository {
  const upsert = db.prepare(
    `INSERT INTO raw_envelopes (hash, source_id, adapter_version, content_type, input_ref, fetched_at, source_meta)
     VALUES (@hash, @sourceId, @adapterVersion, @contentType, @inputRef, @fetchedAt, @sourceMeta)
     ON CONFLICT(hash) DO NOTHING`,
  );
  const selectByHash = db.prepare(`SELECT * FROM raw_envelopes WHERE hash = ?`);

  interface Row {
    hash: string;
    source_id: string;
    adapter_version: string;
    content_type: string;
    input_ref: string;
    fetched_at: string;
    source_meta: string | null;
  }

  return {
    save(envelope: RawEnvelope): void {
      upsert.run({
        hash: envelope.hash,
        sourceId: envelope.sourceId,
        adapterVersion: envelope.adapterVersion,
        contentType: envelope.contentType,
        inputRef: envelope.inputRef,
        fetchedAt: envelope.fetchedAt,
        sourceMeta: envelope.sourceMeta ? JSON.stringify(envelope.sourceMeta) : null,
      });
    },

    getByHash(hash: string): RawEnvelope | null {
      const row = selectByHash.get(hash) as Row | undefined;
      if (!row) return null;
      return RawEnvelopeSchema.parse({
        hash: row.hash,
        sourceId: row.source_id,
        adapterVersion: row.adapter_version,
        contentType: row.content_type,
        inputRef: row.input_ref,
        fetchedAt: row.fetched_at,
        ...(row.source_meta ? { sourceMeta: JSON.parse(row.source_meta) } : {}),
      });
    },
  };
}
