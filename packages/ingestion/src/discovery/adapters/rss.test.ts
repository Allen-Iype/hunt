import { describe, expect, it } from "vitest";
import { parseRssItems } from "./rss.js";

/**
 * The RSS extractor exists because `node-html-parser` mishandles RSS `<link>`
 * (treats it as an HTML void element, dropping the URL). These tests pin the
 * behavior that motivated the standalone parser: link text survives, CDATA is
 * stripped, entities decode, and per-item tags don't bleed across items.
 */
describe("parseRssItems", () => {
  it("extracts title, link, description, and region per item", () => {
    const items = parseRssItems(`<rss><channel>
      <item>
        <title>Acme: Senior Backend Engineer</title>
        <link>https://example.com/jobs/1</link>
        <region>Worldwide</region>
        <description><![CDATA[<p>Go &amp; Kubernetes</p>]]></description>
      </item>
    </channel></rss>`);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: "Acme: Senior Backend Engineer",
      link: "https://example.com/jobs/1",
      region: "Worldwide",
      description: "<p>Go & Kubernetes</p>",
    });
  });

  it("keeps each item's fields scoped to that item", () => {
    const items = parseRssItems(`<rss><channel>
      <item><title>First</title><link>https://example.com/1</link></item>
      <item><title>Second</title><link>https://example.com/2</link></item>
    </channel></rss>`);
    expect(items.map((i) => i.link)).toEqual(["https://example.com/1", "https://example.com/2"]);
    expect(items.map((i) => i.title)).toEqual(["First", "Second"]);
  });

  it("returns an empty array for a feed with no items", () => {
    expect(parseRssItems("<rss><channel></channel></rss>")).toEqual([]);
  });
});
