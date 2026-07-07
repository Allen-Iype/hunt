/**
 * The wire-format seam of the AI package (ADR-0013): one provider = one way
 * to turn (system, user) into text. This interface is internal to @hunt/ai —
 * nothing outside this package may import it. Capabilities and adapters see
 * only domain-shaped ports from core (e.g. ExtractJobPort).
 *
 * Providers are raw HTTP over the built-in fetch — no SDK dependencies
 * (ADR-0012).
 */

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface LLMResponse {
  text: string;
}

export interface LLMProvider {
  /** Stable identifier including the model, used in cache keys and provenance. */
  readonly id: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
}

/** A provider-level failure: network, auth, quota, 5xx. */
export class ProviderError extends Error {
  override readonly name = "ProviderError";
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ProviderError(
      `request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(`${url} responded ${response.status}: ${detail}`);
  }
  return response.json();
}
