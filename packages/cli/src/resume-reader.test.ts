import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readResumeText } from "./resume-reader.js";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./testing/fixtures/${name}`, import.meta.url));

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});
function tmpFile(name: string, content: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "hunt-reader-test-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

describe("readResumeText", () => {
  it("extracts text from a PDF resume (page markers stripped)", async () => {
    const result = await readResumeText(fixture("sample-resume.pdf"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("pdf");
    expect(result.text).toContain("Dana Sample");
    expect(result.text).toContain("TypeScript");
    // pdf-parse's "-- 1 of 1 --" page separator must be removed.
    expect(result.text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
  });

  it("extracts text from a DOCX resume", async () => {
    const result = await readResumeText(fixture("sample-resume.docx"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("docx");
    expect(result.text).toContain("Dana Sample");
    expect(result.text).toContain("Kubernetes");
  });

  it("reads a plain-text resume as-is", async () => {
    const path = tmpFile("resume.txt", "Ada Example\nSoftware Engineer\n");
    const result = await readResumeText(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("text");
    expect(result.text).toContain("Ada Example");
  });

  it("detects format by magic bytes, not just extension (a .txt that is really a PDF)", async () => {
    // Copy the real PDF's bytes under a .txt name — content must win.
    const pdfBytes = await import("node:fs").then((fs) => fs.readFileSync(fixture("sample-resume.pdf")));
    const path = tmpFile("mislabeled.txt", pdfBytes);
    const result = await readResumeText(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("pdf");
    expect(result.text).toContain("Dana Sample");
  });

  it("returns a typed error for an unreadable file (no throw)", async () => {
    const result = await readResumeText("/no/such/resume.pdf");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Cannot read");
  });

  it("guards against a resume with no extractable text", async () => {
    const path = tmpFile("empty.txt", "   \n\t  \n");
    const result = await readResumeText(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No extractable text");
  });
});
