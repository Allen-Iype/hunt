/** Honest, identified fetching (SDD §21): no user-agent spoofing, ever. */
export const HUNT_USER_AGENT = "hunt-cli/0.1 (local-first career OS)";

export class FetchError extends Error {
  override readonly name = "FetchError";
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export async function fetchPage(url: string, timeoutMs = 20_000): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": HUNT_USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(
      `could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      "check the URL and your network, or paste the posting instead: hunt import -",
    );
  }
  if (!response.ok) {
    throw new FetchError(
      `${url} responded with HTTP ${response.status}`,
      "the site may block automated fetching — paste the posting instead: hunt import -",
    );
  }
  return response.text();
}

/**
 * Honest text fetch for discovery adapters hitting public RSS/XML feeds
 * (ADR-0015, Tier-2). Same identified user-agent; XML accept header; typed
 * error on transport failure. Returns the raw feed body for the adapter to
 * parse.
 */
export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": HUNT_USER_AGENT, accept: "application/rss+xml, application/xml, text/xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(
      `could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      "check the feed URL and your network",
    );
  }
  if (!response.ok) {
    throw new FetchError(`${url} responded with HTTP ${response.status}`, "the feed may have moved");
  }
  return response.text();
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  /** Extra request headers, e.g. an `authorization` token for Tier-3 aggregator APIs. */
  headers?: Record<string, string>;
}

/**
 * Honest JSON fetch for discovery adapters hitting public board APIs
 * (ADR-0015). Same identified user-agent; JSON accept header; typed error on
 * transport or parse failure. Optional `headers` carry per-adapter auth (Tier-3
 * APIs) without leaking the key into the URL or logs.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 20_000, headers } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": HUNT_USER_AGENT, accept: "application/json", ...headers },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(
      `could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      "check the board handle and your network",
    );
  }
  if (!response.ok) {
    throw new FetchError(`${url} responded with HTTP ${response.status}`, "check the board handle");
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new FetchError(`${url} did not return valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}
