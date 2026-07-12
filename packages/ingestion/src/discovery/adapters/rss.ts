/**
 * Minimal RSS 2.0 item extractor for Tier-2 feed adapters (ADR-0015). We do NOT
 * reuse `node-html-parser` here: it treats `<link>` as an HTML void element, so
 * an RSS `<link>https://…</link>` loses its text and corrupts sibling nesting.
 * RSS 2.0 items are regular enough that scoped per-tag extraction is reliable
 * and — per YAGNI — avoids adding an XML dependency. Each adapter maps the raw
 * item fields to its own lead shape (title conventions differ per feed), so this
 * returns generic items.
 *
 * CDATA wrappers (common in RSS `description`) are stripped; a couple of XML
 * entities in element text are decoded.
 */

export interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  /** Non-standard but common on job feeds (e.g. We Work Remotely `<region>`). */
  region?: string;
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Extract the text of the first `<tag>…</tag>` within an item block. */
function tag(itemXml: string, name: string): string | undefined {
  const match = itemXml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return undefined;
  const value = decode(match[1] ?? "");
  return value.length > 0 ? value : undefined;
}

/** Parse an RSS 2.0 feed body into its items. Returns [] for non-RSS/empty input. */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = match[1] ?? "";
    const item: RssItem = {};
    const title = tag(block, "title");
    if (title) item.title = title;
    const link = tag(block, "link");
    if (link) item.link = link;
    const description = tag(block, "description");
    if (description) item.description = description;
    const region = tag(block, "region");
    if (region) item.region = region;
    items.push(item);
  }
  return items;
}
