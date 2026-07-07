import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOllamaProvider } from "./providers/ollama.js";
import { ProviderError } from "./provider.js";

/**
 * Provider adapter contract, against stubbed fetch: sends the documented
 * wire format, extracts text, surfaces failures as ProviderError.
 */

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

const REQUEST = { system: "sys", user: "hello", maxTokens: 50 };

describe("anthropic provider", () => {
  it("sends the Messages API shape and extracts the text block", async () => {
    const calls = stubFetch(200, {
      content: [{ type: "text", text: "response!" }],
    });
    const provider = createAnthropicProvider({ apiKey: "sk-test", model: "claude-sonnet-5" });

    const result = await provider.generate(REQUEST);
    expect(result.text).toBe("response!");
    expect(provider.id).toBe("anthropic:claude-sonnet-5");

    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "claude-sonnet-5",
      max_tokens: 50,
      system: "sys",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("throws ProviderError on HTTP errors without leaking the key", async () => {
    stubFetch(401, { error: "unauthorized" });
    const provider = createAnthropicProvider({ apiKey: "sk-secret", model: "m" });
    await expect(provider.generate(REQUEST)).rejects.toThrow(ProviderError);
    await expect(provider.generate(REQUEST)).rejects.toThrow(/401/);
    await expect(provider.generate(REQUEST)).rejects.not.toThrow(/sk-secret/);
  });

  it("throws ProviderError when the response has no text block", async () => {
    stubFetch(200, { content: [] });
    const provider = createAnthropicProvider({ apiKey: "k", model: "m" });
    await expect(provider.generate(REQUEST)).rejects.toThrow(/no text block/);
  });
});

describe("ollama provider", () => {
  it("sends the chat API shape with format=json and extracts the message", async () => {
    const calls = stubFetch(200, { message: { content: `{"a":1}` } });
    const provider = createOllamaProvider({ model: "llama3.2" });

    const result = await provider.generate(REQUEST);
    expect(result.text).toBe(`{"a":1}`);
    expect(provider.id).toBe("ollama:llama3.2");

    const { url, init } = calls[0]!;
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "llama3.2",
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hello" },
      ],
    });
  });

  it("respects a custom base URL", async () => {
    const calls = stubFetch(200, { message: { content: "x" } });
    const provider = createOllamaProvider({ model: "m", baseUrl: "http://127.0.0.1:9999" });
    await provider.generate(REQUEST);
    expect(calls[0]!.url).toBe("http://127.0.0.1:9999/api/chat");
  });

  it("throws ProviderError when Ollama is unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    const provider = createOllamaProvider({ model: "m" });
    await expect(provider.generate(REQUEST)).rejects.toThrow(ProviderError);
  });
});
