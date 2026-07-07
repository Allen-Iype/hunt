import { parse } from "node-html-parser";

/** Convert an HTML fragment/document to readable plain text. */
export function htmlToText(html: string): string {
  const root = parse(html, { blockTextElements: { script: false, style: false } });
  return root.structuredText.replace(/\n{3,}/g, "\n\n").trim();
}

/** Heuristic: does this pasted content look like HTML rather than plain text? */
export function looksLikeHtml(content: string): boolean {
  return /<([a-z][a-z0-9-]*)(\s[^>]*)?>/i.test(content) && /<\/[a-z]/i.test(content);
}
