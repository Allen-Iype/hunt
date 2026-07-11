/**
 * Shared teaser helper for discovery adapters (ADR-0015, ATS tier).
 *
 * A lead carries only a SHORT display/ranking snippet — never the full
 * description (the lead-vs-job invariant; the full text belongs to the import
 * pipeline). Both variants normalize whitespace and cap the length; they differ
 * only in whether the source text arrives as escaped HTML.
 *
 * - `plainTeaser` — for boards whose API already returns plain text
 *   (Lever `descriptionPlain`, Ashby `descriptionPlain`).
 * - `htmlTeaser` — for boards that return HTML-escaped markup (Greenhouse
 *   `content`): unescape a few entities and strip tags first.
 */

const MAX_TEASER = 200;

function truncate(text: string): string | undefined {
  if (text.length === 0) return undefined;
  return text.length > MAX_TEASER ? `${text.slice(0, MAX_TEASER - 3)}…` : text;
}

/** Normalize whitespace and cap length. */
export function plainTeaser(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return truncate(text.replace(/\s+/g, " ").trim());
}

/** Unescape common entities, strip tags, then normalize + cap. */
export function htmlTeaser(content: string | undefined): string | undefined {
  if (!content) return undefined;
  const text = content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text);
}
