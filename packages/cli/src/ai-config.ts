import { join } from "node:path";
import {
  createAiJobExtractor,
  createAnthropicProvider,
  createFileResponseCache,
  createOllamaProvider,
  type LLMProvider,
} from "@hunt/ai";
import type { ExtractJobPort } from "@hunt/core";

/**
 * AI provider configuration from environment variables (decisions log #10;
 * a config.toml arrives when settings outgrow this):
 *
 *   ANTHROPIC_API_KEY   selects Anthropic when HUNT_AI_PROVIDER is unset
 *   HUNT_AI_PROVIDER    "anthropic" | "ollama"
 *   HUNT_AI_MODEL       model override (defaults per provider)
 *   HUNT_OLLAMA_URL     Ollama base URL (default http://localhost:11434)
 */

const DEFAULT_MODELS = { anthropic: "claude-sonnet-5", ollama: "llama3.2" } as const;

export type AiSetup =
  | { extractor: ExtractJobPort; providerId: string }
  | { extractor: undefined; configError?: string };

export function buildAiSetup(huntHome: string, env: NodeJS.ProcessEnv = process.env): AiSetup {
  const providerName = env.HUNT_AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : undefined);
  if (providerName === undefined) return { extractor: undefined };

  let provider: LLMProvider;
  if (providerName === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      return { extractor: undefined, configError: "HUNT_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY" };
    }
    provider = createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.HUNT_AI_MODEL ?? DEFAULT_MODELS.anthropic,
    });
  } else if (providerName === "ollama") {
    provider = createOllamaProvider({
      model: env.HUNT_AI_MODEL ?? DEFAULT_MODELS.ollama,
      ...(env.HUNT_OLLAMA_URL ? { baseUrl: env.HUNT_OLLAMA_URL } : {}),
    });
  } else {
    return {
      extractor: undefined,
      configError: `unknown HUNT_AI_PROVIDER "${providerName}" (expected "anthropic" or "ollama")`,
    };
  }

  const cache = createFileResponseCache(join(huntHome, "cache", "ai"));
  return { extractor: createAiJobExtractor({ provider, cache }), providerId: provider.id };
}
