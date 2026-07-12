# Internet-Wide Job Discovery - Implementation Plan

**Goal:** Maximize job discovery opportunities across the internet by implementing all three tiers of discovery adapters.

**Status:** Planning  
**Date:** 2026-07-12  
**Context:** User needs broad keyword search across the entire internet to find maximum job opportunities, not just specific company ATS boards.

---

## Current State

Hunt has **Phase 1 discovery** implemented:
- ✅ Greenhouse adapter (ATS tier)
- ✅ Lever adapter (ATS tier)
- ✅ Ashby adapter (ATS tier)
- ✅ Discovery capability layer (`DiscoverJobs`)
- ✅ CLI commands (`hunt discover`)
- ✅ Ranking engine (`rankOpportunity`)
- ✅ Deduplication logic

**Gap:** Only covers ~3 ATS boards. Need internet-wide coverage.

---

## Three-Tier Implementation Strategy

Per `platform-strategy.md` (§4A), discovery has three tiers:

### Tier 1: ATS Boards (Structured JSON) — ✅ EXISTS
**Status:** Production-ready  
**Coverage:** Companies using Greenhouse/Lever/Ashby  
**Legal:** ✅ Public APIs, no auth  
**Quality:** ✅ Structured data, deterministic  

### Tier 2: Aggregator Feeds (RSS/JSON) — 🟡 TO BUILD
**Status:** Planned for Phase 2.1  
**Coverage:** Broad internet reach via RSS/JSON feeds  
**Legal:** ✅ Public feeds, no auth  
**Quality:** ✅ Structured data, per-source parsing  

**Target sources:**
1. **RemoteOK** - `https://remoteok.com/api` (JSON, ~1000s remote jobs)
2. **Arbeitnow** - `https://www.arbeitnow.com/api/job-board-api` (JSON, European remote)
3. **We Work Remotely** - RSS feed
4. **Hacker News Who's Hiring** - Monthly threads (HN API)
5. **Remotive** - RSS feed (if available)

### Tier 3: Third-Party Aggregator APIs — 🟡 TO BUILD
**Status:** New (not in roadmap, but fits the pattern)  
**Coverage:** Aggregators that index multiple job boards  
**Legal:** ✅ Official APIs (require API keys)  
**Quality:** ✅ Structured data, rate-limited  

**Target sources:**
1. **Adzuna** - Free tier available (aggregates Indeed, Monster, etc.)
2. **Findwork** - Free API (dev-focused jobs)
3. **The Muse** - API available (curated tech jobs)
4. **Reed API** - UK-focused (free tier)
5. **JSearch (RapidAPI)** - Aggregates LinkedIn, Indeed, Glassdoor

### Tier 4: Web Scraping (Best-Effort) — 🔴 BLOCKED
**Status:** Phase 3.2 (blocked by eval harness requirement)  
**Coverage:** Maximum reach (LinkedIn, Indeed, Glassdoor)  
**Legal:** ⚠️ Gray area, ToS concerns  
**Quality:** ⚠️ Brittle, requires eval measurement  

**Engineering contract requirement:** MUST build eval harness first (Task #3).

**Target sources (after eval harness):**
1. **LinkedIn Jobs** - Largest database, requires careful extraction
2. **Indeed** - Major aggregator, frequent DOM changes
3. **Glassdoor** - Company reviews + jobs
4. **ZipRecruiter** - Major US board
5. **SimplyHired** - Indeed-powered

---

## Implementation Sequence

### Phase A: Tier 2 — RSS/JSON Feed Adapters (Task #1)
**Blockers:** None  
**Estimated effort:** 2-3 hours  
**Deliverables:**
- `remoteok.ts` - RemoteOK JSON adapter
- `arbeitnow.ts` - Arbeitnow JSON adapter
- `weworkremotely.ts` - WWR RSS adapter
- `hackernews.ts` - HN API adapter
- Tests for each adapter
- Update discovery registry

**Success criteria:**
- `hunt discover remote-jobs` returns jobs from all 4 sources
- Deduplication works across sources
- Ranking applies correctly

### Phase B: Tier 3 — Aggregator API Adapters (Task #2)
**Blockers:** None (can run in parallel with Phase A)  
**Estimated effort:** 3-4 hours  
**Deliverables:**
- `adzuna.ts` - Adzuna API adapter (requires API key)
- `findwork.ts` - Findwork API adapter
- `jsearch.ts` - JSearch RapidAPI adapter (requires API key)
- Environment variable handling for API keys
- Tests with recorded fixtures
- Update discovery registry

**Success criteria:**
- Adapters work with API keys from env vars
- Graceful degradation when API keys missing
- Rate limiting handled properly

### Phase C: Eval Harness (Task #3)
**Blockers:** None  
**Estimated effort:** 6-8 hours  
**Deliverables:**
- `@hunt/eval` package structure
- Golden job-posting inputs (10-20 examples)
- Extraction quality metrics
- Discovery adapter test framework
- CI integration

**Success criteria:**
- Can measure extraction quality for a given adapter
- Can detect when an adapter breaks (DOM change)
- Tests run in CI without network calls

### Phase D: Tier 4 — Web Scraping Adapters (Task #4)
**Blockers:** Task #3 (eval harness) MUST be complete  
**Estimated effort:** 8-10 hours  
**Deliverables:**
- `linkedin.ts` - LinkedIn Jobs scraper (best-effort)
- `indeed.ts` - Indeed scraper
- `glassdoor.ts` - Glassdoor scraper
- Eval measurements for each
- Paste-path fallback documentation

**Success criteria:**
- Adapters pass eval quality threshold
- Graceful failure when blocked/rate-limited
- Clear error messages pointing to paste-path fallback

### Phase E: Integration (Task #5)
**Blockers:** Tasks #1, #2, #3, #4  
**Estimated effort:** 2 hours  
**Deliverables:**
- CLI updated with all new adapters
- End-to-end tests
- Performance testing (10+ sources)
- Error handling verification

**Success criteria:**
- `hunt searches add` accepts all new source types
- Discovery runs in parallel across sources
- One failed source doesn't break entire discovery

### Phase F: Documentation (Task #6)
**Blockers:** Task #5  
**Estimated effort:** 1-2 hours  
**Deliverables:**
- Example saved searches for each tier
- API key setup instructions
- Troubleshooting guide
- Expected coverage per source

---

## Technical Design Decisions

### Decision 1: API Key Handling
**Problem:** Some adapters require API keys (Adzuna, JSearch)  
**Solution:** Environment variables with graceful degradation
```
HUNT_ADZUNA_API_KEY=...
HUNT_ADZUNA_APP_ID=...
HUNT_JSEARCH_API_KEY=...
```

**Adapter behavior:**
- If key missing → skip gracefully, log warning
- If key invalid → fail fast with clear error
- Never crash entire discovery run

### Decision 2: Rate Limiting
**Problem:** API adapters have rate limits  
**Solution:**
- Respect `Retry-After` headers
- Exponential backoff on 429
- Cache responses for dev/testing
- Document rate limits per adapter

### Decision 3: Eval Harness Structure
**Problem:** Need to measure extraction quality before web scraping  
**Solution:** (Detailed design TBD in Task #3)
- Golden set: 20 representative job postings (HTML snapshots)
- Metrics: field extraction accuracy, false positive rate
- Per-adapter scoring
- CI integration with failure thresholds

### Decision 4: Error Handling Philosophy
**Problem:** Some sources will fail (rate limits, DOM changes, network)  
**Solution:**
- Fail per-source, not per-discovery
- Return partial results + error list
- User sees: "Found 500 jobs from 8/10 sources (2 failed: ...)"
- Hint system guides fixes

---

## Non-Goals

**What we're NOT building:**
- ❌ Job board hosting (no server-side aggregation)
- ❌ Standing crawler (all discovery is on-demand)
- ❌ Auto-apply (human approval always required)
- ❌ Credentialed scraping (no username/password login)
- ❌ Selenium/Puppeteer (keep it lightweight)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API rate limits hit during discovery | High | Medium | Graceful degradation, clear errors, cache for dev |
| Web scrapers break on DOM changes | High | Medium | Eval harness detects breakage, paste-path fallback |
| API keys exposed in logs | Medium | High | Never log full keys, env var validation |
| Discovery becomes slow (10+ sources) | Medium | Medium | Parallel fetching, timeout per source |
| RSS feeds go stale/404 | Medium | Low | Skip gracefully, log warning |
| ToS violations for scrapers | Low | High | Only user-directed, on-demand, honest limits, paste fallback |

---

## Success Metrics

**Coverage:**
- Tier 1 (ATS): 3 sources → ✅ (already exists)
- Tier 2 (RSS/JSON): 0 → 4-5 sources
- Tier 3 (Aggregators): 0 → 3-4 sources
- Tier 4 (Web): 0 → 3-5 sources
- **Total: 3 → 13-17 sources**

**Quality:**
- Discovery returns results in <10s for 10 sources
- Deduplication removes 80%+ duplicates
- Ranking correlates with user profile fit
- Eval harness catches 100% of broken scrapers

**User Experience:**
- One command to search 15+ sources
- Clear errors when sources fail
- No setup needed for free sources
- Simple API key setup for paid sources

---

## Next Steps

1. ✅ Document plan (this file)
2. ⏭️ Build Tier 2 adapters (RemoteOK, Arbeitnow, WWR, HN)
3. ⏭️ Build Tier 3 adapters (Adzuna, Findwork, JSearch)
4. ⏭️ Build eval harness framework
5. ⏭️ Build Tier 4 adapters (LinkedIn, Indeed, Glassdoor)
6. ⏭️ Integration testing
7. ⏭️ Documentation

**First concrete action:** Implement RemoteOK adapter as the pattern for all Tier 2 sources.
