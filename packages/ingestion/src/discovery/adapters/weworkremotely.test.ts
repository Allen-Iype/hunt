import { describe, expect, it } from "vitest";
import { createWeWorkRemotelyAdapter } from "./weworkremotely.js";

/**
 * Fixture: a recorded We Work Remotely RSS feed body
 * (weworkremotely.com/remote-jobs.rss). Item titles follow the "Company: Job
 * Title" convention; `<region>` carries location; `<description>` is HTML
 * (wrapped in CDATA, as WWR does). The HTTP call is injected so the adapter is
 * tested fully offline (SDD §20).
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    <item>
      <title>Acme: Senior Backend Engineer</title>
      <link>https://weworkremotely.com/remote-jobs/acme-senior-backend</link>
      <region>Anywhere in the World</region>
      <description><![CDATA[<p>We build distributed systems in <b>Go</b> and Kubernetes.</p>]]></description>
    </item>
    <item>
      <title>Product Designer</title>
      <link>https://weworkremotely.com/remote-jobs/globex-designer</link>
      <region>Europe</region>
    </item>
    <item>
      <title>No Link Role</title>
    </item>
  </channel>
</rss>`;

function adapterWith(body: string) {
  return createWeWorkRemotelyAdapter({
    fetchText: async () => body,
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("We Work Remotely discovery adapter", () => {
  it("maps RSS items to leads, splitting Company: Title and skipping linkless items", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "weworkremotely",
      url: "https://weworkremotely.com/remote-jobs/acme-senior-backend",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Anywhere in the World",
    });
  });

  it("keeps the whole title as the role when there is no Company: separator", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(refs[1]).toMatchObject({ title: "Product Designer", location: "Europe" });
    expect(refs[1]).not.toHaveProperty("companyName");
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first).not.toHaveProperty("requirements");
  });

  it("handles an empty feed", async () => {
    const refs = await adapterWith("<rss><channel></channel></rss>").discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
