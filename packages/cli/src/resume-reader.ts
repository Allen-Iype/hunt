import { readFileSync } from "node:fs";

/**
 * Bytes → text: the one place that turns a resume file into plain text for the
 * ImportResume capability (M6 Phase 2). Kept in the CLI (presentation) layer so
 * `@hunt/core`/`@hunt/capabilities` never depend on document parsers — they
 * speak only `resumeText: string`.
 *
 * PDF (`pdf-parse` → pdfjs) and DOCX (`mammoth`) parsers are HEAVY and partly
 * native, so they are imported LAZILY — only when a PDF or DOCX is actually
 * read. The common text/paste path (and every other command) never loads them.
 *
 * Format is decided by file extension, with a magic-byte fallback so content
 * wins over a wrong or missing extension.
 */

export type ResumeFormat = "pdf" | "docx" | "text";

export type ReadResumeResult =
  | { ok: true; text: string; format: ResumeFormat }
  | { ok: false; error: string };

/** pdf-parse injects `-- N of M --` separators between pages; drop them. */
function stripPdfPageMarkers(text: string): string {
  return text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "");
}

/** Sniff by leading bytes: `%PDF-` → pdf; `PK\x03\x04` (zip) → docx. */
function sniffFormat(bytes: Buffer): ResumeFormat | null {
  if (bytes.length >= 5 && bytes.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "docx";
  }
  return null;
}

function formatFromExtension(path: string): ResumeFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".text") || lower.endsWith(".md")) return "text";
  return null;
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const { text } = await parser.getText();
    return stripPdfPageMarkers(text);
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return value;
}

/**
 * Read a resume file and return its plain text. Detects PDF/DOCX/text by
 * extension then by magic bytes; extracts accordingly. Returns a typed error
 * (never throws) for unreadable files or a document with no extractable text
 * (e.g. a scanned, image-only PDF).
 */
export async function readResumeText(path: string): Promise<ReadResumeResult> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (err) {
    return { ok: false, error: `Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Magic bytes win over extension (a .txt that is really a PDF, or no extension).
  const format = sniffFormat(bytes) ?? formatFromExtension(path) ?? "text";

  let text: string;
  try {
    if (format === "pdf") text = await extractPdf(bytes);
    else if (format === "docx") text = await extractDocx(bytes);
    else text = bytes.toString("utf8");
  } catch (err) {
    return {
      ok: false,
      error: `Could not extract text from ${path} (${format}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (text.trim().length === 0) {
    const hint =
      format === "pdf"
        ? " — the PDF may be scanned images; export or paste a text resume instead"
        : "";
    return { ok: false, error: `No extractable text in ${path}${hint}` };
  }

  return { ok: true, text, format };
}
