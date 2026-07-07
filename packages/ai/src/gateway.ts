import { createHash } from "node:crypto";
import { z } from "zod";
import type { ResponseCache } from "./cache.js";
import { ProviderError, type LLMProvider } from "./provider.js";

/**
 * The AI gateway (SDD §15): every AI call is a named, versioned task with a
 * typed input renderer and a Zod output schema. Cross-cutting concerns —
 * schema validation, bounded repair retry, caching, record/replay — are
 * implemented here exactly once.
 */

export interface AiTask<TInput, TOutput> {
  id: string;
  version: number;
  /** What the model is: instructions, extraction rules, honesty constraints. */
  instructions: string;
  outputSchema: z.ZodType<TOutput>;
  renderInput(input: TInput): string;
  maxTokens: number;
}

export type GatewayMode = "live" | "replay";

export interface GatewayOptions {
  provider: LLMProvider;
  cache?: ResponseCache;
  /** "replay": never call the provider; a cache miss is an error (CI mode). */
  mode?: GatewayMode;
}

export type TaskFailure = {
  ok: false;
  kind: "provider" | "invalid-output" | "replay-miss";
  message: string;
};
export type TaskResult<TOutput> =
  | { ok: true; output: TOutput; taskVersion: number; providerId: string; cached: boolean }
  | TaskFailure;

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/m.exec(trimmed);
  return fenced ? fenced[1]! : trimmed;
}

function tryParse<TOutput>(
  schema: z.ZodType<TOutput>,
  text: string,
): { ok: true; value: TOutput } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${err instanceof Error ? err.message : err}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: z.prettifyError(parsed.error) };
}

export async function runStructuredTask<TInput, TOutput>(
  options: GatewayOptions,
  task: AiTask<TInput, TOutput>,
  input: TInput,
): Promise<TaskResult<TOutput>> {
  const { provider, cache, mode = "live" } = options;
  const jsonSchema = z.toJSONSchema(task.outputSchema, { io: "input" });

  const system =
    `${task.instructions}\n\n` +
    `Respond with ONLY a single JSON object — no prose, no code fences — that validates against this JSON Schema:\n` +
    JSON.stringify(jsonSchema);
  const user = task.renderInput(input);
  const cacheKey = createHash("sha256")
    .update(`${task.id}|${task.version}|${provider.id}|${user}`)
    .digest("hex");

  const cached = cache?.get(cacheKey) ?? null;
  if (cached !== null) {
    const parsed = tryParse(task.outputSchema, cached);
    if (parsed.ok) {
      return {
        ok: true,
        output: parsed.value,
        taskVersion: task.version,
        providerId: provider.id,
        cached: true,
      };
    }
    // A cached response that no longer validates (schema evolved) falls through to a live call.
  }
  if (mode === "replay") {
    return {
      ok: false,
      kind: "replay-miss",
      message: `no recorded response for task ${task.id}@${task.version} (key ${cacheKey.slice(0, 12)}…)`,
    };
  }

  let lastError = "";
  let request = { system, user, maxTokens: task.maxTokens };
  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string;
    try {
      ({ text } = await provider.generate(request));
    } catch (err) {
      if (err instanceof ProviderError) {
        return { ok: false, kind: "provider", message: err.message };
      }
      throw err;
    }
    const parsed = tryParse(task.outputSchema, text);
    if (parsed.ok) {
      cache?.put(cacheKey, text);
      return {
        ok: true,
        output: parsed.value,
        taskVersion: task.version,
        providerId: provider.id,
        cached: false,
      };
    }
    lastError = parsed.error;
    // One bounded repair attempt (SDD §15): show the model its own error.
    request = {
      system,
      user:
        `${user}\n\n` +
        `Your previous response was rejected: ${lastError}\n` +
        `Respond again with ONLY a valid JSON object.`,
      maxTokens: task.maxTokens,
    };
  }
  return {
    ok: false,
    kind: "invalid-output",
    message: `output failed schema validation after repair attempt: ${lastError}`,
  };
}
