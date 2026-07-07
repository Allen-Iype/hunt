import { postJson, ProviderError, type LLMProvider } from "../provider.js";

export interface OllamaOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Local provider (SDD Principle 1): Hunt's AI floor runs fully offline. */
export function createOllamaProvider(options: OllamaOptions): LLMProvider {
  const baseUrl = options.baseUrl ?? "http://localhost:11434";
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    id: `ollama:${options.model}`,

    async generate({ system, user, maxTokens }) {
      const raw = await postJson(
        `${baseUrl}/api/chat`,
        {},
        {
          model: options.model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          options: { num_predict: maxTokens },
        },
        timeoutMs,
      );
      const text = (raw as { message?: { content?: string } }).message?.content;
      if (typeof text !== "string" || text.length === 0) {
        throw new ProviderError("ollama response contained no message content");
      }
      return { text };
    },
  };
}
