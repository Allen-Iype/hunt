import { postJson, ProviderError, type LLMProvider } from "../provider.js";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export function createAnthropicProvider(options: AnthropicOptions): LLMProvider {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    id: `anthropic:${options.model}`,

    async generate({ system, user, maxTokens }) {
      const raw = await postJson(
        `${baseUrl}/v1/messages`,
        { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: options.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        },
        timeoutMs,
      );
      const content = (raw as { content?: { type: string; text?: string }[] }).content;
      const text = content?.find((c) => c.type === "text")?.text;
      if (typeof text !== "string") {
        throw new ProviderError("anthropic response contained no text block");
      }
      return { text };
    },
  };
}
