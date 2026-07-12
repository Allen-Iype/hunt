# Discovery Architecture - Internet-Wide Job Search

**Companion to:** `internet-wide-job-discovery.md`  
**Date:** 2026-07-12

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  User                                                        │
│  "hunt discover my-search"                                  │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  CLI (packages/cli)                                          │
│  - Parse command                                            │
│  - Load SavedSearch                                         │
│  - Call DiscoverJobs capability                             │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  DiscoverJobs Capability (packages/capabilities)             │
│  - Load SavedSearch (intent + sources)                      │
│  - Fan out to DiscoveryPort                                 │
│  - Dedup against existing jobs/refs                         │
│  - Rank with profile (optional)                             │
│  - Persist OpportunityRefs                                  │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  DiscoveryPort (packages/ingestion)                          │
│  - Fan out to N adapters in parallel                        │
│  - Collect DiscoveredRef[]                                  │
│  - Dedup by URL                                             │
│  - Return {ok, refs} or {ok: false, errors}                 │
└────────────────────────────┬────────────────────────────────┘
                             ▼
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Tier 1: ATS    │  │  Tier 2: RSS    │  │  Tier 3: APIs   │
│  - Greenhouse   │  │  - RemoteOK     │  │  - Adzuna       │
│  - Lever        │  │  - Arbeitnow    │  │  - Findwork     │
│  - Ashby        │  │  - WWR          │  │  - JSearch      │
└─────────────────┘  │  - HN           │  └─────────────────┘
                     └─────────────────┘
                             │
                   (After eval harness)
                             ▼
                     ┌─────────────────┐
                     │  Tier 4: Web    │
                     │  - LinkedIn     │
                     │  - Indeed       │
                     │  - Glassdoor    │
                     └─────────────────┘
```

---

## Data Flow

### 1. User Creates SavedSearch

```typescript
// User input:
hunt searches add "Senior Backend Remote" \
  --roles "Backend Engineer,Senior Engineer" \
  --skills "TypeScript,Node.js,Kubernetes" \
  --remote \
  --sources \
    greenhouse:stripe \
    lever:netflix \
    remoteok:global \
    adzuna:us \
    linkedin:jobs

// Saved as:
{
  id: "search_abc123",
  name: "Senior Backend Remote",
  query: {
    roles: ["Backend Engineer", "Senior Engineer"],
    skills: ["TypeScript", "Node.js", "Kubernetes"],
    remote: true
  },
  sources: [
    { adapterId: "greenhouse", board: "stripe" },
    { adapterId: "lever", board: "netflix" },
    { adapterId: "remoteok", board: "global" },
    { adapterId: "adzuna", board: "us" },
    { adapterId: "linkedin", board: "jobs" }
  ]
}
```

### 2. Discovery Executes (Parallel)

```typescript
// DiscoveryPort fans out in parallel:
const results = await Promise.allSettled([
  greenhouseAdapter.discover({ board: "stripe", query }),
  leverAdapter.discover({ board: "netflix", query }),
  remoteokAdapter.discover({ board: "global", query }),
  adzunaAdapter.discover({ board: "us", query }),
  linkedinAdapter.discover({ board: "jobs", query }),
]);

// Each adapter returns:
[
  { sourceId: "greenhouse", url: "...", title: "...", ... },
  { sourceId: "lever", url: "...", title: "...", ... },
  // ...
]
```

### 3. Deduplication

```typescript
// By URL (primary key for jobs):
const byUrl = new Map<string, DiscoveredRef>();
for (const ref of allRefs) {
  if (!byUrl.has(ref.url)) {
    byUrl.set(ref.url, ref);
  }
}

// Also check against already-imported jobs:
for (const ref of byUrl.values()) {
  const existing = jobRepo.findByUrl(ref.url);
  if (existing) {
    // Skip, already have this job
    skipped++;
    continue;
  }
}
```

### 4. Ranking (Deterministic)

```typescript
// From core/discovery/rank.ts:
function rankOpportunity(
  ref: DiscoveredRef,
  search: SavedSearch,
  profile?: Profile
): number {
  let score = 0;

  // Intent match (roles, skills, location)
  const titleMatch = matchesRoles(ref.title, search.query.roles);
  const skillMatch = matchesSkills(ref.snippet, search.query.skills);
  const locationMatch = matchesLocation(ref.location, search.query.locations);

  score += titleMatch * 0.4;
  score += skillMatch * 0.3;
  score += locationMatch * 0.2;

  // Optional: profile enrichment
  if (profile) {
    const profileFit = computeFitScore(ref, profile);
    score += profileFit * 0.1;
  }

  return score; // 0.0 to 1.0
}
```

### 5. Persistence

```typescript
// Save as OpportunityRef:
{
  id: "opp_remoteok_abc123",
  sourceId: "remoteok",
  url: "https://remoteok.com/remote-jobs/...",
  title: "Senior Backend Engineer",
  companyName: "Stripe",
  location: "Remote",
  snippet: "We're looking for...",
  queryId: "search_abc123",
  discoveredAt: "2026-07-12T10:00:00Z",
  status: "new",
  relevance: 0.85
}
```

### 6. User Import Flow

```typescript
// User sees ranked results:
hunt discover my-search
// Output:
// 1. Senior Backend Engineer @ Stripe (0.92) - opp_gh_stripe_123
// 2. Backend Engineer @ Netflix (0.87) - opp_lever_netflix_456
// 3. Staff Engineer @ Remote (0.85) - opp_remoteok_789

// User imports:
hunt discover --import opp_remoteok_789

// This calls:
importJob({ kind: "url", url: ref.url })
// → Existing import pipeline (tiered normalization)
// → Marks ref as "imported"
```

---

## Adapter Contract

Every discovery adapter implements:

```typescript
interface DiscoveryAdapter {
  id: string;           // "remoteok", "adzuna", etc.
  version: string;      // "0.1.0"
  
  discover(input: {
    board: string;      // Adapter-specific handle
    query: SearchQuery; // User intent (may be ignored if no server-side search)
  }): Promise<DiscoveredRef[]>;
}

// Returns leads only (ADR-0015 invariant):
interface DiscoveredRef {
  sourceId: string;
  url: string;          // Primary key
  title: string;
  companyName?: string;
  location?: string;
  snippet?: string;     // Teaser only, not full description
}
```

**Key invariant:** Adapters return **leads**, not normalized Jobs. Full normalization happens only on import.

---

## Adapter Tiers - Implementation Details

### Tier 1: ATS Boards (Existing)

**Pattern:** Structured JSON from public APIs

```typescript
// Example: Greenhouse
async discover({ board }): Promise<DiscoveredRef[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
  const data = await fetchJson<GhResponse>(url);
  
  return data.jobs.map(job => ({
    sourceId: "greenhouse",
    url: job.absolute_url,
    title: job.title,
    companyName: job.company_name,
    location: job.location?.name,
    snippet: htmlTeaser(job.content)
  }));
}
```

**Characteristics:**
- ✅ No auth required
- ✅ Stable APIs
- ✅ Structured data
- ✅ Fast (<500ms per board)
- ❌ Limited to companies using that ATS

### Tier 2: RSS/JSON Feeds (To Build)

**Pattern:** Public feeds, simple parsing

```typescript
// Example: RemoteOK
async discover(): Promise<DiscoveredRef[]> {
  const url = "https://remoteok.com/api";
  const jobs = await fetchJson<RemoteOKJob[]>(url);
  
  return jobs.slice(1).map(job => ({ // Skip metadata row
    sourceId: "remoteok",
    url: job.url,
    title: job.position,
    companyName: job.company,
    location: job.location,
    snippet: htmlTeaser(job.description)
  }));
}
```

**Characteristics:**
- ✅ No auth required
- ✅ Broad coverage (1000s of jobs)
- ⚠️ No server-side filtering (client-side ranking)
- ⚠️ Feed freshness varies

### Tier 3: Aggregator APIs (To Build)

**Pattern:** Official APIs with authentication

```typescript
// Example: Adzuna
async discover({ board, query }): Promise<DiscoveredRef[]> {
  const apiKey = process.env.HUNT_ADZUNA_API_KEY;
  if (!apiKey) throw new Error("HUNT_ADZUNA_API_KEY required");
  
  const url = `https://api.adzuna.com/v1/api/jobs/${board}/search/1`;
  const params = {
    app_id: process.env.HUNT_ADZUNA_APP_ID,
    app_key: apiKey,
    what: query.roles[0],
    where: query.locations[0]
  };
  
  const data = await fetchJson<AdzunaResponse>(url, { params });
  
  return data.results.map(job => ({
    sourceId: "adzuna",
    url: job.redirect_url,
    title: job.title,
    companyName: job.company.display_name,
    location: job.location.display_name,
    snippet: htmlTeaser(job.description)
  }));
}
```

**Characteristics:**
- ⚠️ Requires API key
- ✅ Server-side search (fast, relevant)
- ✅ Broad coverage (aggregates many sources)
- ⚠️ Rate limits (free tier: ~100 req/day)

### Tier 4: Web Scraping (Blocked Until Eval)

**Pattern:** DOM parsing with quality measurement

```typescript
// Example: LinkedIn (after eval harness)
async discover({ query }): Promise<DiscoveredRef[]> {
  const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query.roles[0])}`;
  const html = await fetchPage(url);
  const $ = parse(html);
  
  const jobs = $('.job-card').map(card => ({
    sourceId: "linkedin",
    url: card.querySelector('a')?.href,
    title: card.querySelector('.job-title')?.text,
    companyName: card.querySelector('.company-name')?.text,
    location: card.querySelector('.location')?.text,
    snippet: card.querySelector('.description')?.text
  }));
  
  // Must pass eval quality threshold before returning
  const quality = await evalHarness.measure(jobs);
  if (quality < THRESHOLD) {
    throw new Error("Extraction quality below threshold - DOM may have changed");
  }
  
  return jobs;
}
```

**Characteristics:**
- ⚠️ Brittle (breaks on DOM changes)
- ⚠️ May require auth
- ⚠️ Rate limiting
- ⚠️ ToS gray area
- ✅ Massive coverage
- ✅ Eval harness catches breakage

---

## Error Handling Strategy

### Per-Source Failures

Discovery continues even if some sources fail:

```typescript
// DiscoveryPort implementation:
const errors: string[] = [];
const refs: DiscoveredRef[] = [];

for (const source of sources) {
  try {
    const results = await adapter.discover({ board, query });
    refs.push(...results);
  } catch (err) {
    errors.push(`${source.adapterId}: ${err.message}`);
  }
}

// Return partial results:
if (refs.length === 0 && errors.length > 0) {
  return { ok: false, stage: "fetch", message: errors.join("; ") };
}

return { ok: true, refs, warnings: errors };
```

### User Experience

```bash
$ hunt discover my-search

✓ Found 450 jobs from 8/10 sources (ranked by relevance)
⚠ 2 sources failed:
  - adzuna: Rate limit exceeded (retry in 1 hour)
  - linkedin: Extraction quality below threshold

Top matches:
1. Senior Backend Engineer @ Stripe (0.92)
2. Backend Engineer @ Netflix (0.87)
...
```

---

## Performance Considerations

### Parallel Fetching

All adapters run in parallel:

```typescript
const results = await Promise.allSettled(
  sources.map(s => adapter.discover({ board: s.board, query }))
);
```

**Expected timing:**
- Single ATS: ~500ms
- Single RSS feed: ~1-2s
- Single API: ~1-3s
- Single scraper: ~3-5s
- **10 sources in parallel: ~5-8s total**

### Timeouts

Per-source timeout to prevent hangs:

```typescript
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);

// 10s timeout per source
await withTimeout(adapter.discover(...), 10000);
```

### Caching (Development Only)

For dev/testing, cache raw responses:

```typescript
const cacheKey = `${adapterId}:${board}:${hash(query)}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;

const results = await adapter.discover(...);
await cache.set(cacheKey, results, { ttl: 3600 });
```

---

## Next Implementation Steps

1. ✅ Document architecture (this file)
2. ⏭️ Implement RemoteOK adapter (Tier 2 pattern)
3. ⏭️ Implement Arbeitnow adapter
4. ⏭️ Implement WWR adapter
5. ⏭️ Implement HN adapter
6. ⏭️ Implement Adzuna adapter (Tier 3 pattern)
7. ⏭️ Build eval harness framework
8. ⏭️ Implement LinkedIn adapter (Tier 4 pattern)
9. ⏭️ Integration testing
10. ⏭️ Documentation
