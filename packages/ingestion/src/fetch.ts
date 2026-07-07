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
