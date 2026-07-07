import type {
  CoverLetterDocument,
  DocumentBullet,
  DocumentSection,
  ResumeDocument,
} from "@hunt/core";

/**
 * HTML rendering (SDD §17 step 4). Templates are data — plain string
 * builders, no framework — producing a self-contained HTML document with
 * embedded print CSS. PDF is deliberately out of V1 (ADR-0014): the user
 * prints to PDF from the browser, and a headless renderer can be added behind
 * the RenderPort later without touching a consumer.
 *
 * All interpolated text is HTML-escaped: profile and job text are effectively
 * untrusted (job postings are attacker-controllable, SDD §21), and a
 * generated document must never become an injection vector.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRINT_CSS = `
  :root { --ink: #1a1a1a; --muted: #555; --rule: #ddd; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: var(--ink);
    max-width: 760px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    line-height: 1.45;
  }
  h1 { font-size: 1.6rem; margin: 0 0 0.15rem; }
  h2 {
    font-size: 1.05rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 0.2rem;
    margin: 1.4rem 0 0.6rem;
  }
  .contact { color: var(--muted); font-size: 0.9rem; margin-bottom: 0.4rem; }
  .contact a { color: var(--muted); }
  .summary { font-style: italic; margin: 0.6rem 0 0.2rem; }
  ul { margin: 0.3rem 0 0.6rem; padding-left: 1.2rem; }
  li { margin: 0.25rem 0; }
  p { margin: 0.5rem 0; }
  .letter-meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
  @media print {
    body { margin: 0; max-width: none; font-size: 11pt; }
    h2 { page-break-after: avoid; }
    li, p { page-break-inside: avoid; }
  }
`;

function page(title: string, body: string): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PRINT_CSS}</style>`,
    `</head>`,
    `<body>`,
    body,
    `</body>`,
    `</html>`,
  ].join("\n");
}

function bulletList(bullets: readonly DocumentBullet[]): string {
  const items = bullets.map((b) => `    <li>${escapeHtml(b.text)}</li>`).join("\n");
  return `  <ul>\n${items}\n  </ul>`;
}

function section(s: DocumentSection): string {
  return `  <h2>${escapeHtml(s.heading)}</h2>\n${bulletList(s.bullets)}`;
}

export function renderResumeHtml(doc: ResumeDocument): string {
  const c = doc.contact;
  const contactBits = [c.email, c.phone, c.location].filter(Boolean).map((v) => escapeHtml(v!));
  const links = c.links.map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`);
  const contactLine = [...contactBits, ...links].join(" · ");
  const body = [
    `  <h1>${escapeHtml(c.name)}</h1>`,
    contactLine ? `  <div class="contact">${contactLine}</div>` : "",
    `  <p class="summary">${escapeHtml(doc.summary.text)}</p>`,
    ...doc.sections.map(section),
  ]
    .filter(Boolean)
    .join("\n");
  return page(`${c.name} — Resume`, body);
}

export function renderCoverLetterHtml(doc: CoverLetterDocument): string {
  const paragraphs = [doc.hook, ...doc.body, doc.closing]
    .map((b) => `  <p>${escapeHtml(b.text)}</p>`)
    .join("\n");
  const body = [
    `  <h1>${escapeHtml(doc.jobTitle)} — ${escapeHtml(doc.companyName)}</h1>`,
    `  <div class="letter-meta">Cover letter</div>`,
    paragraphs,
  ].join("\n");
  return page(`Cover letter — ${doc.companyName}`, body);
}
