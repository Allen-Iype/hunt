import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runStructuredTask, type AiTask } from "./gateway.js";
import { ProviderError, type LLMProvider } from "./provider.js";
import type { ResponseCache } from "./cache.js";

const TASK: AiTask<{ q: string }, { answer: string }> = {
  id: "test-task",
  version: 1,
  maxTokens: 100,
  instructions: "Answer.",
  outputSchema: z.object({ answer: z.string().min(1) }),
  renderInput: ({ q }) => q,
};

/** Provider returning scripted responses in order; records calls. */
function scripted(...responses: (string | Error)[]): LLMProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "fake:model",
    calls,
    async generate({ user }) {
      calls.push(user);
      const next = responses.shift();
      if (next === undefined) throw new Error("scripted provider exhausted");
      if (next instanceof Error) throw next;
      return { text: next };
    },
  };
}

function memoryCache(): ResponseCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: (k) => store.get(k) ?? null, put: (k, v) => void store.set(k, v) };
}

describe("runStructuredTask", () => {
  it("returns validated output for a clean response", async () => {
    const provider = scripted(`{"answer": "42"}`);
    const result = await runStructuredTask({ provider }, TASK, { q: "?" });
    expect(result).toMatchObject({ ok: true, output: { answer: "42" }, cached: false });
  });

  it("tolerates code fences", async () => {
    const provider = scripted("```json\n{\"answer\": \"42\"}\n```");
    const result = await runStructuredTask({ provider }, TASK, { q: "?" });
    expect(result).toMatchObject({ ok: true, output: { answer: "42" } });
  });

  it("repairs once on invalid output, telling the model what was wrong", async () => {
    const provider = scripted(`{"wrong": true}`, `{"answer": "fixed"}`);
    const result = await runStructuredTask({ provider }, TASK, { q: "?" });
    expect(result).toMatchObject({ ok: true, output: { answer: "fixed" } });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]).toContain("previous response was rejected");
  });

  it("fails after the bounded repair attempt", async () => {
    const provider = scripted("not json", "still not json");
    const result = await runStructuredTask({ provider }, TASK, { q: "?" });
    expect(result).toMatchObject({ ok: false, kind: "invalid-output" });
  });

  it("surfaces provider errors without retrying", async () => {
    const provider = scripted(new ProviderError("rate limited"));
    const result = await runStructuredTask({ provider }, TASK, { q: "?" });
    expect(result).toMatchObject({ ok: false, kind: "provider", message: "rate limited" });
    expect(provider.calls).toHaveLength(1);
  });

  it("caches successful responses and serves them without a provider call", async () => {
    const cache = memoryCache();
    const first = scripted(`{"answer": "cached"}`);
    await runStructuredTask({ provider: first, cache }, TASK, { q: "same" });

    const second = scripted();
    const result = await runStructuredTask({ provider: second, cache }, TASK, { q: "same" });
    expect(result).toMatchObject({ ok: true, output: { answer: "cached" }, cached: true });
    expect(second.calls).toHaveLength(0);
  });

  it("keys the cache by input: different input misses", async () => {
    const cache = memoryCache();
    await runStructuredTask({ provider: scripted(`{"answer": "a"}`), cache }, TASK, { q: "one" });
    const result = await runStructuredTask(
      { provider: scripted(`{"answer": "b"}`), cache },
      TASK,
      { q: "two" },
    );
    expect(result).toMatchObject({ ok: true, output: { answer: "b" }, cached: false });
  });

  it("replay mode: hit succeeds, miss errors, provider never called (SDD §20)", async () => {
    const cache = memoryCache();
    await runStructuredTask({ provider: scripted(`{"answer": "rec"}`), cache }, TASK, { q: "rec" });

    const provider = scripted();
    const hit = await runStructuredTask({ provider, cache, mode: "replay" }, TASK, { q: "rec" });
    expect(hit).toMatchObject({ ok: true, output: { answer: "rec" }, cached: true });

    const miss = await runStructuredTask({ provider, cache, mode: "replay" }, TASK, { q: "new" });
    expect(miss).toMatchObject({ ok: false, kind: "replay-miss" });
    expect(provider.calls).toHaveLength(0);
  });
});
