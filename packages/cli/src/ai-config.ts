import { join } from "node:path";
import {
  createAiCoverLetterComposer,
  createAiJobExtractor,
  createAiJobInsights,
  createAiResumeComposer,
  createAiResumeExtractor,
  createAnthropicProvider,
  createFileResponseCache,
  createOllamaProvider,
  type LLMProvider,
} from "@hunt/ai";
import type {
  ComposeCoverLetterPort,
  ComposeResumePort,
  ExtractJobPort,
  ExtractResumePort,
  JobInsightsPort,
} from "@hunt/core";

/**
 * AI provider configuration from environment variables (decisions log #10;
 * a config.toml arrives when settings outgrow this):
 *
 *   ANTHROPIC_API_KEY      selects Anthropic when HUNT_AI_PROVIDER is unset
 *   HUNT_AI_PROVIDER       "anthropic" | "ollama"
 *   HUNT_AI_MODEL          model override (defaults per provider)
 *   HUNT_OLLAMA_URL        Ollama base URL (default http://localhost:11434)
 *   HUNT_OLLAMA_TIMEOUT_MS Ollama request timeout in ms (default 120000);
 *                          raise it for large local models that are slow to load
 */

const DEFAULT_MODELS = { anthropic: "claude-sonnet-5", ollama: "llama3.2" } as const;

/** Parse a positive-integer millisecond value; undefined if unset/invalid. */
function parseTimeoutMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export type AiSetup =
  | {
      extractor: ExtractJobPort;
      resumeExtractor: ExtractResumePort;
      insights: JobInsightsPort;
      resumeComposer: ComposeResumePort;
      coverLetterComposer: ComposeCoverLetterPort;
      providerId: string;
    }
  | {
      extractor: undefined;
      resumeExtractor: undefined;
      insights: undefined;
      resumeComposer: undefined;
      coverLetterComposer: undefined;
      configError?: string;
    };

/** The "no AI configured" shape, optionally carrying a config error. */
function noAi(configError?: string): AiSetup {
  return {
    extractor: undefined,
    resumeExtractor: undefined,
    insights: undefined,
    resumeComposer: undefined,
    coverLetterComposer: undefined,
    ...(configError ? { configError } : {}),
  };
}

export function buildAiSetup(huntHome: string, env: NodeJS.ProcessEnv = process.env): AiSetup {
  const providerName = env.HUNT_AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : undefined);
  if (providerName === undefined) return noAi();

  let provider: LLMProvider;
  if (providerName === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      return noAi("HUNT_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    }
    provider = createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.HUNT_AI_MODEL ?? DEFAULT_MODELS.anthropic,
    });
  } else if (providerName === "ollama") {
    const timeoutMs = parseTimeoutMs(env.HUNT_OLLAMA_TIMEOUT_MS);
    if (env.HUNT_OLLAMA_TIMEOUT_MS !== undefined && timeoutMs === undefined) {
      return noAi(
        `HUNT_OLLAMA_TIMEOUT_MS must be a positive integer (got "${env.HUNT_OLLAMA_TIMEOUT_MS}")`,
      );
    }
    provider = createOllamaProvider({
      model: env.HUNT_AI_MODEL ?? DEFAULT_MODELS.ollama,
      ...(env.HUNT_OLLAMA_URL ? { baseUrl: env.HUNT_OLLAMA_URL } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  } else {
    return noAi(`unknown HUNT_AI_PROVIDER "${providerName}" (expected "anthropic" or "ollama")`);
  }

  const cache = createFileResponseCache(join(huntHome, "cache", "ai"));
  return {
    extractor: createAiJobExtractor({ provider, cache }),
    resumeExtractor: createAiResumeExtractor({ provider, cache }),
    insights: createAiJobInsights({ provider, cache }),
    resumeComposer: createAiResumeComposer({ provider, cache }),
    coverLetterComposer: createAiCoverLetterComposer({ provider, cache }),
    providerId: provider.id,
  };
}
